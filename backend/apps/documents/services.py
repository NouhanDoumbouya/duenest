"""Document service helpers.

Activity logging must never break the main preview/download/share flow, so
``log_activity`` swallows its own errors. Access codes are never logged.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    Document,
    DocumentActivity,
    DocumentBundle,
    DocumentExportRequest,
    DocumentFile,
    DocumentFileActivity,
    DocumentVersion,
)

logger = logging.getLogger(__name__)

EXPIRING_SOON_DAYS = 90
EXPORT_TTL_DAYS = 7

# Fields a reviewer may apply from an extraction back onto a Document.
APPLICABLE_EXTRACTION_FIELDS = (
    "title",
    "document_type",
    "issuer",
    "country",
    "reference_number",
    "issue_date",
    "expiry_date",
    "renewal_date",
)


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
        return any(not f.is_trashed for f in prefetched)
    return document.files.filter(is_trashed=False).exists()


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


# ---- Last safe action date -------------------------------------------------

# Default lead time used when computing a last-safe-action date from an expiry.
LAST_SAFE_ACTION_BUFFER_DAYS = 30
# Warn when the last-safe-action date is within this many days.
LAST_SAFE_ACTION_WARN_DAYS = 30


@dataclass(frozen=True)
class LastSafeAction:
    date: date | None
    days_until: int | None
    status: str  # unknown | ok | approaching | passed
    is_manual: bool

    def as_dict(self) -> dict:
        return {
            "last_safe_action_date": self.date.isoformat() if self.date else None,
            "days_until_last_safe_action": self.days_until,
            "last_safe_action_status": self.status,
            "last_safe_action_is_manual": self.is_manual,
        }


def compute_last_safe_action(document, *, today: date | None = None) -> LastSafeAction:
    """
    The last date the user can still safely act (renew/submit) before it's too
    late. Uses the manual override when set, else derives it from the renewal
    date, else from the expiry date minus a default buffer.
    """
    today = today or timezone.localdate()
    if document.last_safe_action_date:
        value, is_manual = document.last_safe_action_date, True
    elif document.renewal_date:
        value, is_manual = document.renewal_date, False
    elif document.expiry_date:
        value = document.expiry_date - timedelta(days=LAST_SAFE_ACTION_BUFFER_DAYS)
        is_manual = False
    else:
        return LastSafeAction(None, None, "unknown", False)

    days = (value - today).days
    if days < 0:
        status = "passed"
    elif days <= LAST_SAFE_ACTION_WARN_DAYS:
        status = "approaching"
    else:
        status = "ok"
    return LastSafeAction(value, days, status, is_manual)


# ---- Confidence / readiness score ------------------------------------------

# A proof record only counts toward confidence once a document is in or past
# submission — otherwise its absence shouldn't be treated as a gap.
CONFIDENCE_RELEVANT_PROOF_LIFECYCLES = {
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "renewed",
}

LOW_CONFIDENCE_THRESHOLD = 55


@dataclass(frozen=True)
class DocumentConfidence:
    score: int
    label: str
    reasons: list

    def as_dict(self) -> dict:
        return {
            "confidence_score": self.score,
            "confidence_label": self.label,
            "confidence_reasons": self.reasons,
        }


def _confidence_label(score: int) -> str:
    if score >= 85:
        return "Strong"
    if score >= 65:
        return "Good"
    if score >= 40:
        return "Fair"
    return "Low"


def _has_active_reminder(document) -> bool:
    prefetched = getattr(document, "_prefetched_objects_cache", {}).get(
        "reminder_rules"
    )
    if prefetched is not None:
        return any(r.is_enabled for r in prefetched)
    return document.reminder_rules.filter(is_enabled=True).exists()


def _has_proof(document) -> bool:
    prefetched = getattr(document, "_prefetched_objects_cache", {}).get(
        "proof_records"
    )
    if prefetched is not None:
        return len(prefetched) > 0
    return document.proof_records.exists()


def compute_confidence(
    document, *, health: DocumentHealth | None = None, today: date | None = None
) -> DocumentConfidence:
    """
    A 0–100 readiness score derived from how complete and current a document is.
    Weights sum to 100; proof is only required for documents in/after submission.
    """
    health = health or get_document_health(document, today=today)
    reasons: list = []
    score = 0

    def factor(key, label, met, weight, hint=""):
        nonlocal score
        if met:
            score += weight
        reasons.append(
            {
                "key": key,
                "label": label,
                "met": bool(met),
                "weight": weight,
                "hint": hint,
            }
        )

    factor("has_file", "File uploaded", health.has_file, 25, "Attach a scan or copy.")
    factor(
        "has_expiry",
        "Expiry date set",
        not health.missing_expiry_date,
        15,
        "Add the expiry date so renewals can be tracked.",
    )
    factor(
        "has_reminder",
        "Reminder active",
        _has_active_reminder(document),
        15,
        "Add a reminder rule.",
    )
    factor(
        "has_location",
        "Physical location noted",
        bool(document.physical_location_label or document.physical_location_details),
        10,
        "Record where the original is kept.",
    )
    factor(
        "not_critical",
        "Not expired",
        not health.is_expired,
        20,
        "Renew or update this document.",
    )
    factor(
        "no_warnings",
        "No open warnings",
        not health.needs_attention,
        5,
        "Resolve outstanding warnings.",
    )

    if document.lifecycle_status in CONFIDENCE_RELEVANT_PROOF_LIFECYCLES:
        factor(
            "has_proof",
            "Proof recorded",
            _has_proof(document),
            10,
            "Save a submission confirmation or receipt.",
        )
    else:
        # Not relevant yet — award the points so absence isn't a penalty.
        score += 10

    score = max(0, min(100, score))
    return DocumentConfidence(
        score=score, label=_confidence_label(score), reasons=reasons
    )


# ---- What-is-missing scanner ----------------------------------------------


def _missing_doc_summary(document, health: DocumentHealth) -> dict:
    return {
        "id": document.id,
        "title": document.title,
        "document_type": document.document_type,
        "computed_status": health.computed_status,
        "status_label": health.status_label,
    }


def scan_missing(user, *, today: date | None = None) -> dict:
    """
    Owner-scoped summary of what's missing or risky across the vault: documents
    without files, without expiry dates, without reminders, low-confidence
    documents, and bundles missing required items.
    """
    today = today or timezone.localdate()

    documents = list(
        Document.objects.filter(owner=user, is_trashed=False)
        .exclude(status=Document.Status.ARCHIVED)
        .annotate(
            file_count=Count(
                "files", filter=Q(files__is_trashed=False), distinct=True
            )
        )
        .prefetch_related("reminder_rules", "proof_records")
    )

    missing_files: list = []
    missing_expiry: list = []
    without_reminders: list = []
    low_confidence: list = []

    for document in documents:
        health = get_document_health(document, today=today)
        summary = _missing_doc_summary(document, health)
        if health.missing_file:
            missing_files.append(summary)
        if health.missing_expiry_date:
            missing_expiry.append(summary)
        if not _has_active_reminder(document):
            without_reminders.append(summary)
        confidence = compute_confidence(document, health=health, today=today)
        if confidence.score < LOW_CONFIDENCE_THRESHOLD:
            low_confidence.append({**summary, "confidence_score": confidence.score})

    bundles_missing: list = []
    bundles = DocumentBundle.objects.filter(owner=user).exclude(
        status=DocumentBundle.Status.ARCHIVED
    )
    for bundle in bundles.prefetch_related("requirements"):
        readiness = bundle_readiness(bundle)
        if readiness.required_missing > 0:
            bundles_missing.append(
                {
                    "id": bundle.id,
                    "title": bundle.title,
                    "missing_required_count": readiness.required_missing,
                    "readiness_score": readiness.score,
                }
            )

    groups = [
        {
            "key": "missing_files",
            "label": "Documents missing files",
            "hint": "Upload a scan or copy so the document is usable.",
            "fix_target": "document",
            "items": missing_files,
        },
        {
            "key": "missing_expiry",
            "label": "Documents missing an expiry date",
            "hint": "Add an expiry date so renewals can be tracked.",
            "fix_target": "document",
            "items": missing_expiry,
        },
        {
            "key": "without_reminders",
            "label": "Documents without reminders",
            "hint": "Add a reminder rule so nothing slips.",
            "fix_target": "document",
            "items": without_reminders,
        },
        {
            "key": "low_confidence",
            "label": "Low-confidence documents",
            "hint": "Fill in the gaps to raise the confidence score.",
            "fix_target": "document",
            "items": low_confidence,
        },
        {
            "key": "bundles_missing_required",
            "label": "Bundles missing required items",
            "hint": "Attach the required documents to complete the bundle.",
            "fix_target": "bundle",
            "items": bundles_missing,
        },
    ]

    total = sum(len(group["items"]) for group in groups)
    return {"total": total, "groups": groups}


# ---- Health dashboard overview --------------------------------------------

# Lifecycle states that mean "a human still needs to look at this".
REVIEW_LIFECYCLES = {"under_review", "rejected"}


def _shared_document_ids(user) -> set:
    from .models import DocumentFileShareLink

    now = timezone.now()
    return set(
        DocumentFileShareLink.objects.filter(
            owner=user, revoked_at__isnull=True, expires_at__gt=now
        ).values_list("document_id", flat=True)
    )


def _overview_summary(document, health, confidence) -> dict:
    return {
        "id": document.id,
        "title": document.title,
        "document_type": document.document_type,
        "computed_status": health.computed_status,
        "status_label": health.status_label,
        "urgency_level": health.urgency_level,
        "lifecycle_status": document.lifecycle_status,
        "confidence_score": confidence.score,
        "confidence_label": confidence.label,
    }


def build_health_overview(user, *, today: date | None = None) -> dict:
    """
    Group the user's documents into health sections for the dashboard. Status
    buckets (expired/expiring/missing-info/needs-review/healthy) are primary and
    mutually exclusive; shared-externally and low-confidence are cross-cutting.
    """
    today = today or timezone.localdate()

    documents = list(
        Document.objects.filter(owner=user, is_trashed=False)
        .annotate(
            file_count=Count(
                "files", filter=Q(files__is_trashed=False), distinct=True
            )
        )
        .prefetch_related("reminder_rules", "proof_records")
    )
    shared_ids = _shared_document_ids(user)

    keys = [
        "expired",
        "expiring_soon",
        "missing_info",
        "needs_review",
        "healthy",
        "shared_externally",
        "low_confidence",
    ]
    buckets: dict = {key: [] for key in keys}

    for document in documents:
        health = get_document_health(document, today=today)
        confidence = compute_confidence(document, health=health, today=today)
        summary = _overview_summary(document, health, confidence)
        status = health.computed_status

        if status == "archived":
            # Archived documents are intentionally left out of the live overview.
            pass
        elif status == "expired":
            buckets["expired"].append(summary)
        elif status in ("expiring_soon", "renewal_due"):
            buckets["expiring_soon"].append(summary)
        elif status in ("missing_file", "missing_expiry_date"):
            buckets["missing_info"].append(summary)
        elif document.lifecycle_status in REVIEW_LIFECYCLES:
            buckets["needs_review"].append(summary)
        else:
            buckets["healthy"].append(summary)

        # Cross-cutting signals (a document can appear here and in a status bucket).
        if document.id in shared_ids:
            buckets["shared_externally"].append(summary)
        if confidence.score < LOW_CONFIDENCE_THRESHOLD and status != "archived":
            buckets["low_confidence"].append(summary)

    labels = {
        "expired": ("Expired", "Past their expiry date — act now."),
        "expiring_soon": ("Expiring soon", "Coming up for renewal."),
        "missing_info": ("Missing information", "Missing a file or expiry date."),
        "needs_review": ("Needs review", "Under review or recently rejected."),
        "healthy": ("Healthy", "Complete and up to date."),
        "shared_externally": ("Shared externally", "Have an active share link."),
        "low_confidence": ("Low confidence", "Could be more complete."),
    }
    groups = [
        {
            "key": key,
            "label": labels[key][0],
            "description": labels[key][1],
            "count": len(buckets[key]),
            "items": buckets[key],
        }
        for key in keys
    ]
    return {"total": len(documents), "groups": groups}


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


def log_room_activity(
    *, room, action, actor_type, request=None, metadata: dict | None = None
) -> None:
    """Record one secure-room activity entry. Never raises; codes are not logged."""
    from .models import RoomActivity

    try:
        RoomActivity.objects.create(
            owner_id=room.owner_id,
            room=room,
            action=action,
            actor_type=actor_type,
            ip_address=client_ip(request) if request is not None else None,
            user_agent=(
                request.META.get("HTTP_USER_AGENT", "")[:1000] if request else ""
            ),
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — logging must never break the flow
        logger.warning("Failed to record room activity", exc_info=True)


# ---- Checklist progress ----------------------------------------------------


@dataclass(frozen=True)
class ChecklistProgress:
    total_items: int
    completed_items: int
    skipped_items: int
    required_items: int
    required_completed: int
    required_incomplete: int
    percent: int
    status: str


def checklist_progress(checklist) -> ChecklistProgress:
    """
    Derive progress + status from a checklist's items.

    Completed and skipped items both count as resolved. Progress percent is the
    share of resolved items; status is not_started/in_progress/completed.
    """
    items = list(checklist.items.all())
    total = len(items)
    completed = sum(1 for i in items if i.status == i.Status.COMPLETED)
    skipped = sum(1 for i in items if i.status == i.Status.SKIPPED)
    resolved = completed + skipped

    required = [i for i in items if i.is_required]
    required_total = len(required)
    required_completed = sum(
        1 for i in required if i.status == i.Status.COMPLETED
    )
    required_incomplete = sum(1 for i in required if not i.is_done)

    percent = round((resolved / total) * 100) if total else 0

    if total == 0 or resolved == 0:
        status = "not_started"
    elif resolved == total:
        status = "completed"
    else:
        status = "in_progress"

    return ChecklistProgress(
        total_items=total,
        completed_items=completed,
        skipped_items=skipped,
        required_items=required_total,
        required_completed=required_completed,
        required_incomplete=required_incomplete,
        percent=percent,
        status=status,
    )


# ---- Bundle readiness ------------------------------------------------------


@dataclass(frozen=True)
class BundleReadiness:
    score: int
    total_requirements: int
    required_total: int
    required_satisfied: int
    required_missing: int
    optional_total: int
    optional_satisfied: int
    is_ready: bool
    missing_required_titles: list = field(default_factory=list)


def bundle_readiness(bundle) -> BundleReadiness:
    """
    Compute a 0–100 readiness score for a bundle from its requirements.

    Only required, non-skipped requirements drive the score: a bundle is
    "ready" when every required requirement is attached or completed. Missing
    required requirements reduce the score proportionally. When a bundle has no
    required requirements, readiness falls back to optional requirements (and is
    100 when there is nothing outstanding).
    """
    requirements = list(bundle.requirements.all())

    required = [
        r
        for r in requirements
        if r.is_required and r.status != r.Status.SKIPPED
    ]
    optional = [
        r
        for r in requirements
        if not r.is_required and r.status != r.Status.SKIPPED
    ]

    required_satisfied = sum(1 for r in required if r.is_satisfied)
    optional_satisfied = sum(1 for r in optional if r.is_satisfied)
    missing_required = [r for r in required if not r.is_satisfied]

    if required:
        score = round((required_satisfied / len(required)) * 100)
        is_ready = required_satisfied == len(required)
    elif optional:
        score = round((optional_satisfied / len(optional)) * 100)
        is_ready = optional_satisfied == len(optional)
    else:
        score = 0
        is_ready = False

    return BundleReadiness(
        score=score,
        total_requirements=len(requirements),
        required_total=len(required),
        required_satisfied=required_satisfied,
        required_missing=len(missing_required),
        optional_total=len(optional),
        optional_satisfied=optional_satisfied,
        is_ready=is_ready,
        missing_required_titles=[r.title for r in missing_required],
    )


# ---- Bundle files -----------------------------------------------------------


@dataclass
class BundleFileEntry:
    """An available file reachable from a bundle, with its requirement context."""

    file: object  # DocumentFile
    requirement_id: int
    requirement_title: str
    document_id: int
    document_title: str


@dataclass
class BundleMissingItem:
    """A bundle requirement that points at a document/file but has nothing usable."""

    requirement_id: int
    requirement_title: str
    document_id: int | None
    document_title: str | None
    reason: str  # "no_file" | "file_trashed" | "document_trashed"


@dataclass
class BundleFilesResult:
    files: list
    missing: list

    @property
    def total_size(self) -> int:
        return sum(entry.file.file_size for entry in self.files)


def collect_bundle_files(bundle) -> BundleFilesResult:
    """
    Gather the available files reachable from a bundle's requirements, plus the
    requirements that are still missing a usable file.

    Sources, per requirement:
      * an explicitly linked file → that single file
      * a linked document (no explicit file) → all of the document's live files

    Trashed/deleted files and trashed documents are excluded from ``files`` and
    surfaced in ``missing`` instead. Files are de-duplicated across requirements.
    Owner isolation is the caller's responsibility (resolve the bundle by owner).
    """
    files: list[BundleFileEntry] = []
    missing: list[BundleMissingItem] = []
    seen_file_ids: set[int] = set()

    requirements = (
        bundle.requirements.select_related(
            "linked_document", "linked_file", "linked_file__document"
        )
        .prefetch_related("linked_document__files")
        .all()
    )

    for req in requirements:
        if req.linked_file_id:
            f = req.linked_file
            doc = f.document
            if f.is_trashed or doc.is_trashed:
                missing.append(
                    BundleMissingItem(
                        requirement_id=req.id,
                        requirement_title=req.title,
                        document_id=doc.id,
                        document_title=doc.title,
                        reason="document_trashed" if doc.is_trashed else "file_trashed",
                    )
                )
            elif f.id not in seen_file_ids:
                seen_file_ids.add(f.id)
                files.append(
                    BundleFileEntry(
                        file=f,
                        requirement_id=req.id,
                        requirement_title=req.title,
                        document_id=doc.id,
                        document_title=doc.title,
                    )
                )
        elif req.linked_document_id:
            doc = req.linked_document
            if doc.is_trashed:
                missing.append(
                    BundleMissingItem(
                        requirement_id=req.id,
                        requirement_title=req.title,
                        document_id=doc.id,
                        document_title=doc.title,
                        reason="document_trashed",
                    )
                )
                continue
            live_files = [x for x in doc.files.all() if not x.is_trashed]
            if not live_files:
                missing.append(
                    BundleMissingItem(
                        requirement_id=req.id,
                        requirement_title=req.title,
                        document_id=doc.id,
                        document_title=doc.title,
                        reason="no_file",
                    )
                )
                continue
            for f in live_files:
                if f.id in seen_file_ids:
                    continue
                seen_file_ids.add(f.id)
                files.append(
                    BundleFileEntry(
                        file=f,
                        requirement_id=req.id,
                        requirement_title=req.title,
                        document_id=doc.id,
                        document_title=doc.title,
                    )
                )

    return BundleFilesResult(files=files, missing=missing)


# ---- Secure room files ------------------------------------------------------


@dataclass
class RoomFileEntry:
    file: object  # DocumentFile
    source_label: str
    item_id: int


@dataclass
class RoomFilesResult:
    files: list
    missing: list

    @property
    def total_size(self) -> int:
        return sum(entry.file.file_size for entry in self.files)


def collect_room_files(room) -> RoomFilesResult:
    """
    Gather the live files exposed by a secure room's items (files, documents,
    proofs), de-duplicated. Trashed files/documents are excluded and reported as
    missing. The room never exposes anything beyond its explicit items.
    """
    files: list[RoomFileEntry] = []
    missing: list = []
    seen: set[int] = set()

    items = (
        room.items.select_related(
            "document",
            "file",
            "file__document",
            "proof",
            "proof__linked_file",
            "proof__linked_file__document",
        )
        .prefetch_related("document__files")
        .all()
    )

    def _add(f, label, item_id):
        if f.id in seen:
            return
        seen.add(f.id)
        files.append(RoomFileEntry(file=f, source_label=label, item_id=item_id))

    for item in items:
        if item.file_id:
            f = item.file
            if f.is_trashed or f.document.is_trashed:
                missing.append({"item_id": item.id, "reason": "file_trashed"})
            else:
                _add(f, f.document.title, item.id)
        elif item.document_id:
            doc = item.document
            if doc.is_trashed:
                missing.append({"item_id": item.id, "reason": "document_trashed"})
                continue
            live = [x for x in doc.files.all() if not x.is_trashed]
            if not live:
                missing.append({"item_id": item.id, "reason": "no_file"})
            for f in live:
                _add(f, doc.title, item.id)
        elif item.proof_id:
            proof = item.proof
            f = proof.linked_file
            if f and not f.is_trashed and not f.document.is_trashed:
                _add(f, f"Proof: {proof.title}", item.id)
            else:
                missing.append({"item_id": item.id, "reason": "no_file"})

    return RoomFilesResult(files=files, missing=missing)


def build_room_zip(room):
    """Build a streamable ZIP of a room's files (used when downloads allowed)."""
    import tempfile
    import zipfile

    result = collect_room_files(room)
    root = _safe_path_component(room.title, "room")
    used: set = set()
    included = 0

    spooled = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    with zipfile.ZipFile(spooled, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in result.files:
            folder = _safe_path_component(entry.source_label, "files")
            filename = _safe_path_component(
                entry.file.original_filename, f"file-{entry.file.id}"
            )
            arcname = _dedupe_arcname(f"{root}/{folder}/{filename}", used)
            if _write_file_to_zip(zf, arcname, entry.file):
                included += 1

    spooled.seek(0)
    zip_filename = (
        f"{_slugify_filename(room.title, 'room')}_"
        f"{timezone.localdate().isoformat()}.zip"
    )
    return spooled, zip_filename, {"files_count": included}


# ---- Timeline aggregation --------------------------------------------------


@dataclass
class TimelineEvent:
    id: str
    event_type: str
    title: str
    description: str
    date: date
    urgency_level: str
    related_document: int | None = None
    related_bundle: int | None = None
    related_checklist: int | None = None
    metadata: dict = field(default_factory=dict)


# Event types the timeline can emit (used for validation + docs).
TIMELINE_EVENT_TYPES = (
    "document_expiry",
    "document_renewal",
    "reminder",
    "checklist_item_due",
    "bundle_target_date",
    "bundle_requirement_due",
)


def _timeline_urgency(event_date: date, today: date) -> str:
    """Urgency derived purely from how soon (or overdue) a date is."""
    days = (event_date - today).days
    if days < 0:
        return "critical"
    if days <= 7:
        return "high"
    if days <= 30:
        return "medium"
    return "low"


def build_timeline(
    user,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    event_type: str | None = None,
    document_id: int | None = None,
    bundle_id: int | None = None,
) -> list:
    """
    Aggregate the authenticated user's upcoming document/bundle events.

    Every query is scoped to ``user`` so the timeline can only ever contain the
    caller's own events. Events are returned sorted by date.
    """
    from .models import (
        DocumentBundle,
        DocumentBundleRequirement,
        DocumentChecklistItem,
        DocumentReminderRule,
    )

    today = timezone.localdate()
    events: list[TimelineEvent] = []

    def in_range(value: date) -> bool:
        if value is None:
            return False
        if start_date and value < start_date:
            return False
        if end_date and value > end_date:
            return False
        return True

    def wants(kind: str) -> bool:
        return event_type is None or event_type == kind

    # Document expiry + renewal dates. Trashed documents are never surfaced.
    documents = Document.objects.filter(owner=user, is_trashed=False).exclude(
        status=Document.Status.ARCHIVED
    )
    if document_id is not None:
        documents = documents.filter(pk=document_id)
    if bundle_id is None:  # document-only filters don't apply to bundle scope
        for doc in documents:
            if wants("document_expiry") and in_range(doc.expiry_date):
                events.append(
                    TimelineEvent(
                        id=f"document_expiry:{doc.pk}",
                        event_type="document_expiry",
                        title=f"{doc.title} expires",
                        description=f"{doc.title} expires on this date.",
                        date=doc.expiry_date,
                        urgency_level=_timeline_urgency(doc.expiry_date, today),
                        related_document=doc.pk,
                        metadata={"document_type": doc.document_type},
                    )
                )
            if wants("document_renewal") and in_range(doc.renewal_date):
                events.append(
                    TimelineEvent(
                        id=f"document_renewal:{doc.pk}",
                        event_type="document_renewal",
                        title=f"Renew {doc.title}",
                        description=f"Renewal date for {doc.title}.",
                        date=doc.renewal_date,
                        urgency_level=_timeline_urgency(doc.renewal_date, today),
                        related_document=doc.pk,
                        metadata={"document_type": doc.document_type},
                    )
                )

    # Reminder rule dates.
    if wants("reminder") and bundle_id is None:
        rules = (
            DocumentReminderRule.objects.filter(owner=user, is_enabled=True)
            .exclude(document__is_trashed=True)
            .select_related("document")
        )
        if document_id is not None:
            rules = rules.filter(document_id=document_id)
        for rule in rules:
            reminder_date = reminder_date_for_rule(rule)
            if not in_range(reminder_date):
                continue
            events.append(
                TimelineEvent(
                    id=f"reminder:{rule.pk}",
                    event_type="reminder",
                    title=f"Reminder: {rule.document.title}",
                    description=rule.get_trigger_type_display(),
                    date=reminder_date,
                    urgency_level=_timeline_urgency(reminder_date, today),
                    related_document=rule.document_id,
                    metadata={"days_before": rule.days_before},
                )
            )

    # Checklist item due dates.
    if wants("checklist_item_due"):
        items = (
            DocumentChecklistItem.objects.filter(owner=user)
            .exclude(status=DocumentChecklistItem.Status.COMPLETED)
            .exclude(status=DocumentChecklistItem.Status.SKIPPED)
            .exclude(checklist__document__is_trashed=True)
            .select_related("checklist")
        )
        if document_id is not None:
            items = items.filter(checklist__document_id=document_id)
        if bundle_id is not None:
            items = items.filter(checklist__bundle_id=bundle_id)
        for item in items:
            if not in_range(item.due_date):
                continue
            events.append(
                TimelineEvent(
                    id=f"checklist_item_due:{item.pk}",
                    event_type="checklist_item_due",
                    title=item.title,
                    description=f"Checklist task in “{item.checklist.title}”.",
                    date=item.due_date,
                    urgency_level=_timeline_urgency(item.due_date, today),
                    related_document=item.checklist.document_id,
                    related_bundle=item.checklist.bundle_id,
                    related_checklist=item.checklist_id,
                    metadata={"is_required": item.is_required},
                )
            )

    # Bundle target + requirement due dates.
    bundles = DocumentBundle.objects.filter(owner=user).exclude(
        status=DocumentBundle.Status.ARCHIVED
    )
    if bundle_id is not None:
        bundles = bundles.filter(pk=bundle_id)
    if document_id is None:
        if wants("bundle_target_date"):
            for bundle in bundles:
                if not in_range(bundle.target_date):
                    continue
                events.append(
                    TimelineEvent(
                        id=f"bundle_target_date:{bundle.pk}",
                        event_type="bundle_target_date",
                        title=f"{bundle.title} target date",
                        description=f"Target date for the “{bundle.title}” bundle.",
                        date=bundle.target_date,
                        urgency_level=_timeline_urgency(bundle.target_date, today),
                        related_bundle=bundle.pk,
                        metadata={"bundle_type": bundle.bundle_type},
                    )
                )
        if wants("bundle_requirement_due"):
            reqs = (
                DocumentBundleRequirement.objects.filter(owner=user)
                .exclude(status=DocumentBundleRequirement.Status.COMPLETED)
                .exclude(status=DocumentBundleRequirement.Status.SKIPPED)
                .select_related("bundle")
            )
            if bundle_id is not None:
                reqs = reqs.filter(bundle_id=bundle_id)
            for req in reqs:
                if not in_range(req.due_date):
                    continue
                events.append(
                    TimelineEvent(
                        id=f"bundle_requirement_due:{req.pk}",
                        event_type="bundle_requirement_due",
                        title=req.title,
                        description=f"Requirement for the “{req.bundle.title}” bundle.",
                        date=req.due_date,
                        urgency_level=_timeline_urgency(req.due_date, today),
                        related_bundle=req.bundle_id,
                        metadata={"is_required": req.is_required},
                    )
                )

    events.sort(key=lambda e: (e.date, e.title.lower()))
    return events


# ---- OCR-assisted extraction (pluggable provider) --------------------------

# Cap how much we ever read/OCR from one file — protects the request from
# pathological inputs and keeps stored raw text bounded.
EXTRACTION_MAX_PAGES = 10
EXTRACTION_MAX_RAW_CHARS = 20_000
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


@dataclass
class ExtractionResult:
    status: str
    provider: str
    raw_text: str
    extracted_fields: dict
    confidence_score: float | None
    error_message: str


def tesseract_available() -> bool:
    """
    Whether a usable Tesseract OCR engine is installed.

    The Python ``pytesseract`` wrapper shells out to the ``tesseract`` binary,
    which is a system dependency. If the binary is missing we degrade gracefully
    to ``needs_review`` rather than failing. Result is cached for the process.
    """
    cached = getattr(tesseract_available, "_cached", None)
    if cached is not None:
        return cached
    available = False
    try:
        import pytesseract  # type: ignore

        pytesseract.get_tesseract_version()
        available = True
    except Exception:  # noqa: BLE001 — optional engine, absence is expected
        available = False
    tesseract_available._cached = available  # type: ignore[attr-defined]
    return available


def _is_pdf(file: DocumentFile) -> bool:
    return (file.content_type == "application/pdf") or (
        file.original_filename.lower().endswith(".pdf")
    )


def _is_image(file: DocumentFile) -> bool:
    if (file.content_type or "").startswith("image/"):
        return True
    ext = os.path.splitext(file.original_filename)[1].lower()
    return ext in _IMAGE_EXTENSIONS


def _extract_pdf_text(file_field) -> str | None:
    """
    Local PDF *text-layer* extraction via ``pypdf`` (no external calls).

    Returns extracted text, or ``None`` when there is no text layer (e.g. a
    scanned PDF) or the library is unavailable. The file is read from local
    storage only — it is never sent anywhere.
    """
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency, degrade gracefully
        return None

    try:
        file_field.open("rb")
        try:
            reader = PdfReader(file_field)
            parts = [
                (page.extract_text() or "")
                for page in reader.pages[:EXTRACTION_MAX_PAGES]
            ]
        finally:
            file_field.close()
        text = "\n".join(parts).strip()
        return text or None
    except Exception:  # noqa: BLE001 — extraction must never crash the request
        logger.warning("PDF text extraction failed", exc_info=True)
        return None


def _ocr_image_bytes(data: bytes) -> str | None:
    """OCR a single image's bytes with Tesseract; ``None`` on any failure."""
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
        from io import BytesIO

        with Image.open(BytesIO(data)) as image:
            return (pytesseract.image_to_string(image) or "").strip() or None
    except Exception:  # noqa: BLE001 — OCR must never crash the request
        logger.warning("Image OCR failed", exc_info=True)
        return None


def _ocr_pdf(file_field) -> str | None:
    """
    OCR a scanned PDF by rasterizing pages (``pdf2image`` + poppler) and running
    Tesseract on each. ``None`` when the toolchain is unavailable or fails.
    """
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_bytes  # type: ignore

        file_field.open("rb")
        try:
            data = file_field.read()
        finally:
            file_field.close()
        images = convert_from_bytes(data, first_page=1, last_page=EXTRACTION_MAX_PAGES)
        parts = [(pytesseract.image_to_string(img) or "") for img in images]
        text = "\n".join(parts).strip()
        return text or None
    except Exception:  # noqa: BLE001 — OCR must never crash the request
        logger.warning("PDF OCR failed", exc_info=True)
        return None


def _read_file_bytes(file_field) -> bytes | None:
    try:
        file_field.open("rb")
        try:
            return file_field.read()
        finally:
            file_field.close()
    except Exception:  # noqa: BLE001
        logger.warning("Reading file for OCR failed", exc_info=True)
        return None


def extract_file_details(file: DocumentFile) -> ExtractionResult:
    """
    Run extraction for a single file, preferring a real text layer and falling
    back to local OCR.

    Order of attempts:
      1. PDF text layer (``pypdf``) — fast, exact, no OCR needed.
      2. Local OCR (Tesseract) for images, and for scanned PDFs with no text
         layer — only when the engine is installed.

    Files are never sent to a third-party service. When nothing reliable can be
    read (no text, no OCR engine, encrypted PDF) the result is a graceful
    ``needs_review`` with no fields. Extracted fields are always *suggestions*:
    applying them to a document still requires explicit owner review.
    """
    raw_text: str | None = None
    provider = "local_text"

    if _is_pdf(file):
        raw_text = _extract_pdf_text(file.file)
        if not raw_text and tesseract_available():
            ocr_text = _ocr_pdf(file.file)
            if ocr_text:
                raw_text = ocr_text
                provider = "local_ocr"
    elif _is_image(file) and tesseract_available():
        data = _read_file_bytes(file.file)
        if data:
            raw_text = _ocr_image_bytes(data)
            provider = "local_ocr"

    if not raw_text:
        return ExtractionResult(
            status="needs_review",
            provider=provider,
            raw_text="",
            extracted_fields={},
            confidence_score=None,
            error_message="",
        )

    fields = _guess_fields_from_text(raw_text)
    # Text layers are more trustworthy than OCR; more fields → more confidence.
    base = 0.5 if provider == "local_text" else 0.35
    confidence = min(0.9, base + 0.08 * len(fields)) if fields else 0.1
    return ExtractionResult(
        status="needs_review",
        provider=provider,
        raw_text=raw_text[:EXTRACTION_MAX_RAW_CHARS],
        extracted_fields=fields,
        confidence_score=round(confidence, 2),
        error_message="",
    )


# Month names → number, for parsing "12 Jan 2026" style dates.
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_DOC_TYPE_KEYWORDS = [
    ("passport", "passport"),
    ("visa", "visa"),
    ("residence permit", "residence_permit"),
    ("driving licence", "driving_licence"),
    ("driver license", "driving_licence"),
    ("driving license", "driving_licence"),
    ("identity card", "id_card"),
    ("national id", "id_card"),
    ("insurance", "insurance"),
    ("certificate", "certificate"),
]


def _normalize_date(raw: str) -> str | None:
    """Normalize a matched date string to ISO ``YYYY-MM-DD``, or ``None``."""
    import re

    raw = raw.strip()
    # YYYY-MM-DD (already ISO).
    m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", raw)
    if m:
        y, mo, d = (int(g) for g in m.groups())
    else:
        # DD-MM-YYYY / DD/MM/YYYY (day-first, the common non-US form).
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", raw)
        if m:
            d, mo, y = (int(g) for g in m.groups())
        else:
            # DD Mon YYYY  /  Mon DD, YYYY
            m = re.fullmatch(
                r"(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})", raw
            )
            if m:
                d, mon_name, y = m.group(1), m.group(2), m.group(3)
                mo = _MONTHS.get(mon_name[:3].lower())
                d, y = int(d), int(y)
            else:
                m = re.fullmatch(
                    r"([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})", raw
                )
                if not m:
                    return None
                mon_name, d, y = m.group(1), m.group(2), m.group(3)
                mo = _MONTHS.get(mon_name[:3].lower())
                d, y = int(d), int(y)
    if not mo or not (1 <= mo <= 12) or not (1 <= d <= 31):
        return None
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


_DATE_PATTERN = (
    r"(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}"
    r"|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}"
    r"|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}"
    r"|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})"
)


def _guess_fields_from_text(text: str) -> dict:
    """
    Heuristic field guesses from extracted/OCR'd text.

    This is a pragmatic parser, not an AI model: it looks for labelled values
    ("Date of expiry: …", "Passport No: …") with sensible fallbacks. Everything
    it finds is surfaced for the owner to review and edit before applying — we
    never auto-write these onto the document.
    """
    import re

    fields: dict = {}
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    lower = text.lower()

    # Title: first reasonably long line.
    for line in lines:
        if len(line) >= 3:
            fields["title"] = line[:120]
            break

    # Document type: first keyword that appears anywhere.
    for keyword, value in _DOC_TYPE_KEYWORDS:
        if keyword in lower:
            fields["document_type"] = value
            break

    # Reference / document number: prefer a labelled value, else a token.
    ref_label = re.search(
        r"(?:passport|document|licen[cs]e|reference|policy|certificate)"
        r"\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\- ]{4,16})",
        text,
        re.IGNORECASE,
    )
    if ref_label:
        candidate = ref_label.group(1).strip().rstrip("-")
        if any(ch.isdigit() for ch in candidate):
            fields["reference_number"] = candidate
    if "reference_number" not in fields:
        token = re.search(r"\b([A-Z]{1,3}\d{5,9})\b", text)
        if token:
            fields["reference_number"] = token.group(1)

    # Labelled dates.
    def labelled_date(label_pattern: str) -> str | None:
        m = re.search(
            label_pattern + r"\s*[:\-]?\s*" + _DATE_PATTERN,
            text,
            re.IGNORECASE,
        )
        return _normalize_date(m.group(1)) if m else None

    issue = labelled_date(r"(?:date\s+of\s+issue|issued|issue\s*date)")
    if issue:
        fields["issue_date"] = issue
    expiry = labelled_date(
        r"(?:date\s+of\s+expiry|expiry|expires|valid\s+until|valid\s+to|"
        r"expiration)"
    )
    if expiry:
        fields["expiry_date"] = expiry

    # Fallback: if labels were missing, use the spread of all dates found.
    if "issue_date" not in fields or "expiry_date" not in fields:
        found = []
        for match in re.findall(_DATE_PATTERN, text):
            iso = _normalize_date(match)
            if iso:
                found.append(iso)
        found = sorted(set(found))
        if found:
            fields.setdefault("issue_date", found[0])
            if len(found) > 1:
                fields.setdefault("expiry_date", found[-1])

    # Issuer / country labels (kept conservative).
    issuer = re.search(
        r"(?:issued\s+by|issuing\s+authority|authority)\s*[:\-]\s*(.+)",
        text,
        re.IGNORECASE,
    )
    if issuer:
        fields["issuer"] = issuer.group(1).strip()[:120]
    country = re.search(
        r"(?:country(?:\s+of\s+issue)?|nationality)\s*[:\-]\s*([A-Za-z ]{3,40})",
        text,
        re.IGNORECASE,
    )
    if country:
        fields["country"] = country.group(1).strip()[:80]

    return fields


# ---- Version history -------------------------------------------------------

# Document metadata fields that are snapshotted into a version and compared to
# decide whether an update is "important" enough to record.
VERSIONED_FIELDS = (
    "title",
    "document_type",
    "issuer",
    "country",
    "reference_number",
    "issue_date",
    "expiry_date",
    "renewal_date",
    "notes",
)


def next_version_number(document) -> int:
    """The next sequential version number for a document (1-based)."""
    from django.db.models import Max

    current = document.versions.aggregate(n=Max("version_number"))["n"] or 0
    return current + 1


def record_document_version(
    document,
    *,
    version_type: str,
    created_by=None,
    file=None,
    change_summary: str = "",
    metadata: dict | None = None,
) -> DocumentVersion:
    """
    Snapshot a document's current metadata (and optional file display info) as a
    new version. Snapshots never include internal storage paths.
    """
    return DocumentVersion.objects.create(
        owner=document.owner,
        document=document,
        file=file,
        version_number=next_version_number(document),
        version_type=version_type,
        title_snapshot=document.title or "",
        document_type_snapshot=document.document_type or "",
        issuer_snapshot=document.issuer or "",
        country_snapshot=document.country or "",
        reference_number_snapshot=document.reference_number or "",
        issue_date_snapshot=document.issue_date,
        expiry_date_snapshot=document.expiry_date,
        renewal_date_snapshot=document.renewal_date,
        notes_snapshot=document.notes or "",
        file_name_snapshot=(file.original_filename if file else ""),
        file_size_snapshot=(file.file_size if file else None),
        file_content_type_snapshot=(file.content_type if file else ""),
        change_summary=change_summary[:255],
        created_by=created_by,
        metadata=metadata or {},
    )


def summarize_field_changes(before: dict, after: dict) -> str:
    """Build a short human-readable summary of which versioned fields changed."""
    labels = {
        "title": "title",
        "document_type": "type",
        "issuer": "issuer",
        "country": "country",
        "reference_number": "reference",
        "issue_date": "issue date",
        "expiry_date": "expiry date",
        "renewal_date": "renewal date",
        "notes": "notes",
    }
    changed = [
        labels[f]
        for f in VERSIONED_FIELDS
        if before.get(f) != after.get(f)
    ]
    if not changed:
        return ""
    return "Updated " + ", ".join(changed)


# ---- Document-level activity log -------------------------------------------


def log_document_activity(
    *,
    owner,
    action: str,
    document=None,
    actor_type: str = "owner",
    title: str = "",
    description: str = "",
    related_file=None,
    related_checklist=None,
    related_bundle=None,
    related_proof=None,
    metadata: dict | None = None,
) -> None:
    """
    Record one document-level activity event. Never raises: a logging failure
    must not break the user-facing action.
    """
    try:
        DocumentActivity.objects.create(
            owner=owner,
            document=document,
            action=action,
            actor_type=actor_type,
            title=title[:255],
            description=description[:500],
            related_file=related_file,
            related_checklist=related_checklist,
            related_bundle=related_bundle,
            related_proof=related_proof,
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — logging must never break the flow
        logger.warning("Failed to record document activity", exc_info=True)


# ---- Structured export builder ---------------------------------------------


def _document_export_row(document) -> dict:
    """Safe per-document export dict — no file paths, tokens, or access codes."""
    health = get_document_health(document)
    return {
        "id": document.id,
        "title": document.title,
        "document_type": document.document_type,
        "issuer": document.issuer,
        "country": document.country,
        "reference_number": document.reference_number or "",
        "category": document.category.name if document.category_id else "",
        "status": document.status,
        "computed_status": health.computed_status,
        "issue_date": document.issue_date.isoformat() if document.issue_date else "",
        "expiry_date": (
            document.expiry_date.isoformat() if document.expiry_date else ""
        ),
        "renewal_date": (
            document.renewal_date.isoformat() if document.renewal_date else ""
        ),
        "notes": document.notes,
        "file_count": document.files.filter(is_trashed=False).count(),
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


def _document_file_export_row(file) -> dict:
    """Safe per-file export dict — display metadata only, never storage paths."""
    return {
        "id": file.id,
        "document": file.document_id,
        "original_filename": file.original_filename,
        "content_type": file.content_type,
        "file_size": file.file_size,
        "checksum": file.checksum,
        "is_previewable": file.is_previewable,
        "created_at": file.created_at.isoformat(),
        "updated_at": file.updated_at.isoformat(),
    }


def build_export_payload(user, export_type: str) -> dict:
    """
    Assemble the full structured export for a user.

    Deliberately excludes raw files, internal storage paths, share tokens, and
    access codes. Raw OCR text is never included.
    """
    from .models import (
        DocumentBundle,
        DocumentChecklist,
        DocumentFileShareLink,
        DocumentReminderRule,
    )

    documents = (
        Document.objects.filter(owner=user, is_trashed=False)
        .select_related("category")
        .prefetch_related("files")
    )
    payload: dict = {
        "exported_at": timezone.now().isoformat(),
        "export_type": export_type,
        "document_count": documents.count(),
        "documents": [_document_export_row(d) for d in documents],
    }

    if export_type == DocumentExportRequest.ExportType.DOCUMENTS_JSON:
        return payload

    # full_vault_metadata adds related summaries (still secret-free).
    checklists = (
        DocumentChecklist.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .prefetch_related("items")
    )
    payload["checklists"] = [
        {
            "id": c.id,
            "title": c.title,
            "document": c.document_id,
            "bundle": c.bundle_id,
            "status": c.status,
            "progress_percent": c.progress_percent,
            "due_date": c.due_date.isoformat() if c.due_date else "",
        }
        for c in checklists
    ]
    bundles = DocumentBundle.objects.filter(owner=user)
    payload["bundles"] = [
        {
            "id": b.id,
            "title": b.title,
            "bundle_type": b.bundle_type,
            "status": b.status,
            "readiness_score": b.readiness_score,
            "target_date": b.target_date.isoformat() if b.target_date else "",
        }
        for b in bundles
    ]
    reminders = (
        DocumentReminderRule.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .select_related("document")
    )
    payload["reminders"] = [
        {
            "id": r.id,
            "document": r.document_id,
            "trigger_type": r.trigger_type,
            "days_before": r.days_before,
            "is_enabled": r.is_enabled,
        }
        for r in reminders
    ]
    # Share-link SUMMARY only — never tokens or access codes.
    share_links = DocumentFileShareLink.objects.filter(owner=user).exclude(
        document__is_trashed=True
    )
    payload["share_links"] = [
        {
            "id": s.id,
            "document": s.document_id,
            "permission": s.permission,
            "access_code_required": s.access_code_required,
            "expires_at": s.expires_at.isoformat() if s.expires_at else "",
            "revoked": s.is_revoked,
        }
        for s in share_links
    ]
    return payload


def _bundle_requirement_export_row(requirement) -> dict:
    linked_document = requirement.linked_document
    linked_file = requirement.linked_file
    safe_document = (
        linked_document
        if linked_document is not None and not linked_document.is_trashed
        else None
    )
    safe_file = (
        linked_file
        if (
            linked_file is not None
            and not linked_file.is_trashed
            and not linked_file.document.is_trashed
        )
        else None
    )

    return {
        "id": requirement.id,
        "title": requirement.title,
        "description": requirement.description,
        "is_required": requirement.is_required,
        "requirement_type": requirement.requirement_type,
        "expected_document_type": requirement.expected_document_type,
        "status": requirement.status,
        "is_satisfied": requirement.is_satisfied,
        "due_date": requirement.due_date.isoformat() if requirement.due_date else "",
        "sort_order": requirement.sort_order,
        "notes": requirement.notes,
        "linked_document": (
            _document_export_row(safe_document) if safe_document is not None else None
        ),
        "linked_file": (
            _document_file_export_row(safe_file) if safe_file is not None else None
        ),
        "created_at": requirement.created_at.isoformat(),
        "updated_at": requirement.updated_at.isoformat(),
    }


def build_bundle_export_payload(user, bundle, export_type: str) -> dict:
    """
    Assemble a single-bundle metadata export.

    This deliberately excludes raw files, internal storage paths, share tokens,
    access codes, and raw OCR text. Linked files are represented by safe display
    metadata only.
    """
    from .models import DocumentChecklist, ProofRecord

    readiness = bundle_readiness(bundle)
    requirements = (
        bundle.requirements.filter(owner=user)
        .select_related(
            "linked_document__category",
            "linked_file",
            "linked_file__document",
        )
        .order_by("sort_order", "created_at")
    )
    requirement_rows = [_bundle_requirement_export_row(r) for r in requirements]

    checklists = (
        DocumentChecklist.objects.filter(owner=user, bundle=bundle)
        .prefetch_related("items")
        .order_by("-created_at")
    )
    checklist_rows = []
    for checklist in checklists:
        progress = checklist_progress(checklist)
        checklist_rows.append(
            {
                "id": checklist.id,
                "title": checklist.title,
                "description": checklist.description,
                "checklist_type": checklist.checklist_type,
                "status": checklist.status,
                "progress_percent": checklist.progress_percent,
                "progress": {
                    "percent": progress.percent,
                    "total_items": progress.total_items,
                    "completed_items": progress.completed_items,
                    "skipped_items": progress.skipped_items,
                    "required_items": progress.required_items,
                    "required_completed": progress.required_completed,
                    "required_incomplete": progress.required_incomplete,
                },
                "due_date": checklist.due_date.isoformat() if checklist.due_date else "",
                "items": [
                    {
                        "id": item.id,
                        "title": item.title,
                        "description": item.description,
                        "is_required": item.is_required,
                        "status": item.status,
                        "due_date": item.due_date.isoformat() if item.due_date else "",
                        "linked_document": item.linked_document_id,
                        "linked_file": item.linked_file_id,
                        "completed_at": (
                            item.completed_at.isoformat()
                            if item.completed_at
                            else ""
                        ),
                        "sort_order": item.sort_order,
                        "notes": item.notes,
                    }
                    for item in checklist.items.all()
                ],
                "created_at": checklist.created_at.isoformat(),
                "updated_at": checklist.updated_at.isoformat(),
            }
        )

    proof_records = (
        ProofRecord.objects.filter(owner=user, bundle=bundle)
        .select_related("document", "checklist", "linked_file")
        .order_by("-created_at")
    )
    proof_rows = [
        {
            "id": proof.id,
            "title": proof.title,
            "proof_type": proof.proof_type,
            "status": proof.status,
            "document": proof.document_id,
            "checklist": proof.checklist_id,
            "linked_file": proof.linked_file_id,
            "reference_number": proof.reference_number,
            "submitted_to": proof.submitted_to,
            "submitted_at": proof.submitted_at.isoformat() if proof.submitted_at else "",
            "notes": proof.notes,
            "created_at": proof.created_at.isoformat(),
            "updated_at": proof.updated_at.isoformat(),
        }
        for proof in proof_records
    ]

    return {
        "exported_at": timezone.now().isoformat(),
        "export_type": export_type,
        "scope": "bundle",
        "bundle": {
            "id": bundle.id,
            "title": bundle.title,
            "description": bundle.description,
            "bundle_type": bundle.bundle_type,
            "status": bundle.status,
            "country": bundle.country,
            "authority_or_provider": bundle.authority_or_provider,
            "target_date": bundle.target_date.isoformat() if bundle.target_date else "",
            "notes": bundle.notes,
            "readiness_score": bundle.readiness_score,
            "created_at": bundle.created_at.isoformat(),
            "updated_at": bundle.updated_at.isoformat(),
        },
        "readiness": {
            "score": readiness.score,
            "is_ready": readiness.is_ready,
            "total_requirements": readiness.total_requirements,
            "required_total": readiness.required_total,
            "required_satisfied": readiness.required_satisfied,
            "required_missing": readiness.required_missing,
            "optional_total": readiness.optional_total,
            "optional_satisfied": readiness.optional_satisfied,
            "missing_required_titles": readiness.missing_required_titles,
        },
        "counts": {
            "requirements": len(requirement_rows),
            "checklists": len(checklist_rows),
            "proof_records": len(proof_rows),
        },
        "requirements": requirement_rows,
        "checklists": checklist_rows,
        "proof_records": proof_rows,
    }


def export_payload_to_csv(payload: dict) -> str:
    """Flatten the documents list of an export payload into CSV text."""
    import csv
    import io

    rows = payload.get("documents", [])
    output = io.StringIO()
    fieldnames = [
        "id", "title", "document_type", "issuer", "country",
        "reference_number", "category", "status", "computed_status",
        "issue_date", "expiry_date", "renewal_date", "file_count",
        "created_at", "updated_at",
    ]
    writer = csv.DictWriter(
        output, fieldnames=fieldnames, extrasaction="ignore"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def bundle_export_payload_to_csv(payload: dict) -> str:
    """Flatten bundle requirements into a reviewer-friendly CSV."""
    import csv
    import io

    output = io.StringIO()
    fieldnames = [
        "bundle_id",
        "bundle_title",
        "readiness_score",
        "requirement_id",
        "title",
        "is_required",
        "requirement_type",
        "status",
        "is_satisfied",
        "due_date",
        "expected_document_type",
        "linked_document_id",
        "linked_document_title",
        "linked_file_id",
        "linked_file_name",
        "notes",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    bundle = payload.get("bundle", {})
    readiness = payload.get("readiness", {})
    for requirement in payload.get("requirements", []):
        linked_document = requirement.get("linked_document") or {}
        linked_file = requirement.get("linked_file") or {}
        writer.writerow(
            {
                "bundle_id": bundle.get("id", ""),
                "bundle_title": bundle.get("title", ""),
                "readiness_score": readiness.get("score", ""),
                "requirement_id": requirement.get("id", ""),
                "title": requirement.get("title", ""),
                "is_required": requirement.get("is_required", ""),
                "requirement_type": requirement.get("requirement_type", ""),
                "status": requirement.get("status", ""),
                "is_satisfied": requirement.get("is_satisfied", ""),
                "due_date": requirement.get("due_date", ""),
                "expected_document_type": requirement.get("expected_document_type", ""),
                "linked_document_id": linked_document.get("id", ""),
                "linked_document_title": linked_document.get("title", ""),
                "linked_file_id": linked_file.get("id", ""),
                "linked_file_name": linked_file.get("original_filename", ""),
                "notes": requirement.get("notes", ""),
            }
        )
    return output.getvalue()


class ExportGenerationError(Exception):
    """Raised when a structured export cannot be generated."""


def create_document_export(user, export_type: str) -> DocumentExportRequest:
    """
    Create and synchronously generate a metadata export for one user.

    The export payload comes from ``build_export_payload``, which deliberately
    excludes raw files, internal storage paths, share tokens, and access codes.
    """
    export = DocumentExportRequest.objects.create(
        owner=user,
        export_type=export_type,
        status=DocumentExportRequest.Status.PROCESSING,
    )
    try:
        payload = build_export_payload(user, export_type)
        if export_type == DocumentExportRequest.ExportType.DOCUMENTS_CSV:
            content = export_payload_to_csv(payload).encode("utf-8")
            ext, suffix = ".csv", "csv"
        else:
            content = json.dumps(payload, indent=2).encode("utf-8")
            ext, suffix = ".json", "json"
        export.file.save(
            f"duenest-export-{export.id}-{suffix}{ext}",
            ContentFile(content),
            save=False,
        )
        export.status = DocumentExportRequest.Status.COMPLETED
        export.completed_at = timezone.now()
        export.expires_at = timezone.now() + timedelta(days=EXPORT_TTL_DAYS)
        export.metadata = {"document_count": payload.get("document_count", 0)}
        export.save()
    except Exception as exc:  # noqa: BLE001 — caller surfaces the failure
        export.status = DocumentExportRequest.Status.FAILED
        export.error_message = "Export generation failed."
        export.save(update_fields=["status", "error_message"])
        raise ExportGenerationError("Export generation failed.") from exc

    log_document_activity(
        owner=user,
        action=DocumentActivity.Action.EXPORT_REQUESTED,
        title="Export requested",
        description=export.get_export_type_display(),
    )
    return export


def create_bundle_export(user, bundle, export_type: str) -> DocumentExportRequest:
    """
    Create and synchronously generate a metadata export for one user bundle.
    """
    export = DocumentExportRequest.objects.create(
        owner=user,
        export_type=export_type,
        status=DocumentExportRequest.Status.PROCESSING,
        metadata={"scope": "bundle", "bundle_id": bundle.id},
    )
    try:
        payload = build_bundle_export_payload(user, bundle, export_type)
        if export_type == DocumentExportRequest.ExportType.BUNDLE_REQUIREMENTS_CSV:
            content = bundle_export_payload_to_csv(payload).encode("utf-8")
            ext, suffix = ".csv", "bundle-requirements"
        else:
            content = json.dumps(payload, indent=2).encode("utf-8")
            ext, suffix = ".json", "bundle-metadata"
        export.file.save(
            f"duenest-bundle-{bundle.id}-export-{export.id}-{suffix}{ext}",
            ContentFile(content),
            save=False,
        )
        export.status = DocumentExportRequest.Status.COMPLETED
        export.completed_at = timezone.now()
        export.expires_at = timezone.now() + timedelta(days=EXPORT_TTL_DAYS)
        export.metadata = {
            "scope": "bundle",
            "bundle_id": bundle.id,
            "bundle_title": bundle.title,
            **payload.get("counts", {}),
        }
        export.save()
    except Exception as exc:  # noqa: BLE001 — caller surfaces the failure
        export.status = DocumentExportRequest.Status.FAILED
        export.error_message = "Bundle export generation failed."
        export.save(update_fields=["status", "error_message"])
        raise ExportGenerationError("Bundle export generation failed.") from exc

    log_document_activity(
        owner=user,
        action=DocumentActivity.Action.EXPORT_REQUESTED,
        title="Bundle export requested",
        description=export.get_export_type_display(),
        related_bundle=bundle,
        metadata={"export_type": export.export_type, "bundle_id": bundle.id},
    )
    return export


# ---- File ZIP exports -------------------------------------------------------


def _safe_path_component(name: str, fallback: str = "file") -> str:
    """Sanitize a single ZIP path segment (no separators, no traversal)."""
    import re

    cleaned = re.sub(r"[^\w\-. ]", "_", (name or "").strip(), flags=re.UNICODE)
    cleaned = cleaned.strip(". ").strip()
    return cleaned or fallback


def _slugify_filename(name: str, fallback: str = "export") -> str:
    import re

    slug = re.sub(r"[^\w]+", "_", (name or "").strip().lower(), flags=re.UNICODE)
    return slug.strip("_") or fallback


def _dedupe_arcname(arcname: str, used: set) -> str:
    """Return a unique arcname, appending ' (2)', ' (3)', … before the suffix."""
    if arcname not in used:
        used.add(arcname)
        return arcname
    directory, _, filename = arcname.rpartition("/")
    stem, dot, ext = filename.rpartition(".")
    counter = 2
    while True:
        if dot:
            candidate_name = f"{stem} ({counter}).{ext}"
        else:
            candidate_name = f"{filename} ({counter})"
        candidate = f"{directory}/{candidate_name}" if directory else candidate_name
        if candidate not in used:
            used.add(candidate)
            return candidate
        counter += 1


def _write_file_to_zip(zf, arcname, document_file) -> bool:
    """Stream one file into the archive. Returns False if it is missing."""
    import zipfile

    try:
        with document_file.file.open("rb") as fh:
            zf.writestr(
                zipfile.ZipInfo(arcname), fh.read(), zipfile.ZIP_DEFLATED
            )
    except (FileNotFoundError, OSError, ValueError):
        return False
    return True


def build_bundle_manifest(
    user, bundle, included_files: list, missing: list, warnings: list
) -> dict:
    """
    Build the bundle_manifest.json payload that travels inside the ZIP.

    Reuses the safe metadata export (no internal paths, tokens, or access codes)
    and adds the concrete list of files that were packaged.
    """
    payload = build_bundle_export_payload(
        user, bundle, DocumentExportRequest.ExportType.BUNDLE_METADATA_JSON
    )
    included_documents = sorted(
        {f["document"] for f in included_files if f.get("document")}
    )
    return {
        "bundle_name": bundle.title,
        "bundle_type": bundle.bundle_type,
        "deadline": bundle.target_date.isoformat() if bundle.target_date else "",
        "readiness_score": payload["readiness"]["score"],
        "exported_at": timezone.now().isoformat(),
        "included_documents": included_documents,
        "included_files": included_files,
        "missing_required_items": payload["readiness"]["missing_required_titles"],
        "missing_files": [
            {
                "requirement": m.requirement_title,
                "document": m.document_title,
                "reason": m.reason,
            }
            for m in missing
        ],
        "proof_records_summary": {
            "total": payload["counts"]["proof_records"],
        },
        "checklist_progress_summary": [
            {
                "title": c["title"],
                "progress_percent": c["progress_percent"],
                "status": c["status"],
            }
            for c in payload["checklists"]
        ],
        "warnings": warnings,
    }


def build_bundle_zip(user, bundle, *, file_ids=None):
    """
    Build a streamable ZIP of a bundle's files plus a manifest.

    Returns ``(spooled_file, zip_filename, summary)``. Trashed/unavailable files
    are never included; selected exports keep only owned files in ``file_ids``;
    physically-missing files are skipped and reported in the manifest warnings.
    No internal storage path is ever exposed.
    """
    import tempfile
    import zipfile

    result = collect_bundle_files(bundle)
    entries = result.files
    if file_ids is not None:
        wanted = {int(fid) for fid in file_ids}
        entries = [e for e in entries if e.file.id in wanted]

    root = _safe_path_component(bundle.title, "bundle")
    used_arcnames: set = set()
    included_files: list = []
    warnings: list = []
    skipped = 0

    spooled = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    with zipfile.ZipFile(spooled, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in entries:
            folder = _safe_path_component(
                entry.requirement_title or entry.document_title, "files"
            )
            filename = _safe_path_component(
                entry.file.original_filename, f"file-{entry.file.id}"
            )
            arcname = _dedupe_arcname(f"{root}/{folder}/{filename}", used_arcnames)
            if not _write_file_to_zip(zf, arcname, entry.file):
                skipped += 1
                warnings.append(
                    f"“{entry.file.original_filename}” was missing from storage "
                    "and was skipped."
                )
                continue
            included_files.append(
                {
                    "path": arcname,
                    "filename": entry.file.original_filename,
                    "document": entry.document_title,
                    "requirement": entry.requirement_title,
                    "size": entry.file.file_size,
                    "content_type": entry.file.content_type,
                }
            )

        # Warn about expired documents that were included.
        today = timezone.localdate()
        doc_ids = {e.document_id for e in entries}
        for doc in Document.objects.filter(
            id__in=doc_ids, owner=user, expiry_date__lt=today
        ):
            warnings.append(f"“{doc.title}” is expired.")

        manifest = build_bundle_manifest(
            user, bundle, included_files, result.missing, warnings
        )
        zf.writestr(
            f"{root}/bundle_manifest.json", json.dumps(manifest, indent=2)
        )

    spooled.seek(0)
    zip_filename = (
        f"{_slugify_filename(bundle.title, 'bundle')}_{today.isoformat()}.zip"
    )
    summary = {
        "documents_count": len(
            {f["document"] for f in included_files if f.get("document")}
        ),
        "files_count": len(included_files),
        "missing_count": len(result.missing),
        "skipped_count": skipped,
    }

    log_document_activity(
        owner=user,
        action=DocumentActivity.Action.EXPORT_REQUESTED,
        title="Bundle files exported (ZIP)",
        description=bundle.title,
        related_bundle=bundle,
        metadata={"scope": "bundle_zip", "bundle_id": bundle.id, **summary},
    )
    return spooled, zip_filename, summary


def build_documents_zip(user, file_ids):
    """
    Build a streamable ZIP of selected owned document files (outside any bundle).

    Only the caller's own, non-trashed files are included. Files are grouped by
    their document title. Returns ``(spooled_file, zip_filename, summary)``.
    """
    import tempfile
    import zipfile

    files = list(
        DocumentFile.objects.filter(
            id__in=[int(f) for f in file_ids],
            document__owner=user,
            is_trashed=False,
            document__is_trashed=False,
        ).select_related("document")
    )

    root = "DueNest_Files"
    used_arcnames: set = set()
    included_files: list = []
    warnings: list = []
    skipped = 0

    spooled = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    with zipfile.ZipFile(spooled, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            folder = _safe_path_component(f.document.title, "Document")
            filename = _safe_path_component(f.original_filename, f"file-{f.id}")
            arcname = _dedupe_arcname(f"{root}/{folder}/{filename}", used_arcnames)
            if not _write_file_to_zip(zf, arcname, f):
                skipped += 1
                warnings.append(
                    f"“{f.original_filename}” was missing from storage and was skipped."
                )
                continue
            included_files.append(
                {
                    "path": arcname,
                    "filename": f.original_filename,
                    "document": f.document.title,
                    "size": f.file_size,
                    "content_type": f.content_type,
                }
            )
        manifest = {
            "exported_at": timezone.now().isoformat(),
            "scope": "documents",
            "included_files": included_files,
            "warnings": warnings,
        }
        zf.writestr(f"{root}/manifest.json", json.dumps(manifest, indent=2))

    spooled.seek(0)
    zip_filename = f"duenest_files_{timezone.localdate().isoformat()}.zip"
    summary = {"files_count": len(included_files), "skipped_count": skipped}

    log_document_activity(
        owner=user,
        action=DocumentActivity.Action.EXPORT_REQUESTED,
        title="Document files exported (ZIP)",
        description=f"{len(included_files)} file(s)",
        metadata={"scope": "documents_zip", **summary},
    )
    return spooled, zip_filename, summary
