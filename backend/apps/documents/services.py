"""Helpers for file activity logging.

Activity logging must never break the main preview/download/share flow, so
``log_activity`` swallows its own errors. Access codes are never logged.
"""

import logging

from .models import DocumentFile, DocumentFileActivity

logger = logging.getLogger(__name__)


def client_ip(request) -> str | None:
    """Best-effort client IP (respects a single proxy hop)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_activity(
    *,
    file: DocumentFile,
    action: str,
    actor_type: str,
    request=None,
    share_link=None,
    metadata: dict | None = None,
) -> None:
    """
    Record one activity entry, owned by the file's document owner.

    Never raises: a logging failure must not break the user-facing action.
    """
    try:
        DocumentFileActivity.objects.create(
            owner_id=file.document.owner_id,
            document_id=file.document_id,
            file=file,
            share_link=share_link,
            action=action,
            actor_type=actor_type,
            ip_address=client_ip(request) if request is not None else None,
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:1000] if request else ""),
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — logging must never break the flow
        logger.warning("Failed to record file activity", exc_info=True)
