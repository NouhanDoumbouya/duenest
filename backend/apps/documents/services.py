"""Document service helpers.

Activity logging must never break the main preview/download/share flow, so
``log_activity`` swallows its own errors. Access codes are never logged.
"""

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from django.utils import timezone

from .models import Document, DocumentFile, DocumentFileActivity

logger = logging.getLogger(__name__)

EXPIRING_SOON_DAYS = 90


@dataclass(frozen=True)
class DocumentHealth:
    computed_status: str
    status_label: str
    status_reason: str
    urgency_level: str
    days_until_expiry: int | None
    days_until_renewal: int | None
    is_expired: bool
    is_expiring_soon: bool
    is_renewal_due: bool
    has_file: bool
    missing_expiry_date: bool
    missing_file: bool
    needs_attention: bool

    def as_dict(self) -> dict:
        return {
            "computed_status": self.computed_status,
            "status_label": self.status_label,
            "status_reason": self.status_reason,
            "urgency_level": self.urgency_level,
            "days_until_expiry": self.days_until_expiry,
            "days_until_renewal": self.days_until_renewal,
            "is_expired": self.is_expired,
            "is_expiring_soon": self.is_expiring_soon,
            "is_renewal_due": self.is_renewal_due,
            "has_file": self.has_file,
            "missing_expiry_date": self.missing_expiry_date,
            "missing_file": self.missing_file,
            "needs_attention": self.needs_attention,
        }


STATUS_LABELS = {
    "active": "Active",
    "expiring_soon": "Expiring soon",
    "renewal_due": "Renewal due",
    "expired": "Expired",
    "missing_file": "Missing file",
    "missing_expiry_date": "Missing expiry date",
    "needs_attention": "Needs attention",
    "archived": "Archived",
}


def _days_until(value: date | None, today: date) -> int | None:
    if value is None:
        return None
    return (value - today).days


def _document_has_file(document: Document) -> bool:
    file_count = getattr(document, "file_count", None)
    if file_count is not None:
        return file_count > 0
    prefetched = getattr(document, "_prefetched_objects_cache", {}).get("files")
    if prefetched is not None:
        return len(prefetched) > 0
    return document.files.exists()


def get_document_health(
    document: Document, *, today: date | None = None
) -> DocumentHealth:
    """Return read-only intelligence derived from dates, files, and status."""
    today = today or timezone.localdate()
    days_until_expiry = _days_until(document.expiry_date, today)
    days_until_renewal = _days_until(document.renewal_date, today)
    has_file = _document_has_file(document)

    is_expired = days_until_expiry is not None and days_until_expiry < 0
    is_renewal_due = (
        not is_expired
        and days_until_renewal is not None
        and days_until_renewal <= 0
    )
    is_expiring_soon = (
        not is_expired
        and days_until_expiry is not None
        and 0 <= days_until_expiry <= EXPIRING_SOON_DAYS
    )
    missing_expiry_date = document.expiry_date is None
    missing_file = not has_file

    if document.status == Document.Status.ARCHIVED:
        computed_status = "archived"
        urgency_level = "none"
        status_reason = "This document is archived."
        needs_attention = False
    elif is_expired:
        computed_status = "expired"
        urgency_level = "critical"
        status_reason = (
            f"Expired {abs(days_until_expiry)} day"
            f"{'' if abs(days_until_expiry) == 1 else 's'} ago."
        )
        needs_attention = True
    elif is_renewal_due:
        computed_status = "renewal_due"
        urgency_level = "high"
        status_reason = "Renewal is due now."
        needs_attention = True
    elif is_expiring_soon:
        computed_status = "expiring_soon"
        urgency_level = "high" if (days_until_expiry or 0) <= 30 else "medium"
        status_reason = (
            f"Expires in {days_until_expiry} day"
            f"{'' if days_until_expiry == 1 else 's'}."
        )
        needs_attention = True
    elif missing_file:
        computed_status = "missing_file"
        urgency_level = "medium"
        status_reason = "No file is attached to this document yet."
        needs_attention = True
    elif missing_expiry_date:
        computed_status = "missing_expiry_date"
        urgency_level = "low"
        status_reason = (
            "This document has no expiry date, so DueNest cannot track "
            "renewal timing yet."
        )
        needs_attention = True
    else:
        computed_status = "active"
        urgency_level = "none"
        status_reason = "This document looks up to date."
        needs_attention = False

    return DocumentHealth(
        computed_status=computed_status,
        status_label=STATUS_LABELS[computed_status],
        status_reason=status_reason,
        urgency_level=urgency_level,
        days_until_expiry=days_until_expiry,
        days_until_renewal=days_until_renewal,
        is_expired=is_expired,
        is_expiring_soon=is_expiring_soon,
        is_renewal_due=is_renewal_due,
        has_file=has_file,
        missing_expiry_date=missing_expiry_date,
        missing_file=missing_file,
        needs_attention=needs_attention,
    )


URGENCY_RANK = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
    "none": 4,
}

STATUS_RANK = {
    "expired": 0,
    "renewal_due": 1,
    "expiring_soon": 2,
    "missing_file": 3,
    "missing_expiry_date": 4,
    "needs_attention": 5,
    "active": 6,
    "archived": 7,
}


def attention_sort_key(document: Document) -> tuple:
    health = get_document_health(document)
    return (
        STATUS_RANK.get(health.computed_status, 99),
        URGENCY_RANK.get(health.urgency_level, 99),
        health.days_until_expiry if health.days_until_expiry is not None else 99999,
        -document.updated_at.timestamp(),
    )


def reminder_date_for_rule(rule) -> date | None:
    """Calculate a reminder date from a rule without creating notifications."""
    if rule.trigger_type == rule.TriggerType.BEFORE_RENEWAL_DATE:
        source = rule.document.renewal_date
    else:
        source = rule.document.expiry_date
    if source is None:
        return None
    return source - timedelta(days=rule.days_before)


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
