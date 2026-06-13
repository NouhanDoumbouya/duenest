"""Document service helpers.

Activity logging must never break the main preview/download/share flow, so
``log_activity`` swallows its own errors. Access codes are never logged.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.utils import timezone

from .models import Document, DocumentFile, DocumentFileActivity

logger = logging.getLogger(__name__)

EXPIRING_SOON_DAYS = 90

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

    # Document expiry + renewal dates.
    documents = Document.objects.filter(owner=user).exclude(
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
        rules = DocumentReminderRule.objects.filter(
            owner=user, is_enabled=True
        ).select_related("document")
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


@dataclass
class ExtractionResult:
    status: str
    provider: str
    raw_text: str
    extracted_fields: dict
    confidence_score: float | None
    error_message: str


def _extract_pdf_text(file_field) -> str | None:
    """
    Best-effort local PDF text extraction.

    Returns extracted text, or ``None`` when no text layer / no library is
    available. We never add a hard dependency: if ``pypdf`` is not installed we
    simply fall back to a graceful "needs review" result. The file is read from
    local storage only — it is never sent anywhere.
    """
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency, degrade gracefully
        return None

    try:
        file_field.open("rb")
        try:
            reader = PdfReader(file_field)
            parts = []
            for page in reader.pages[:10]:  # cap pages for safety
                parts.append(page.extract_text() or "")
        finally:
            file_field.close()
        text = "\n".join(parts).strip()
        return text or None
    except Exception:  # noqa: BLE001 — extraction must never crash the request
        logger.warning("PDF text extraction failed", exc_info=True)
        return None


def extract_file_details(file: DocumentFile) -> ExtractionResult:
    """
    Run the extraction foundation for a single file.

    This is intentionally conservative: when no reliable text can be obtained
    (image scans, no local library, encrypted PDFs) it returns a graceful
    ``needs_review`` result rather than failing. Extracted fields are only ever
    *suggestions* — applying them to a document requires explicit owner review.
    """
    is_pdf = (file.content_type == "application/pdf") or (
        file.original_filename.lower().endswith(".pdf")
    )

    raw_text = _extract_pdf_text(file.file) if is_pdf else None

    if not raw_text:
        return ExtractionResult(
            status="needs_review",
            provider="local_text",
            raw_text="",
            extracted_fields={},
            confidence_score=None,
            error_message="",
        )

    fields = _guess_fields_from_text(raw_text)
    return ExtractionResult(
        status="needs_review",
        provider="local_text",
        raw_text=raw_text[:20_000],
        extracted_fields=fields,
        confidence_score=0.4 if fields else 0.1,
        error_message="",
    )


def _guess_fields_from_text(text: str) -> dict:
    """
    Very light, dependency-free heuristic field guesses from raw text.

    Deliberately minimal: this is a foundation, not an AI parser. Anything found
    here is surfaced for the owner to review and edit before applying — we never
    auto-write these onto the document.
    """
    import re

    fields: dict = {}

    # First non-empty line is a reasonable title candidate.
    for line in text.splitlines():
        cleaned = line.strip()
        if len(cleaned) >= 3:
            fields["title"] = cleaned[:120]
            break

    # A passport/reference-style alphanumeric token.
    ref = re.search(r"\b([A-Z]{1,3}\d{5,9})\b", text)
    if ref:
        fields["reference_number"] = ref.group(1)

    # ISO-style dates (YYYY-MM-DD) — pick the earliest/latest as issue/expiry.
    iso_dates = sorted(set(re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", text)))
    if iso_dates:
        fields["issue_date"] = iso_dates[0]
        if len(iso_dates) > 1:
            fields["expiry_date"] = iso_dates[-1]

    return fields
