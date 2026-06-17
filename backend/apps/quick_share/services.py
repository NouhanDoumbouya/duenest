"""
Quick Share service helpers: access guards, claim lifecycle, file serving,
save-copy-to-vault, and safe activity logging.

All state checks live here so that every view enforces the same rules. None of
these helpers ever return tokens, access-code hashes, or storage paths.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os

from django.db import transaction
from django.db.models import F
from django.http import FileResponse
from django.utils import timezone
from django.utils.http import content_disposition_header

from apps.core.security.encryption import DecryptionError
from apps.documents.file_encryption import encrypt_bytes_into_record, read_plaintext
from apps.documents.models import Document, DocumentFile

from .models import (
    QuickShareActivity,
    QuickShareClaim,
    QuickShareItem,
    QuickShareSession,
)

logger = logging.getLogger(__name__)


# ---- Activity logging ------------------------------------------------------


def log_activity(
    *, session, action, actor_type, actor=None, summary="", metadata=None
) -> None:
    """Record one Quick Share activity entry. Never raises; codes/tokens never logged."""
    try:
        QuickShareActivity.objects.create(
            session=session,
            actor=actor,
            action=action,
            actor_type=actor_type,
            safe_summary=summary[:255],
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — logging must never break the flow
        logger.warning("Failed to record quick share activity", exc_info=True)


def notify_owner_share_viewed(session, *, viewer=None) -> None:
    """
    Create a calm, privacy-safe in-app notification telling the owner that a file
    they shared was opened.

    Respects the owner's "activity notifications" preference (off by default), is
    skipped when the owner opens their own share, and is deduped to one record per
    session per day so repeated opens never spam. Never raises — a notification
    failure must not break file serving. No recipient identity, file name, token,
    or access code is ever included.
    """
    try:
        if viewer is not None and getattr(viewer, "id", None) == session.owner_id:
            return

        from apps.notifications.services import (
            NotificationCandidate,
            create_notification,
            get_preferences,
            sanitize_metadata,
        )

        prefs = get_preferences(session.owner)
        if not (prefs.in_app_enabled and prefs.activity_notifications_enabled):
            return

        today = timezone.now().date().isoformat()
        dedupe = f"share_viewed:{session.owner_id}:quick_share:{session.id}:{today}"
        candidate = NotificationCandidate(
            user=session.owner,
            type="share_viewed",
            title="Shared item activity",
            message="A file you shared was just opened.",
            severity="info",
            source_type="quick_share_session",
            source_id=str(session.id),
            action_url=f"/dashboard/quick-share/{session.id}",
            scheduled_for=timezone.now(),
            dedupe_key=dedupe[:255],
            metadata=sanitize_metadata({"channel": "quick_share"}),
        )
        create_notification(candidate)
    except Exception:  # noqa: BLE001 — notifications must never break the flow
        logger.warning("Failed to create quick share view notification", exc_info=True)


def summarize_user_agent(request) -> str:
    """Coarse, non-identifying client summary (browser + platform family)."""
    if request is None:
        return ""
    ua = request.META.get("HTTP_USER_AGENT", "")
    if not ua:
        return ""
    lowered = ua.lower()
    browser = "Browser"
    for needle, label in (
        ("edg/", "Edge"),
        ("chrome/", "Chrome"),
        ("crios/", "Chrome"),
        ("firefox/", "Firefox"),
        ("safari/", "Safari"),
    ):
        if needle in lowered:
            browser = label
            break
    platform = ""
    for needle, label in (
        ("android", "Android"),
        ("iphone", "iPhone"),
        ("ipad", "iPad"),
        ("windows", "Windows"),
        ("mac os", "Mac"),
        ("linux", "Linux"),
    ):
        if needle in lowered:
            platform = label
            break
    return f"{browser} on {platform}".strip() if platform else browser


# ---- Session state guards --------------------------------------------------


class SessionState:
    """Resolved guard outcome. ``ok`` is True only when access may proceed."""

    def __init__(self, *, ok, state=None, detail=None, http_status=None):
        self.ok = ok
        self.state = state
        self.detail = detail
        self.http_status = http_status


def _expire_if_needed(session: QuickShareSession) -> None:
    """Persist an expired/consumed status so the owner UI reflects reality."""
    if session.is_expired and session.status not in {
        QuickShareSession.Status.EXPIRED,
        QuickShareSession.Status.REVOKED,
    }:
        session.status = QuickShareSession.Status.EXPIRED
        session.save(update_fields=["status", "updated_at"])
        log_activity(
            session=session,
            action=QuickShareActivity.Action.SESSION_EXPIRED,
            actor_type=QuickShareActivity.ActorType.SYSTEM,
            summary="Quick Share expired.",
        )


def resolve_session(token: str):
    """Return (session, SessionState). SessionState.ok is False when unusable."""
    try:
        session = QuickShareSession.objects.get(token=token)
    except QuickShareSession.DoesNotExist:
        return None, SessionState(
            ok=False,
            state="invalid",
            detail="This Quick Share link is invalid.",
            http_status=404,
        )
    _expire_if_needed(session)
    if session.is_revoked:
        return session, SessionState(
            ok=False,
            state="revoked",
            detail="Access revoked. The sender turned off this Quick Share.",
            http_status=410,
        )
    if session.is_expired:
        return session, SessionState(
            ok=False,
            state="expired",
            detail="This Quick Share expired.",
            http_status=410,
        )
    if session.is_consumed:
        return session, SessionState(
            ok=False,
            state="consumed",
            detail="This one-time Quick Share has already been used.",
            http_status=410,
        )
    if session.is_claim_limit_reached:
        return session, SessionState(
            ok=False,
            state="limit_reached",
            detail="This Quick Share has reached its access limit.",
            http_status=410,
        )
    return session, SessionState(ok=True)


# ---- Items -----------------------------------------------------------------


def session_files(session: QuickShareSession):
    """
    Return the live, accessible ``DocumentFile`` objects for a session.

    Trashed files are excluded so removing/trashing a file revokes it from the
    Quick Share immediately. Only files the owner still owns are returned.
    """
    files = []
    seen = set()
    items = session.items.select_related("file", "document", "bundle").all()
    for item in items:
        file = item.file
        if file is None and item.bundle_id:
            # Bundle item: expose all of the bundle's currently available files,
            # using the same canonical file-set as the rest of the app. Owner
            # isolation was enforced when the bundle was attached.
            from apps.documents.services import collect_bundle_files

            for entry in collect_bundle_files(item.bundle).files:
                doc_file = entry.file
                if doc_file.id not in seen:
                    seen.add(doc_file.id)
                    files.append((item, doc_file))
            continue
        if file is None and item.document_id:
            # Document-level item: expose its current active files.
            for doc_file in item.document.files.filter(
                is_trashed=False
            ).order_by("created_at"):
                if doc_file.id not in seen:
                    seen.add(doc_file.id)
                    files.append((item, doc_file))
            continue
        if file is None:
            continue
        if file.is_trashed:
            continue
        if file.document_id:
            if file.document.is_trashed or file.document.owner_id != session.owner_id:
                continue
        elif file.uploaded_by_id != session.owner_id:
            continue
        if file.id not in seen:
            seen.add(file.id)
            files.append((item, file))
    return files


def resolve_session_file(session: QuickShareSession, file_id):
    """Return a DocumentFile only if it is exposed by this session, else None."""
    try:
        target = int(file_id)
    except (TypeError, ValueError):
        return None
    for _item, file in session_files(session):
        if file.id == target:
            return file
    return None


# ---- File serving ----------------------------------------------------------


def _file_response(file: DocumentFile, *, as_attachment: bool):
    # Permission-first: callers validate the claim/token/code/scope before this.
    try:
        plaintext = read_plaintext(file)
    except (FileNotFoundError, ValueError, DecryptionError):
        return None
    response = FileResponse(
        io.BytesIO(plaintext),
        as_attachment=as_attachment,
        filename=file.original_filename,
    )
    if file.content_type:
        response["Content-Type"] = file.content_type
    return response


def inline_file_response(file: DocumentFile):
    response = _file_response(file, as_attachment=False)
    if response is None:
        return None
    response["Content-Disposition"] = content_disposition_header(
        False, file.original_filename
    )
    return response


def attachment_file_response(file: DocumentFile):
    return _file_response(file, as_attachment=True)


# ---- Claim lifecycle -------------------------------------------------------


def get_or_create_receiver_claim(session, user, request=None):
    """Return the receiver's claim for an account-to-account session (create if new)."""
    claim, created = QuickShareClaim.objects.get_or_create(
        session=session,
        receiver_user=user,
        defaults={
            "status": QuickShareClaim.Status.PENDING,
            "approval": (
                QuickShareClaim.Approval.NOT_REQUIRED
                if not session.require_sender_approval
                else QuickShareClaim.Approval.NOT_REQUIRED
            ),
            "claimed_at": timezone.now(),
            "receiver_email": getattr(user, "email", "") or "",
            "user_agent_summary": summarize_user_agent(request),
        },
    )
    if created:
        log_activity(
            session=session,
            action=QuickShareActivity.Action.CLAIM_STARTED,
            actor_type=QuickShareActivity.ActorType.RECEIVER,
            actor=user,
            summary=f"{_display_name(user)} opened the Quick Share.",
        )
    return claim, created


def _display_name(user) -> str:
    full = (getattr(user, "get_full_name", lambda: "")() or "").strip()
    return full or getattr(user, "email", "") or "A DueNest user"


@transaction.atomic
def accept_claim(session, claim, request=None):
    """
    Accept a receiver's claim, enforcing claim limits and sender approval.

    Returns (claim, error_state). error_state is None on success.
    """
    session = QuickShareSession.objects.select_for_update().get(pk=session.pk)
    if not session.is_active:
        return claim, SessionState(
            ok=False, state="unavailable",
            detail="This Quick Share is no longer available.", http_status=410,
        )
    if claim.status == QuickShareClaim.Status.ACCEPTED:
        return claim, None  # idempotent

    if session.is_claim_limit_reached:
        claim.status = QuickShareClaim.Status.BLOCKED
        claim.save(update_fields=["status", "updated_at"])
        return claim, SessionState(
            ok=False, state="limit_reached",
            detail="This Quick Share has reached its access limit.",
            http_status=410,
        )

    now = timezone.now()
    if session.require_sender_approval:
        claim.approval = QuickShareClaim.Approval.PENDING
        claim.status = QuickShareClaim.Status.PENDING
        claim.claimed_at = claim.claimed_at or now
        claim.save(update_fields=["approval", "status", "claimed_at", "updated_at"])
        log_activity(
            session=session,
            action=QuickShareActivity.Action.CLAIM_STARTED,
            actor_type=QuickShareActivity.ActorType.RECEIVER,
            actor=claim.receiver_user,
            summary=f"{_display_name(claim.receiver_user)} requested access.",
        )
        return claim, None

    # Approval not required → grant immediately and consume a claim slot.
    claim.status = QuickShareClaim.Status.ACCEPTED
    claim.approval = QuickShareClaim.Approval.NOT_REQUIRED
    claim.accepted_at = now
    claim.save(update_fields=["status", "approval", "accepted_at", "updated_at"])
    _consume_claim_slot(session)
    log_activity(
        session=session,
        action=QuickShareActivity.Action.CLAIM_ACCEPTED,
        actor_type=QuickShareActivity.ActorType.RECEIVER,
        actor=claim.receiver_user,
        summary=f"{_display_name(claim.receiver_user)} accepted the share.",
    )
    return claim, None


def _consume_claim_slot(session: QuickShareSession) -> None:
    """Increment the accepted-claim counter and consume one-time sessions."""
    QuickShareSession.objects.filter(pk=session.pk).update(
        claim_count=F("claim_count") + 1
    )
    session.refresh_from_db(fields=["claim_count"])
    if session.one_time and session.status != QuickShareSession.Status.CONSUMED:
        session.status = QuickShareSession.Status.CONSUMED
        session.save(update_fields=["status", "updated_at"])
    elif session.status == QuickShareSession.Status.ACTIVE:
        session.status = QuickShareSession.Status.ACCEPTED
        session.save(update_fields=["status", "updated_at"])


def decline_claim(session, claim):
    claim.status = QuickShareClaim.Status.DECLINED
    claim.declined_at = timezone.now()
    claim.save(update_fields=["status", "declined_at", "updated_at"])
    log_activity(
        session=session,
        action=QuickShareActivity.Action.CLAIM_DECLINED,
        actor_type=QuickShareActivity.ActorType.RECEIVER,
        actor=claim.receiver_user,
        summary=f"{_display_name(claim.receiver_user)} declined the share.",
    )
    return claim


@transaction.atomic
def approve_claim(session, claim):
    session = QuickShareSession.objects.select_for_update().get(pk=session.pk)
    if session.is_claim_limit_reached:
        return claim, SessionState(
            ok=False, state="limit_reached",
            detail="This Quick Share has reached its access limit.",
            http_status=410,
        )
    claim.approval = QuickShareClaim.Approval.APPROVED
    claim.status = QuickShareClaim.Status.ACCEPTED
    claim.accepted_at = timezone.now()
    claim.save(update_fields=["approval", "status", "accepted_at", "updated_at"])
    _consume_claim_slot(session)
    log_activity(
        session=session,
        action=QuickShareActivity.Action.SENDER_APPROVED,
        actor_type=QuickShareActivity.ActorType.OWNER,
        actor=session.owner,
        summary="Sender approved access.",
    )
    return claim, None


def deny_claim(session, claim):
    claim.approval = QuickShareClaim.Approval.DENIED
    claim.status = QuickShareClaim.Status.BLOCKED
    claim.save(update_fields=["approval", "status", "updated_at"])
    log_activity(
        session=session,
        action=QuickShareActivity.Action.SENDER_DENIED,
        actor_type=QuickShareActivity.ActorType.OWNER,
        actor=session.owner,
        summary="Sender denied access.",
    )
    return claim


# ---- Save copy to vault ----------------------------------------------------


@transaction.atomic
def save_copy_to_vault(session, receiver, source_file, *, target_document_id=None):
    """
    Copy ``source_file`` into the receiver's own vault.

    The copy becomes fully receiver-owned: a new Document (or a chosen existing
    one) and a new DocumentFile are created with fresh bytes. No sender token,
    access code, or internal metadata is carried over.
    """
    if target_document_id:
        document = Document.objects.get(id=target_document_id, owner=receiver)
    else:
        document = Document.objects.create(
            owner=receiver,
            title=source_file.original_filename or "Shared document",
            notes="Saved from a DueNest Quick Share.",
        )

    # Decrypt the source (the claim was already validated by the caller), then
    # re-encrypt fresh bytes under the receiver's own new record.
    content = read_plaintext(source_file)

    checksum = hashlib.sha256(content).hexdigest()
    new_file = DocumentFile(
        document=document,
        uploaded_by=receiver,
        original_filename=source_file.original_filename,
        content_type=source_file.content_type,
        file_size=len(content),
        checksum=checksum,
    )
    # Use only the base filename so no source storage path is reused.
    base_name = os.path.basename(source_file.original_filename or "file")
    encrypt_bytes_into_record(new_file, content, base_name)
    new_file.save()

    log_activity(
        session=session,
        action=QuickShareActivity.Action.COPY_SAVED,
        actor_type=QuickShareActivity.ActorType.RECEIVER,
        actor=receiver,
        summary=f"{_display_name(receiver)} saved a copy to their vault.",
    )
    return document, new_file
