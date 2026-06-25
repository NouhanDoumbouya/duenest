"""
Google Drive Import V1 — manual, import-only, review-before-save.

A user explicitly selects Drive files and imports them into CertaNest. This
module:

* lists/searches the user's own Drive files (safe metadata only),
* validates each file's type/size against the existing upload rules,
* downloads (or exports Google-native files to PDF) the SELECTED files only,
* saves them through the EXISTING validated + encrypted upload path
  (``validate_secure_upload`` + ``encrypt_bytes_into_record``), respecting plan
  and storage limits,
* records safe audit/operational events.

It NEVER writes back to, modifies, deletes, or shares Drive files; never syncs;
never runs in the background; never calls AI. Tokens, download URLs, and raw
Google API responses are never logged or returned to the frontend.
"""

from __future__ import annotations

import hashlib
import logging

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.core.security import file_validation
from apps.documents.constants import (
    ALLOWED_CONTENT_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
)
from apps.documents.file_encryption import encrypt_bytes_into_record
from apps.documents.folders import FolderError, assign_document_to_folder
from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
    DocumentFolder,
)
from apps.documents.plan_usage import (
    PlanLimitExceeded,
    enforce_plan_limit,
    enforce_storage_limit,
)
from apps.users import plans as user_plans

from . import events
from .models import ConnectedIntegrationAccount
from .providers.base import ProviderError, ProviderNotConfigured, get_provider
from .providers.google import build_drive_file_payload

logger = logging.getLogger("duenest.integrations")

# Per-import safety cap (manual import; not a sync). Mirrors a reasonable batch.
MAX_FILES_PER_IMPORT = 25

# Canonical extension(s) accepted for each supported content type.
_MIME_EXTS = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
}


class DriveImportError(Exception):
    """A user-correctable problem (bad destination, no account). Carries a code."""

    def __init__(self, message: str, *, code: str = "invalid_request"):
        self.code = code
        super().__init__(message)


# ---- Destinations ----------------------------------------------------------


class _Destination:
    def __init__(self, type_: str, *, folder=None, bundle=None):
        self.type = type_
        self.folder = folder
        self.bundle = bundle

    @property
    def count_resource(self) -> str:
        # File Inbox creates a loose file; vault/folder/pack create a Document.
        return (
            user_plans.RESOURCE_FILES
            if self.type == "file_inbox"
            else user_plans.RESOURCE_DOCUMENTS
        )


def resolve_destination(user, destination: dict) -> _Destination:
    """Validate the requested destination is owned by ``user``. Org destinations
    are deferred in V1 and rejected with a clear code."""
    dtype = (destination or {}).get("type") or "file_inbox"
    if dtype in ("file_inbox", "vault"):
        return _Destination(dtype)
    if dtype == "folder":
        folder = DocumentFolder.objects.filter(
            id=(destination or {}).get("folder_id"), owner=user
        ).first()
        if folder is None:
            raise DriveImportError("Folder not found.", code="invalid_destination")
        return _Destination("folder", folder=folder)
    if dtype == "pack":
        bundle = DocumentBundle.objects.filter(
            id=(destination or {}).get("pack_id"), owner=user
        ).first()
        if bundle is None:
            raise DriveImportError("Pack not found.", code="invalid_destination")
        return _Destination("pack", bundle=bundle)
    if dtype in ("org_case", "org_folder", "org_pack"):
        raise DriveImportError(
            "Organization destinations are not available yet.",
            code="destination_not_supported",
        )
    raise DriveImportError("Unknown destination.", code="invalid_destination")


def build_destination_options(user) -> dict:
    """Safe destination choices for the picker (owner-scoped, no secrets)."""
    folders = DocumentFolder.objects.filter(owner=user).order_by("name")[:200]
    packs = DocumentBundle.objects.filter(owner=user).order_by("-created_at")[:200]
    return {
        "fixed": [
            {"type": "file_inbox", "label": "File Inbox"},
            {"type": "vault", "label": "Vault"},
        ],
        "folders": [{"id": f.id, "name": f.name} for f in folders],
        "packs": [{"id": p.id, "title": p.title} for p in packs],
        "org_supported": False,
    }


# ---- Token / provider ------------------------------------------------------


def _ensure_provider_and_token(account):
    provider = get_provider(account.provider)
    if provider is None or not provider.is_configured():
        raise ProviderNotConfigured()
    token = account.get_access_token()
    if token and not account.is_token_expired:
        return provider, token
    refresh_token = account.get_refresh_token()
    if not refresh_token:
        raise ProviderError("No refresh token.", code="no_refresh_token")
    tokens = provider.refresh_tokens(refresh_token=refresh_token)
    account.set_tokens(
        access_token=tokens.access_token, refresh_token=tokens.refresh_token
    )
    account.token_expires_at = tokens.expires_at
    account.last_refresh_at = timezone.now()
    account.status = ConnectedIntegrationAccount.Status.CONNECTED
    account.save()
    return provider, tokens.access_token


# ---- Validation ------------------------------------------------------------


def validate_drive_file_for_import(meta: dict) -> tuple[bool, str, dict | None]:
    """Decide whether a Drive file can be imported and how. Returns
    ``(ok, reason, plan)`` where plan describes the download/export."""
    if meta.get("is_folder"):
        return False, "unsupported_type", None
    mime = meta.get("mime_type", "")
    if meta.get("exportable"):
        return True, "", {
            "export_mime": meta.get("export_mime_type"),
            "content_type": "application/pdf",
        }
    if mime in ALLOWED_CONTENT_TYPES:
        size = meta.get("size")
        if size is not None and size > MAX_FILE_SIZE:
            return False, "too_large", None
        return True, "", {"export_mime": None, "content_type": mime}
    if meta.get("is_google_workspace_file"):
        return False, "export_not_supported", None
    return False, "unsupported_type", None


def _stored_filename(name: str, content_type: str) -> str:
    base = (name or "file").replace("/", "_").replace("\\", "_").strip() or "file"
    exts = _MIME_EXTS.get(content_type, [])
    if exts and not any(base.lower().endswith(e) for e in exts):
        base = f"{base}{exts[0]}"
    return base[:255]


# ---- Save into a destination (reuses the existing validated+encrypted path) -


def _create_document_file(user, *, data: bytes, filename: str, content_type: str, document=None):
    uploaded = SimpleUploadedFile(filename, data, content_type=content_type)
    trusted_type = file_validation.validate_secure_upload(
        uploaded,
        allowed_content_types=ALLOWED_CONTENT_TYPES,
        allowed_extensions=ALLOWED_EXTENSIONS,
        max_bytes=MAX_FILE_SIZE,
    )
    instance = DocumentFile(
        document=document,
        uploaded_by=user,
        original_filename=filename[:255],
        content_type=trusted_type,
        file_size=len(data),
        checksum=hashlib.sha256(data).hexdigest(),
    )
    encrypt_bytes_into_record(instance, data, filename)
    instance.save()
    return instance


def _save_to_destination(user, dest: _Destination, data: bytes, filename: str, content_type: str):
    if dest.type == "file_inbox":
        f = _create_document_file(
            user, data=data, filename=filename, content_type=content_type, document=None
        )
        return f, None
    title = filename.rsplit(".", 1)[0][:255] or filename[:255]
    document = Document.objects.create(owner=user, title=title)
    f = _create_document_file(
        user, data=data, filename=filename, content_type=content_type, document=document
    )
    if dest.type == "folder":
        assign_document_to_folder(document, dest.folder, user)
    elif dest.type == "pack":
        DocumentBundleRequirement.objects.create(
            owner=user,
            bundle=dest.bundle,
            title=title[:255],
            requirement_type=DocumentBundleRequirement.RequirementType.FILE,
            status=DocumentBundleRequirement.Status.ATTACHED,
            is_required=False,
            linked_document=document,
            linked_file=f,
            sort_order=dest.bundle.requirements.count(),
        )
        dest.bundle.recalculate_readiness()
    return f, document


# ---- Per-file import -------------------------------------------------------


def _result(name, status, reason="", *, document_id=None, file_id=None):
    return {
        "name": name,
        "status": status,
        "reason": reason,
        "document_id": document_id,
        "file_id": file_id,
    }


def _provider_reason(code: str) -> str:
    if code == "too_large":
        return "too_large"
    if code in ("not_found", "forbidden", "unauthorized"):
        return "not_downloadable"
    return "provider_error"


def import_single_drive_file(user, *, provider, access_token, file_ref, dest):
    """Import one selected Drive file. Returns a per-file result dict; never
    raises (a single file's failure must not abort the batch)."""
    provider_file_id = str((file_ref or {}).get("provider_file_id") or "")
    name_hint = str((file_ref or {}).get("name") or "")
    if not provider_file_id:
        return _result(name_hint or "file", "failed", "provider_error")

    try:
        meta_raw = provider.get_drive_file_metadata(
            access_token=access_token, file_id=provider_file_id
        )
    except ProviderError as exc:
        return _result(name_hint or "file", "failed", _provider_reason(exc.code))
    meta = build_drive_file_payload(meta_raw)

    ok, reason, plan = validate_drive_file_for_import(meta)
    if not ok:
        return _result(meta.get("name") or name_hint or "file", "failed", reason)

    filename = _stored_filename(meta.get("name") or name_hint, plan["content_type"])

    try:
        enforce_plan_limit(user, dest.count_resource)
    except PlanLimitExceeded:
        return _result(filename, "failed", "limit_reached")

    try:
        data = provider.download_drive_file(
            access_token=access_token,
            file_id=provider_file_id,
            export_mime=plan["export_mime"],
            max_bytes=MAX_FILE_SIZE,
        )
    except ProviderError as exc:
        return _result(filename, "failed", _provider_reason(exc.code))
    if not data:
        return _result(filename, "failed", "not_downloadable")

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
    except Exception:  # noqa: BLE001 - storage/encryption failure, fail this file only
        logger.warning("drive import save failed", exc_info=True)
        return _result(filename, "failed", "storage_error")

    return _result(
        filename, "imported",
        document_id=getattr(document, "id", None),
        file_id=getattr(document_file, "id", None),
    )


# ---- Public batch entry points ---------------------------------------------


def list_google_drive_files(
    user, account, *, query=None, page_token=None, page_size=25, mime_types=None
) -> dict:
    provider, token = _ensure_provider_and_token(account)
    return provider.list_drive_files(
        access_token=token, query=query, page_token=page_token,
        page_size=page_size, mime_types=mime_types,
    )


def preview_google_drive_import(user, account, files, destination, *, request=None) -> dict:
    """Advisory preview (no download, no save): validate each selected file's
    type/size against the rules and resolve the destination scope."""
    dest = resolve_destination(user, destination)
    results = []
    importable = 0
    for ref in (files or [])[:MAX_FILES_PER_IMPORT]:
        # Validate against the client-provided metadata (advisory only — the real
        # import re-fetches authoritative metadata before downloading).
        meta = build_drive_file_payload(
            {
                "id": ref.get("provider_file_id", ""),
                "name": ref.get("name", ""),
                "mimeType": ref.get("mime_type", ""),
                "size": ref.get("size"),
            }
        )
        ok, reason, _plan = validate_drive_file_for_import(meta)
        results.append(
            {
                "provider_file_id": meta["provider_file_id"],
                "name": meta["name"],
                "status": "will_import" if ok else "skipped",
                "reason": reason,
            }
        )
        if ok:
            importable += 1
    warnings = ["Imported files count toward your storage and document limits."]
    if len(files or []) > MAX_FILES_PER_IMPORT:
        warnings.append(
            f"Only the first {MAX_FILES_PER_IMPORT} files can be imported at once."
        )
    events.record_drive_import_audit(
        user=user, event_type=events.GD_IMPORT_PREVIEWED, account=account,
        status="previewed", destination_type=dest.type, request=request,
    )
    return {
        "destination": {"type": dest.type},
        "importable_count": importable,
        "skipped_count": len(results) - importable,
        "results": results,
        "warnings": warnings,
    }


def import_google_drive_files(user, account, files, destination, *, request=None) -> dict:
    """Import the selected Drive files. Per-file failures are isolated; returns a
    summary with one result per file."""
    dest = resolve_destination(user, destination)
    try:
        provider, token = _ensure_provider_and_token(account)
    except ProviderNotConfigured:
        raise DriveImportError(
            "Google integration is not configured.", code="not_configured"
        )
    except ProviderError:
        raise DriveImportError(
            "Could not refresh the Google connection. Reconnect and try again.",
            code="reauth_required",
        )

    selected = (files or [])[:MAX_FILES_PER_IMPORT]
    events.record_drive_import_audit(
        user=user, event_type=events.GD_IMPORT_STARTED, account=account,
        status="started", destination_type=dest.type, request=request,
    )

    results = []
    for ref in selected:
        res = import_single_drive_file(
            user, provider=provider, access_token=token, file_ref=ref, dest=dest
        )
        results.append(res)
        if res["status"] == "imported":
            events.record_drive_import_audit(
                user=user, event_type=events.GD_FILE_IMPORTED, account=account,
                status="imported", destination_type=dest.type,
                object_label=res["name"], request=request,
            )
        else:
            events.record_drive_import_audit(
                user=user, event_type=events.GD_FILE_IMPORT_FAILED, account=account,
                status="failed", reason=res["reason"], destination_type=dest.type,
                object_label=res["name"], request=request,
            )

    imported = sum(1 for r in results if r["status"] == "imported")
    failed = len(results) - imported
    batch_status = "succeeded" if failed == 0 else ("failed" if imported == 0 else "partial")

    events.record_drive_import_audit(
        user=user, event_type=events.GD_IMPORT_COMPLETED, account=account,
        status=batch_status, destination_type=dest.type, request=request,
    )
    events.record_drive_import_operational(
        user=user, status=batch_status, imported_count=imported, failed_count=failed,
        destination_type=dest.type, file_count=len(results), request=request,
    )

    warnings = []
    if len(files or []) > MAX_FILES_PER_IMPORT:
        warnings.append(
            f"Only the first {MAX_FILES_PER_IMPORT} files were imported."
        )
    return {
        "status": "completed" if imported else ("failed" if results else "empty"),
        "imported_count": imported,
        "failed_count": failed,
        "destination": {"type": dest.type},
        "results": results,
        "warnings": warnings,
    }
