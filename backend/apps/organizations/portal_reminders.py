"""
B2B Bulk Reminder Emails V1 — operational reminders for portal recipients.

Staff turn the org dashboard's queues (missing documents / overdue requests /
needs-replacement / rejected / due-soon / collecting) into a controlled batch of
branded reminder emails to the people who must upload, replace, or complete
documents. This reuses the existing primitives end to end — PortalPerson /
PortalCase / PortalCaseDocumentRequest / DocumentRequestLink / the shared
branded-email helper / EmailLog suppression / the unified Audit Log. It adds NO
duplicate upload/request/room/email system.

Privacy: reminders carry only a public upload/case action link (the existing
recipient-facing route) + safe context (document title, due date, sanitized
reason) — never a private file URL, storage key, raw token in audit metadata, or
document content. Deterministic — no AI, no AI credits.

Sending is synchronous and best-effort per recipient: one failed/suppressed
recipient never fails the batch. A 3-day cooldown prevents reminder spam.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import (
    PortalCase,
    PortalCaseDocumentRequest,
    PortalReminderBatch,
    PortalReminderRecipient,
)
from .portals import record_portal_audit_event

_RT = PortalReminderBatch.ReminderType
COOLDOWN_DAYS = 3
DUE_SOON_DAYS = 7
# Safety cap on recipients materialized/sent in a single batch.
MAX_BATCH_RECIPIENTS = 200

_SUBJECTS = {
    _RT.MISSING_DOCUMENTS: "Reminder: documents needed for your application",
    _RT.OVERDUE_REQUESTS: "Action needed: please upload your document",
    _RT.NEEDS_REPLACEMENT: "Replacement needed for your submitted document",
    _RT.REJECTED_DOCUMENTS: "Update on your document submission",
    _RT.DUE_SOON_CASES: "Reminder: your case has documents due soon",
    _RT.COLLECTING_DOCUMENTS: "Reminder: your case has pending documents",
}


class ReminderError(ValueError):
    """A reminder-flow error reported to the caller (mapped to a 400)."""


# ---- Public URLs (recipient-facing routes only — never private file URLs) ----


def _base_url() -> str:
    return (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")


def _request_action_url(link) -> str:
    """The recipient's public upload page — only when the link can still accept an
    upload. Never a private file URL or storage key."""
    if link is not None and getattr(link, "can_upload", False) and link.token:
        return f"{_base_url()}/document-request/{link.token}"
    return ""


def _case_action_url(case) -> str:
    """A safe public action link for a case: the case room's public page if the
    room is open, else empty (staff will follow up). Never exposes case internals."""
    room = case.linked_room
    if room is not None and getattr(room, "is_open", False) and room.token:
        return f"{_base_url()}/room/{room.token}"
    return ""


# ---- Candidate building ------------------------------------------------------


def _candidate(*, reminder_type, case, person=None, case_request=None, link=None,
               recipient_email="", recipient_name="", document_title="",
               due_date=None, status_label="", reason="", action_url="",
               missing_titles=None):
    """A normalized, JSON-safe reminder candidate. ``candidate_id`` is the stable
    selection key the frontend echoes back on send (recomputed server-side)."""
    if case_request is not None:
        candidate_id = f"cr:{case_request.id}"
    else:
        candidate_id = f"case:{case.id}"
    email = (recipient_email or "").strip()
    return {
        "candidate_id": candidate_id,
        "reminder_type": reminder_type,
        "case_id": case.id,
        "case_title": case.title,
        "person_id": person.id if person is not None else case.person_id,
        "person_name": recipient_name or (person.full_name if person else ""),
        "case_request_id": case_request.id if case_request is not None else None,
        "document_request_id": link.id if link is not None else None,
        "recipient_email": email,
        "recipient_name": recipient_name or (person.full_name if person else ""),
        "document_title": document_title,
        "missing_titles": [t[:120] for t in (missing_titles or [])][:5],
        "due_date": due_date.isoformat() if due_date else None,
        "status": status_label,
        "reason": (reason or "")[:240],
        "action_url": action_url,
        "has_email": bool(email),
    }


def build_missing_documents_candidates(organization, user=None, filters=None) -> list[dict]:
    """Active cases with unsatisfied required pack requirements; remind the case
    person. Includes a few short missing requirement titles (titles only)."""
    from apps.documents.models import DocumentBundleRequirement as Req

    filters = filters or {}
    qs = _active_cases(organization, filters).filter(linked_bundle__isnull=False)
    out = []
    for case in qs.select_related("person", "linked_bundle", "linked_room"):
        titles = list(
            Req.objects.filter(
                bundle_id=case.linked_bundle_id, is_required=True,
                status=Req.Status.MISSING,
            ).values_list("title", flat=True)[:5]
        )
        if not titles:
            continue
        person = case.person
        out.append(_candidate(
            reminder_type=_RT.MISSING_DOCUMENTS, case=case, person=person,
            recipient_email=person.email, recipient_name=person.full_name,
            document_title=titles[0] if len(titles) == 1 else "",
            missing_titles=titles, due_date=case.due_date,
            status_label=case.status, action_url=_case_action_url(case),
        ))
    return out


def build_collecting_documents_candidates(organization, user=None, filters=None) -> list[dict]:
    """Active cases still collecting documents (missing requirements AND at least
    one active request); remind the case person."""
    from apps.documents.models import DocumentBundleRequirement as Req
    from apps.documents.models import DocumentRequestLink as DR

    filters = filters or {}
    qs = _active_cases(organization, filters)
    out = []
    for case in qs.select_related("person", "linked_bundle", "linked_room"):
        has_missing = case.linked_bundle_id and Req.objects.filter(
            bundle_id=case.linked_bundle_id, is_required=True, status=Req.Status.MISSING
        ).exists()
        has_active_request = DR.objects.filter(
            portal_case_links__case=case, status__in=DR.ACTIVE_STATUSES
        ).exists()
        if not (has_missing and has_active_request):
            continue
        person = case.person
        out.append(_candidate(
            reminder_type=_RT.COLLECTING_DOCUMENTS, case=case, person=person,
            recipient_email=person.email, recipient_name=person.full_name,
            due_date=case.due_date, status_label=case.status,
            action_url=_case_action_url(case),
        ))
    return out


def build_due_soon_candidates(organization, user=None, filters=None) -> list[dict]:
    """Active cases due within the next 7 days that aren't ready/completed; remind
    the case person."""
    filters = filters or {}
    today = timezone.now().date()
    soon = today + timedelta(days=DUE_SOON_DAYS)
    qs = (
        _active_cases(organization, filters)
        .filter(due_date__gte=today, due_date__lte=soon)
        .exclude(status__in=(PortalCase.Status.READY, PortalCase.Status.SUBMITTED))
    )
    out = []
    for case in qs.select_related("person", "linked_room"):
        person = case.person
        out.append(_candidate(
            reminder_type=_RT.DUE_SOON_CASES, case=case, person=person,
            recipient_email=person.email, recipient_name=person.full_name,
            due_date=case.due_date, status_label=case.status,
            action_url=_case_action_url(case),
        ))
    return out


def build_overdue_request_candidates(organization, user=None, filters=None) -> list[dict]:
    """Case requests whose link is still active and past its due date / expiry;
    remind the request recipient (or the case person)."""
    from apps.documents.models import DocumentRequestLink as DR

    filters = filters or {}
    now = timezone.now()
    today = now.date()
    rows = _case_requests(organization, filters).filter(
        document_request__status__in=DR.ACTIVE_STATUSES,
    )
    out = []
    for row in rows:
        link = row.document_request
        overdue = (link.due_date and link.due_date < today) or (
            link.expires_at and link.expires_at < now
        )
        if not overdue:
            continue
        out.append(_request_candidate(_RT.OVERDUE_REQUESTS, row, link))
    return out


def build_needs_replacement_candidates(organization, user=None, filters=None) -> list[dict]:
    from apps.documents.models import DocumentRequestLink as DR

    filters = filters or {}
    rows = _case_requests(organization, filters).filter(
        document_request__status=DR.Status.NEEDS_REPLACEMENT,
    )
    return [
        _request_candidate(
            _RT.NEEDS_REPLACEMENT, row, row.document_request,
            reason=row.rejection_reason or row.review_note,
        )
        for row in rows
    ]


def build_rejected_document_candidates(organization, user=None, filters=None) -> list[dict]:
    from apps.documents.models import DocumentRequestLink as DR

    filters = filters or {}
    rows = _case_requests(organization, filters).filter(
        document_request__status=DR.Status.REJECTED,
    )
    return [
        _request_candidate(
            _RT.REJECTED_DOCUMENTS, row, row.document_request,
            reason=row.rejection_reason or row.review_note,
        )
        for row in rows
    ]


def _request_candidate(reminder_type, row, link, *, reason="") -> dict:
    case = row.case
    person = case.person
    # Recipient = the request's recipient email, else the case person's email.
    email = (link.recipient_email or "").strip() or (person.email or "").strip()
    name = link.recipient_name or person.full_name
    return _candidate(
        reminder_type=reminder_type, case=case, person=person, case_request=row,
        link=link, recipient_email=email, recipient_name=name,
        document_title=link.requested_document_title, due_date=link.due_date,
        status_label=link.status, reason=reason, action_url=_request_action_url(link),
    )


_BUILDERS = {
    _RT.MISSING_DOCUMENTS: build_missing_documents_candidates,
    _RT.OVERDUE_REQUESTS: build_overdue_request_candidates,
    _RT.NEEDS_REPLACEMENT: build_needs_replacement_candidates,
    _RT.REJECTED_DOCUMENTS: build_rejected_document_candidates,
    _RT.DUE_SOON_CASES: build_due_soon_candidates,
    _RT.COLLECTING_DOCUMENTS: build_collecting_documents_candidates,
}


def build_reminder_candidates(organization, user, reminder_type, filters=None) -> list[dict]:
    builder = _BUILDERS.get(reminder_type)
    if builder is None:
        raise ReminderError(
            "reminder_type must be one of: " + ", ".join(_BUILDERS.keys()) + "."
        )
    return dedupe_candidates(builder(organization, user, filters))


def dedupe_candidates(candidates) -> list[dict]:
    """Collapse to one candidate per ``candidate_id`` (and never two to the same
    recipient_email for the same case_request)."""
    seen_ids = set()
    seen_keys = set()
    out = []
    for c in candidates:
        cid = c["candidate_id"]
        key = (c["recipient_email"].lower(), cid)
        if cid in seen_ids or key in seen_keys:
            continue
        seen_ids.add(cid)
        seen_keys.add(key)
        out.append(c)
    return out


# ---- Cooldown ----------------------------------------------------------------


def should_skip_due_to_recent_reminder(organization, candidate, reminder_type,
                                       cooldown_days=COOLDOWN_DAYS) -> bool:
    """True if the same reminder_type was already SENT to this recipient for this
    case/request within the cooldown window (source of truth =
    ``PortalReminderRecipient`` history)."""
    email = (candidate.get("recipient_email") or "").strip()
    if not email:
        return False
    since = timezone.now() - timedelta(days=cooldown_days)
    qs = PortalReminderRecipient.objects.filter(
        batch__organization=organization,
        batch__reminder_type=reminder_type,
        recipient_email__iexact=email,
        status=PortalReminderRecipient.Status.SENT,
        created_at__gte=since,
    )
    if candidate.get("case_request_id"):
        qs = qs.filter(case_request_id=candidate["case_request_id"])
    else:
        qs = qs.filter(case_request__isnull=True, portal_case_id=candidate["case_id"])
    return qs.exists()


# ---- Preview -----------------------------------------------------------------


def build_reminder_preview_payload(organization, user, reminder_type, *,
                                   filters=None, include_recently_reminded=False) -> dict:
    """Recipient preview for a reminder type. Each candidate is annotated with
    ``recently_reminded`` + ``eligible`` (has email and not on cooldown)."""
    candidates = build_reminder_candidates(organization, user, reminder_type, filters)
    items = []
    eligible = 0
    for c in candidates:
        recent = should_skip_due_to_recent_reminder(organization, c, reminder_type)
        item = dict(c)
        item["recently_reminded"] = recent
        if not c["has_email"]:
            item["eligible"] = False
            item["skip_reason"] = "no_email"
        elif recent and not include_recently_reminded:
            item["eligible"] = False
            item["skip_reason"] = "recently_reminded"
        else:
            item["eligible"] = True
            item["skip_reason"] = ""
        if item["eligible"]:
            eligible += 1
        items.append(item)
    return {
        "reminder_type": reminder_type,
        "subject": _SUBJECTS.get(reminder_type, "Reminder from your document portal"),
        "count": len(items),
        "eligible_count": eligible,
        "candidates": items,
    }


# ---- Batch create + send -----------------------------------------------------


def create_reminder_batch(organization, user, reminder_type, *, payload=None) -> PortalReminderBatch:
    """Materialize a draft batch from the selected candidates (recomputed
    server-side — the client only echoes ``candidate_id``s). Optionally send now."""
    payload = dict(payload or {})
    if reminder_type not in _BUILDERS:
        raise ReminderError(
            "reminder_type must be one of: " + ", ".join(_BUILDERS.keys()) + "."
        )
    selected = payload.get("selected_candidate_ids")
    include_recent = bool(payload.get("override_recent_reminders"))

    candidates = build_reminder_candidates(organization, user, reminder_type,
                                           payload.get("filters"))
    if selected is not None:
        wanted = {str(s) for s in selected}
        candidates = [c for c in candidates if c["candidate_id"] in wanted]
    candidates = candidates[:MAX_BATCH_RECIPIENTS]

    case = None
    case_id = payload.get("case_id")
    if case_id:
        case = PortalCase.objects.filter(organization=organization, pk=case_id).first()

    batch = PortalReminderBatch.objects.create(
        organization=organization, created_by=user, case=case,
        reminder_type=reminder_type,
        status=PortalReminderBatch.Status.DRAFT,
        subject=_SUBJECTS.get(reminder_type, "Reminder from your document portal"),
        message_intro=(payload.get("message_intro") or "").strip()[:2000],
        recipient_count=len(candidates),
        metadata={"override_recent_reminders": include_recent},
    )
    for c in candidates:
        PortalReminderRecipient.objects.create(
            batch=batch,
            portal_case_id=c["case_id"],
            portal_person_id=c.get("person_id"),
            case_request_id=c.get("case_request_id"),
            document_request_id=c.get("document_request_id"),
            recipient_email=c["recipient_email"],
            recipient_name=c["recipient_name"][:255],
        )
    record_portal_audit_event(
        organization, user, "portal_reminder_batch_created",
        obj=batch, object_label=batch.get_reminder_type_display(),
        metadata={"reminder_type": reminder_type, "recipient_count": len(candidates),
                  "case_id": case_id or ""},
    )

    if payload.get("send_now"):
        send_portal_reminder_batch(batch, user,
                                   override_recent=include_recent)
    return batch


def send_portal_reminder_batch(batch, user, *, override_recent=False, dry_run=False) -> PortalReminderBatch:
    """Send (or re-send) a draft batch, best-effort per recipient. One failed or
    skipped recipient never fails the batch. Idempotent on already-sent rows."""
    if batch.status in (PortalReminderBatch.Status.SENT,
                        PortalReminderBatch.Status.CANCELLED):
        return batch
    if batch.metadata.get("override_recent_reminders"):
        override_recent = True

    batch.status = PortalReminderBatch.Status.SENDING
    batch.save(update_fields=["status"])

    sent = skipped = failed = 0
    pending = batch.recipients.filter(status=PortalReminderRecipient.Status.PENDING)
    for recipient in pending.select_related("portal_case", "document_request"):
        outcome = _process_recipient(batch, recipient, user,
                                     override_recent=override_recent, dry_run=dry_run)
        if outcome == "sent":
            sent += 1
        elif outcome == "skipped":
            skipped += 1
        else:
            failed += 1

    batch.sent_count = batch.recipients.filter(status=PortalReminderRecipient.Status.SENT).count()
    batch.skipped_count = batch.recipients.filter(status=PortalReminderRecipient.Status.SKIPPED).count()
    batch.failed_count = batch.recipients.filter(status=PortalReminderRecipient.Status.FAILED).count()
    batch.status = _batch_status(batch)
    batch.sent_at = timezone.now()
    batch.save(update_fields=["sent_count", "skipped_count", "failed_count",
                              "status", "sent_at"])
    record_portal_audit_event(
        batch.organization, user, "portal_reminder_batch_sent",
        obj=batch, object_label=batch.get_reminder_type_display(),
        metadata={"reminder_type": batch.reminder_type,
                  "recipient_count": batch.recipient_count,
                  "sent_count": batch.sent_count, "skipped_count": batch.skipped_count,
                  "failed_count": batch.failed_count, "result": batch.status},
    )
    return batch


def _process_recipient(batch, recipient, user, *, override_recent, dry_run) -> str:
    org = batch.organization
    if not recipient.recipient_email:
        return _mark_skip(recipient, "no_email")

    # Cooldown re-check at send time (skip if recently reminded, unless override).
    candidate = {
        "recipient_email": recipient.recipient_email,
        "case_request_id": recipient.case_request_id,
        "case_id": recipient.portal_case_id,
    }
    if not override_recent and should_skip_due_to_recent_reminder(
        org, candidate, batch.reminder_type
    ):
        skipped = _mark_skip(recipient, "recently_reminded")
        record_portal_audit_event(
            org, user, "portal_reminder_recipient_skipped",
            obj=batch, object_label=batch.get_reminder_type_display(),
            metadata={"reminder_type": batch.reminder_type, "reason": "recently_reminded"},
        )
        return skipped

    if dry_run:
        return "skipped"

    sent_ok = send_portal_reminder_recipient(recipient, batch)
    if sent_ok:
        recipient.status = PortalReminderRecipient.Status.SENT
        recipient.sent_at = timezone.now()
        recipient.skip_reason = ""
        recipient.save(update_fields=["status", "sent_at", "skip_reason"])
        record_portal_audit_event(
            org, user, "portal_reminder_recipient_sent",
            obj=batch, object_label=batch.get_reminder_type_display(),
            metadata={"reminder_type": batch.reminder_type},
        )
        return "sent"
    # Suppressed or transport failure → failed (best-effort; never raises).
    recipient.status = PortalReminderRecipient.Status.FAILED
    recipient.error_message = "not delivered"
    recipient.save(update_fields=["status", "error_message"])
    record_portal_audit_event(
        org, user, "portal_reminder_recipient_failed",
        obj=batch, object_label=batch.get_reminder_type_display(),
        metadata={"reminder_type": batch.reminder_type, "result": "failed"},
    )
    return "failed"


def _mark_skip(recipient, reason) -> str:
    recipient.status = PortalReminderRecipient.Status.SKIPPED
    recipient.skip_reason = reason
    recipient.save(update_fields=["status", "skip_reason"])
    return "skipped"


def send_portal_reminder_recipient(recipient, batch) -> bool:
    """Render + send one branded reminder email through the shared helper. Returns
    True only if handed to the backend (False if suppressed/failed). Never raises."""
    try:
        context = render_portal_reminder_email(recipient, batch)
        from common.email import send_branded_email

        return send_branded_email(
            subject=batch.subject,
            template="portal_bulk_reminder",
            context=context,
            to=recipient.recipient_email,
            email_type="portal_bulk_reminder",
            category="transactional",
        )
    except Exception:  # noqa: BLE001 — a single bad recipient must not fail the batch
        return False


def render_portal_reminder_email(recipient, batch) -> dict:
    """Build the safe template context for one reminder. Includes only a public
    action link + safe context — never a private file URL, storage key, or
    document content."""
    case = recipient.portal_case
    link = recipient.document_request
    org = batch.organization

    document_title = ""
    due_date = None
    reason = ""
    action_url = ""
    if link is not None:
        document_title = link.requested_document_title
        due_date = link.due_date.isoformat() if link.due_date else None
        action_url = _request_action_url(link)
        if recipient.case_request is not None:
            reason = (recipient.case_request.rejection_reason
                      or recipient.case_request.review_note or "")[:240]
    elif case is not None:
        due_date = case.due_date.isoformat() if case.due_date else None
        action_url = _case_action_url(case)

    missing_titles = []
    if batch.reminder_type == _RT.MISSING_DOCUMENTS and case is not None and case.linked_bundle_id:
        from apps.documents.models import DocumentBundleRequirement as Req

        missing_titles = [
            t[:120] for t in Req.objects.filter(
                bundle_id=case.linked_bundle_id, is_required=True, status=Req.Status.MISSING
            ).values_list("title", flat=True)[:5]
        ]

    return {
        "from_name": org.name or "Your document portal",
        "recipient_name": recipient.recipient_name,
        "reminder_type": batch.reminder_type,
        "reminder_label": batch.get_reminder_type_display(),
        "case_title": case.title if case is not None else "",
        "document_title": document_title,
        "missing_titles": missing_titles,
        "due_date": due_date,
        "reason": reason,
        "action_url": action_url,
        "message_intro": batch.message_intro,
        "preferences_url": f"{_base_url()}/dashboard/settings",
    }


def _batch_status(batch) -> str:
    S = PortalReminderBatch.Status
    if batch.recipient_count == 0:
        return S.SENT
    if batch.failed_count and batch.sent_count:
        return S.PARTIALLY_FAILED
    if batch.failed_count and not batch.sent_count:
        return S.FAILED
    return S.SENT


def cancel_reminder_batch(batch, user) -> PortalReminderBatch:
    if batch.status in (PortalReminderBatch.Status.SENT,
                        PortalReminderBatch.Status.PARTIALLY_FAILED):
        raise ReminderError("This batch has already been sent.")
    batch.status = PortalReminderBatch.Status.CANCELLED
    batch.save(update_fields=["status"])
    return batch


# ---- Payloads ----------------------------------------------------------------


def build_reminder_batch_payload(batch, *, include_recipients=False) -> dict:
    data = {
        "batch_id": batch.id,
        "reminder_type": batch.reminder_type,
        "reminder_label": batch.get_reminder_type_display(),
        "status": batch.status,
        "subject": batch.subject,
        "message_intro": batch.message_intro,
        "case_id": batch.case_id,
        "recipient_count": batch.recipient_count,
        "sent_count": batch.sent_count,
        "skipped_count": batch.skipped_count,
        "failed_count": batch.failed_count,
        "created_by": getattr(batch.created_by, "first_name", "") or "",
        "created_at": batch.created_at.isoformat(),
        "sent_at": batch.sent_at.isoformat() if batch.sent_at else None,
    }
    if include_recipients:
        data["recipients"] = [_recipient_payload(r) for r in batch.recipients.all()]
    # Skipped summary for the send-result response shape.
    data["skipped"] = [
        {"email": r.recipient_email, "reason": r.skip_reason}
        for r in batch.recipients.filter(status=PortalReminderRecipient.Status.SKIPPED)
    ]
    return data


def _recipient_payload(recipient) -> dict:
    return {
        "id": recipient.id,
        "recipient_name": recipient.recipient_name,
        "recipient_email": recipient.recipient_email,
        "case_id": recipient.portal_case_id,
        "case_request_id": recipient.case_request_id,
        "status": recipient.status,
        "skip_reason": recipient.skip_reason,
        "sent_at": recipient.sent_at.isoformat() if recipient.sent_at else None,
    }


# ---- Querysets ---------------------------------------------------------------


def _active_cases(organization, filters):
    qs = PortalCase.objects.filter(
        organization=organization, status__in=PortalCase.ACTIVE_STATUSES
    )
    if filters.get("case_id"):
        qs = qs.filter(pk=filters["case_id"])
    if filters.get("person_id"):
        qs = qs.filter(person_id=filters["person_id"])
    return qs


def _case_requests(organization, filters):
    qs = (
        PortalCaseDocumentRequest.objects.filter(case__organization=organization)
        .exclude(case__status=PortalCase.Status.ARCHIVED)
        .select_related("case", "case__person", "document_request")
    )
    if filters.get("case_id"):
        qs = qs.filter(case_id=filters["case_id"])
    if filters.get("person_id"):
        qs = qs.filter(case__person_id=filters["person_id"])
    return qs
