"""
Gmail Import V1 — manual, import-only, review-before-save, privacy-first.

A user explicitly searches their own Gmail, selects specific ATTACHMENTS, and
imports them into CertaNest. This module:

* searches the user's own messages (safe metadata only — never the body/snippet),
* lists a message's attachments (safe metadata only),
* validates each selected attachment's type/size,
* skips duplicates (idempotency via ``ImportedGmailAttachment``),
* downloads ONLY the explicitly-selected attachments and saves them through the
  EXISTING validated + encrypted upload path, respecting plan/storage limits,
* records safe audit/operational events.

It NEVER scans the inbox automatically, runs in the background, reads/stores email
bodies, writes back to Gmail (no modify/delete/archive/label/send), or calls AI.
Tokens, raw Gmail responses, email bodies, snippets, download URLs, and attachment
content are never logged or returned to the frontend.

The destination + encrypted-save plumbing is shared with Drive import
(``apps.integrations.drive_import``) — Gmail does not re-implement it.
"""

from __future__ import annotations

import hashlib
import logging

from django.conf import settings

from apps.core.security import file_validation
from apps.documents.constants import ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE
from apps.documents.folders import FolderError
from apps.documents.plan_usage import (
    PlanLimitExceeded,
    enforce_plan_limit,
    enforce_storage_limit,
)

from . import events
from .drive_import import (  # shared, provider-agnostic import plumbing
    MAX_FILES_PER_IMPORT,
    DriveImportError as ImportDestinationError,
    _ensure_provider_and_token,
    _provider_reason,
    _save_to_destination,
    _stored_filename,
    build_destination_options,
    resolve_destination,
)
from .models import ImportedGmailAttachment
from .providers.base import ProviderError, ProviderNotConfigured
from .providers.google import build_gmail_message_payload

logger = logging.getLogger("duenest.integrations")

# Re-exported so views can catch a single destination error type.
GmailImportError = ImportDestinationError

# File-type filter -> Gmail `filename:` search operator.
_FILE_TYPE_QUERY = {
    "pdf": "filename:pdf",
    "image": "(filename:png OR filename:jpg OR filename:jpeg)",
    "doc": "(filename:doc OR filename:docx)",
}

# Safe message fields surfaced to the client (never body/snippet/raw headers).
_SAFE_MESSAGE_FIELDS = (
    "provider_message_id", "thread_id", "from_display", "from_email",
    "subject", "date", "attachment_count",
)


# ---- Idempotency -----------------------------------------------------------


def _gmail_salt() -> str:
    return (
        getattr(settings, "INTEGRATIONS_OAUTH_STATE_SALT", "")
        or getattr(settings, "AUDIT_LOG_HASH_SALT", "")
        or settings.SECRET_KEY
    )


def _hash_id(value: str) -> str:
    return hashlib.sha256(f"{_gmail_salt()}:{value}".encode("utf-8")).hexdigest()


def _is_duplicate(user, account, message_id: str, attachment_id: str) -> bool:
    if not message_id or not attachment_id:
        return False
    return ImportedGmailAttachment.objects.filter(
        user=user,
        account=account,
        provider_message_id_hash=_hash_id(message_id),
        provider_attachment_id_hash=_hash_id(attachment_id),
        status=ImportedGmailAttachment.Status.IMPORTED,
    ).exists()


# ---- Validation ------------------------------------------------------------


def validate_gmail_attachment_for_import(att: dict) -> tuple[bool, str, dict | None]:
    """Decide whether a Gmail attachment can be imported. Returns
    ``(ok, reason, plan)``."""
    if not att.get("downloadable", True):
        return False, "not_downloadable", None
    mime = att.get("mime_type", "")
    size = att.get("size")
    if size is not None and size == 0:
        return False, "empty_file", None
    if mime not in ALLOWED_CONTENT_TYPES:
        return False, "unsupported_type", None
    if size is not None and size > MAX_FILE_SIZE:
        return False, "too_large", None
    return True, "", {"content_type": mime}


# ---- Search / listing ------------------------------------------------------


def _gmail_date(value: str) -> str:
    # Gmail search expects YYYY/MM/DD; accept YYYY-MM-DD too.
    return str(value or "").strip().replace("-", "/")[:10]


def build_gmail_query(filters: dict) -> str:
    parts = ["has:attachment"]
    q = (filters.get("query") or "").strip().replace("\n", " ").replace("\r", " ")
    if q:
        parts.append(q[:200])
    fr = (filters.get("from_email") or "").strip().replace(" ", "")
    if fr:
        parts.append(f"from:{fr[:120]}")
    if filters.get("date_min"):
        parts.append(f"after:{_gmail_date(filters['date_min'])}")
    if filters.get("date_max"):
        parts.append(f"before:{_gmail_date(filters['date_max'])}")
    ft = _FILE_TYPE_QUERY.get(filters.get("file_type"))
    if ft:
        parts.append(ft)
    if len(parts) == 1:
        parts.append("newer_than:1y")
    return " ".join(parts)


def _safe_message(msg: dict, user, account) -> dict:
    out = {k: msg[k] for k in _SAFE_MESSAGE_FIELDS if k in msg}
    out["attachments"] = [
        {
            **a,
            "already_imported": _is_duplicate(
                user, account, a["provider_message_id"], a["provider_attachment_id"]
            ),
        }
        for a in msg.get("attachments", [])
    ]
    return out


def search_gmail_import_messages(user, account, filters, *, request=None) -> dict:
    provider, token = _ensure_provider_and_token(account)
    query = build_gmail_query(filters or {})
    search = provider.search_gmail_messages(
        access_token=token,
        query=query,
        page_token=(filters or {}).get("page_token") or None,
        page_size=int((filters or {}).get("page_size") or 20),
    )
    messages = []
    for mid in search["message_ids"]:
        try:
            raw = provider.get_gmail_message(access_token=token, message_id=mid)
        except ProviderError:
            continue  # skip an unreadable message; never abort the search
        messages.append(_safe_message(build_gmail_message_payload(raw), user, account))
    events.record_gmail_import_audit(
        user=user, event_type=events.GM_SEARCH_PERFORMED, account=account,
        status="searched", request=request,
    )
    return {"messages": messages, "next_page_token": search["next_page_token"]}


def list_gmail_message_attachments(user, account, message_id: str) -> dict:
    provider, token = _ensure_provider_and_token(account)
    raw = provider.get_gmail_message(access_token=token, message_id=message_id)
    msg = _safe_message(build_gmail_message_payload(raw), user, account)
    return {
        "message": {k: msg[k] for k in _SAFE_MESSAGE_FIELDS if k in msg},
        "attachments": msg["attachments"],
    }


# ---- Per-attachment import -------------------------------------------------


def _result(name, status, reason="", *, document_id=None, file_id=None):
    return {
        "filename": name,
        "status": status,
        "reason": reason,
        "document_id": document_id,
        "file_id": file_id,
    }


def import_single_gmail_attachment(
    user, *, account, provider, access_token, att_ref, dest, force=False
):
    """Import one selected Gmail attachment. Returns a per-attachment result dict;
    never raises (a single failure must not abort the batch)."""
    msg_id = str((att_ref or {}).get("provider_message_id") or "")
    att_id = str((att_ref or {}).get("provider_attachment_id") or "")
    name_hint = str((att_ref or {}).get("filename") or "attachment")
    if not msg_id or not att_id:
        return _result(name_hint, "failed", "provider_error")

    if not force and _is_duplicate(user, account, msg_id, att_id):
        return _result(name_hint, "skipped", "already_imported")

    # Authoritative metadata: re-fetch the message and locate the attachment.
    try:
        raw = provider.get_gmail_message(access_token=access_token, message_id=msg_id)
    except ProviderError as exc:
        return _result(name_hint, "failed", _provider_reason(exc.code))
    msg = build_gmail_message_payload(raw)
    att = next(
        (a for a in msg["attachments"] if a["provider_attachment_id"] == att_id), None
    )
    if att is None:
        return _result(name_hint, "failed", "not_downloadable")

    ok, reason, plan = validate_gmail_attachment_for_import(att)
    if not ok:
        return _result(att["filename"] or name_hint, "failed", reason)

    filename = _stored_filename(att["filename"] or name_hint, plan["content_type"])

    try:
        enforce_plan_limit(user, dest.count_resource)
    except PlanLimitExceeded:
        return _result(filename, "failed", "limit_reached")

    try:
        data = provider.download_gmail_attachment(
            access_token=access_token, message_id=msg_id, attachment_id=att_id,
            max_bytes=MAX_FILE_SIZE,
        )
    except ProviderError as exc:
        reason = "too_large" if exc.code == "too_large" else _provider_reason(exc.code)
        return _result(filename, "failed", reason)
    if not data:
        return _result(filename, "failed", "empty_file")

    try:
        enforce_storage_limit(user, len(data))
    except PlanLimitExceeded:
        return _result(filename, "failed", "storage_error")

    try:
        document_file, document = _save_to_destination(
            user, dest, data, filename, plan["content_type"]
        )
    except file_validation.MalwareScanUnavailable:
        return _result(filename, "failed", "scan_unavailable")
    except file_validation.SecureUploadError:
        return _result(filename, "failed", "invalid_file")
    except PlanLimitExceeded:
        return _result(filename, "failed", "limit_reached")
    except FolderError:
        return _result(filename, "failed", "invalid_destination")
    except Exception:  # noqa: BLE001 - storage/encryption failure, fail this one only
        logger.warning("gmail import save failed", exc_info=True)
        return _result(filename, "failed", "storage_error")

    # Idempotency record (hashed ids + safe file metadata only).
    try:
        ImportedGmailAttachment.objects.update_or_create(
            user=user,
            account=account,
            provider_message_id_hash=_hash_id(msg_id),
            provider_attachment_id_hash=_hash_id(att_id),
            defaults={
                "imported_document": document,
                "imported_file": document_file,
                "status": ImportedGmailAttachment.Status.IMPORTED,
                "sanitized_metadata": {
                    "filename": filename,
                    "mime_type": plan["content_type"],
                    "size": len(data),
                },
            },
        )
    except Exception:  # noqa: BLE001 - dedup bookkeeping must not fail the import
        logger.warning("gmail dedup record failed", exc_info=True)

    return _result(
        filename, "imported",
        document_id=getattr(document, "id", None),
        file_id=getattr(document_file, "id", None),
    )


# ---- Batch entry points ----------------------------------------------------


def preview_gmail_attachment_import(user, account, attachments, destination, *, request=None) -> dict:
    """Advisory preview (no download/save): validate type/size + flag duplicates."""
    dest = resolve_destination(user, destination)
    results = []
    importable = 0
    skipped = 0
    for ref in (attachments or [])[:MAX_FILES_PER_IMPORT]:
        msg_id = str((ref or {}).get("provider_message_id") or "")
        att_id = str((ref or {}).get("provider_attachment_id") or "")
        filename = str((ref or {}).get("filename") or "")
        if _is_duplicate(user, account, msg_id, att_id):
            results.append({"provider_message_id": msg_id, "provider_attachment_id": att_id,
                            "filename": filename, "status": "skipped", "reason": "already_imported"})
            skipped += 1
            continue
        ok, reason, _plan = validate_gmail_attachment_for_import(
            {"mime_type": (ref or {}).get("mime_type", ""), "size": (ref or {}).get("size"),
             "downloadable": True}
        )
        results.append({"provider_message_id": msg_id, "provider_attachment_id": att_id,
                        "filename": filename, "status": "will_import" if ok else "skipped",
                        "reason": reason})
        if ok:
            importable += 1
        else:
            skipped += 1
    warnings = ["Imported attachments count toward your storage and document limits."]
    if len(attachments or []) > MAX_FILES_PER_IMPORT:
        warnings.append(f"Only the first {MAX_FILES_PER_IMPORT} attachments can be imported at once.")
    events.record_gmail_import_audit(
        user=user, event_type=events.GM_IMPORT_PREVIEWED, account=account,
        status="previewed", destination_type=dest.type, request=request,
    )
    return {
        "destination": {"type": dest.type},
        "importable_count": importable,
        "skipped_count": skipped,
        "results": results,
        "warnings": warnings,
    }


def import_gmail_attachments(user, account, attachments, destination, *, force=False, request=None) -> dict:
    """Import the selected Gmail attachments. Per-attachment failures are isolated."""
    dest = resolve_destination(user, destination)
    try:
        provider, token = _ensure_provider_and_token(account)
    except ProviderNotConfigured:
        raise GmailImportError("Google integration is not configured.", code="not_configured")
    except ProviderError:
        raise GmailImportError(
            "Could not refresh the Google connection. Reconnect and try again.",
            code="reauth_required",
        )

    selected = (attachments or [])[:MAX_FILES_PER_IMPORT]
    events.record_gmail_import_audit(
        user=user, event_type=events.GM_IMPORT_STARTED, account=account,
        status="started", destination_type=dest.type, request=request,
    )

    results = []
    for ref in selected:
        res = import_single_gmail_attachment(
            user, account=account, provider=provider, access_token=token,
            att_ref=ref, dest=dest, force=force,
        )
        results.append(res)
        if res["status"] == "imported":
            events.record_gmail_import_audit(
                user=user, event_type=events.GM_ATTACHMENT_IMPORTED, account=account,
                status="imported", destination_type=dest.type,
                object_label=res["filename"], request=request,
            )
        elif res["status"] == "skipped":
            events.record_gmail_import_audit(
                user=user, event_type=events.GM_ATTACHMENT_SKIPPED, account=account,
                status="skipped", reason=res["reason"], destination_type=dest.type,
                object_label=res["filename"], request=request,
            )
        else:
            events.record_gmail_import_audit(
                user=user, event_type=events.GM_ATTACHMENT_FAILED, account=account,
                status="failed", reason=res["reason"], destination_type=dest.type,
                object_label=res["filename"], request=request,
            )

    imported = sum(1 for r in results if r["status"] == "imported")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    failed = sum(1 for r in results if r["status"] == "failed")
    batch_status = (
        "succeeded" if failed == 0 and imported
        else ("skipped" if imported == 0 and failed == 0 and skipped
              else ("failed" if imported == 0 else "partial"))
    )

    events.record_gmail_import_audit(
        user=user, event_type=events.GM_IMPORT_COMPLETED, account=account,
        status=batch_status, destination_type=dest.type, request=request,
    )
    events.record_gmail_import_operational(
        user=user, status=batch_status, imported_count=imported, skipped_count=skipped,
        failed_count=failed, destination_type=dest.type, attachment_count=len(results),
        request=request,
    )

    warnings = []
    if len(attachments or []) > MAX_FILES_PER_IMPORT:
        warnings.append(f"Only the first {MAX_FILES_PER_IMPORT} attachments were imported.")
    return {
        "status": "completed" if results else "empty",
        "imported_count": imported,
        "skipped_count": skipped,
        "failed_count": failed,
        "destination": {"type": dest.type},
        "results": results,
        "warnings": warnings,
    }
