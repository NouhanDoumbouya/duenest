"""
B2B Review + Approval Workflow V1 — staff review of uploaded portal documents.

Reuses the existing primitives end-to-end (NO duplicate upload/request/room
systems): a recipient uploads through a ``DocumentRequestLink``; staff review the
upload (accept / reject / needs-replacement) which drives the SAME link's
accept/reject/needs_replacement service functions, satisfies the linked pack
requirement on accept, recomputes case progress, records a decision + audit event,
and (optionally) emails the recipient. Deterministic — no AI.

Org-scoped + role-gated (decisions require admin/owner). The uploaded file is the
link's owner-owned encrypted ``DocumentFile``; staff preview/download it through an
ORG-SCOPED proxy route (decrypt-in-memory) — never a raw storage URL or token.
"""

from __future__ import annotations

from django.utils import timezone

from .models import (
    PortalCase,
    PortalCaseDocumentRequest,
    PortalCaseReviewDecision,
)
from .portals import compute_case_progress, record_portal_audit_event

_RS = PortalCaseDocumentRequest.ReviewStatus


class ReviewError(ValueError):
    """A review-flow error reported to the caller (mapped to a 400)."""


# ---- Status sync ------------------------------------------------------------


def _review_status_from_link(link) -> str:
    from apps.documents.models import DocumentRequestLink as DR

    mapping = {
        DR.Status.DRAFT: _RS.PENDING_UPLOAD,
        DR.Status.REQUESTED: _RS.PENDING_UPLOAD,
        DR.Status.OPENED: _RS.PENDING_UPLOAD,
        DR.Status.UPLOADED: _RS.UPLOADED,
        DR.Status.UNDER_REVIEW: _RS.UNDER_REVIEW,
        DR.Status.ACCEPTED: _RS.ACCEPTED,
        DR.Status.REJECTED: _RS.REJECTED,
        DR.Status.NEEDS_REPLACEMENT: _RS.NEEDS_REPLACEMENT,
        DR.Status.EXPIRED: _RS.CANCELLED,
        DR.Status.CANCELLED: _RS.CANCELLED,
    }
    return mapping.get(link.status, _RS.PENDING_UPLOAD)


def sync_case_request_review_status(case_request) -> PortalCaseDocumentRequest:
    """Mirror the linked DocumentRequestLink status onto the case request (the link
    is authoritative). Records the first upload time. Best-effort; never raises."""
    try:
        link = case_request.document_request
        derived = _review_status_from_link(link)
        fields = []
        if case_request.review_status != derived:
            case_request.review_status = derived
            fields.append("review_status")
        if link.uploaded_at and case_request.last_submitted_at != link.uploaded_at:
            case_request.last_submitted_at = link.uploaded_at
            fields.append("last_submitted_at")
        if fields:
            fields.append("updated_at")
            case_request.save(update_fields=fields)
    except Exception:  # noqa: BLE001
        pass
    return case_request


# ---- Decisions --------------------------------------------------------------


def start_case_request_review(case_request, user) -> PortalCaseDocumentRequest:
    """Move an uploaded item into 'under review' (UPLOADED → UNDER_REVIEW)."""
    from apps.documents.models import DocumentRequestLink as DR

    link = case_request.document_request
    if link.status == DR.Status.UPLOADED:
        link.status = DR.Status.UNDER_REVIEW
        link.save(update_fields=["status", "updated_at"])
    sync_case_request_review_status(case_request)
    record_portal_audit_event(
        case_request.case.organization, user, "portal_review_started",
        obj=case_request.case, object_label=case_request.case.title,
        metadata={"request_title": link.requested_document_title},
    )
    return case_request


def review_case_document_request(case_request, user, decision: str, *, note: str = "",
                                 notify_recipient: bool = False) -> dict:
    """Dispatch a staff decision: accepted / rejected / needs_replacement."""
    decision = (decision or "").strip()
    if decision == "accepted":
        return accept_case_document_request(case_request, user, note=note)
    if decision == "rejected":
        return reject_case_document_request(case_request, user, reason=note,
                                            notify_recipient=notify_recipient)
    if decision == "needs_replacement":
        return mark_case_request_needs_replacement(case_request, user, reason=note,
                                                   notify_recipient=notify_recipient)
    raise ReviewError("decision must be one of: accepted, rejected, needs_replacement.")


def accept_case_document_request(case_request, user, *, note: str = "") -> dict:
    from apps.documents.document_requests import (
        DocumentRequestError,
        accept_document_request,
        attach_request_file_to_pack,
    )

    link = case_request.document_request
    if link.uploaded_file_id is None:
        raise ReviewError("There is no uploaded file to accept.")
    previous = case_request.review_status
    try:
        accept_document_request(link)
        # Accepting satisfies the linked pack requirement (reuses the existing
        # attach flow). Only when the request is linked to a pack.
        if link.linked_bundle_id or link.linked_requirement_id:
            attach_request_file_to_pack(link)
    except DocumentRequestError as exc:
        raise ReviewError(str(exc))

    _apply_decision(case_request, user, decision="accepted", note=note,
                    new_status=_RS.ACCEPTED, previous=previous)
    record_portal_audit_event(
        case_request.case.organization, user, "portal_document_accepted",
        obj=case_request.case, object_label=case_request.case.title,
        related_object=link,
        metadata={"request_title": link.requested_document_title,
                  "status_from": previous, "status_to": _RS.ACCEPTED, "note": note[:240]},
    )
    return _decision_result(case_request, notified=False)


def reject_case_document_request(case_request, user, *, reason: str = "",
                                 notify_recipient: bool = False) -> dict:
    from apps.documents.document_requests import (
        DocumentRequestError,
        reject_document_request,
    )

    if not (reason or "").strip():
        raise ReviewError("A reason is required to reject a document.")
    link = case_request.document_request
    previous = case_request.review_status
    try:
        reject_document_request(link, reason)
    except DocumentRequestError as exc:
        raise ReviewError(str(exc))

    _apply_decision(case_request, user, decision="rejected", note=reason,
                    new_status=_RS.REJECTED, previous=previous)
    notified = _maybe_notify(case_request, "rejected", reason, notify_recipient)
    record_portal_audit_event(
        case_request.case.organization, user, "portal_document_rejected",
        obj=case_request.case, object_label=case_request.case.title, related_object=link,
        severity="warning",
        metadata={"request_title": link.requested_document_title,
                  "status_from": previous, "status_to": _RS.REJECTED, "note": reason[:240]},
    )
    return _decision_result(case_request, notified=notified)


def mark_case_request_needs_replacement(case_request, user, *, reason: str = "",
                                        notify_recipient: bool = True) -> dict:
    from apps.documents.document_requests import (
        DocumentRequestError,
        mark_needs_replacement,
    )

    if not (reason or "").strip():
        raise ReviewError("A reason is required to request a replacement.")
    link = case_request.document_request
    previous = case_request.review_status
    try:
        mark_needs_replacement(link, reason)  # reopens the link for re-upload
    except DocumentRequestError as exc:
        raise ReviewError(str(exc))

    _apply_decision(case_request, user, decision="needs_replacement", note=reason,
                    new_status=_RS.NEEDS_REPLACEMENT, previous=previous)
    notified = _maybe_notify(case_request, "needs_replacement", reason, notify_recipient)
    record_portal_audit_event(
        case_request.case.organization, user, "portal_document_needs_replacement",
        obj=case_request.case, object_label=case_request.case.title, related_object=link,
        metadata={"request_title": link.requested_document_title,
                  "status_from": previous, "status_to": _RS.NEEDS_REPLACEMENT,
                  "note": reason[:240]},
    )
    return _decision_result(case_request, notified=notified)


def _apply_decision(case_request, user, *, decision, note, new_status, previous):
    now = timezone.now()
    case_request.review_status = new_status
    case_request.reviewed_by = user
    case_request.reviewed_at = now
    case_request.review_note = (note or "").strip()
    if decision == "rejected":
        case_request.rejection_reason = (note or "").strip()
    elif decision == "needs_replacement":
        case_request.rejection_reason = (note or "").strip()
    case_request.decision_count = (case_request.decision_count or 0) + 1
    case_request.save(update_fields=[
        "review_status", "reviewed_by", "reviewed_at", "review_note",
        "rejection_reason", "decision_count", "updated_at",
    ])
    PortalCaseReviewDecision.objects.create(
        case_request=case_request,
        organization=case_request.case.organization,
        case=case_request.case,
        document_request=case_request.document_request,
        decision=decision,
        note=(note or "").strip(),
        decided_by=user if getattr(user, "is_authenticated", False) else None,
        previous_status=previous or "",
        new_status=new_status,
    )


def _decision_result(case_request, *, notified: bool) -> dict:
    case = case_request.case
    return {
        "case_request": build_case_review_item(case_request),
        "document_request_status": case_request.document_request.status,
        "progress": compute_case_progress(case),
        "notified_recipient": notified,
    }


# ---- Notifications ----------------------------------------------------------


def _maybe_notify(case_request, decision: str, reason: str, notify: bool) -> bool:
    link = case_request.document_request
    if not notify or not link.recipient_email:
        return False
    sent = notify_recipient_review_decision(case_request, decision, reason)
    if sent:
        # Flag the latest decision row + audit it.
        latest = case_request.decisions.first()
        if latest is not None:
            latest.notified_recipient = True
            latest.save(update_fields=["notified_recipient"])
        record_portal_audit_event(
            case_request.case.organization, None, "portal_recipient_notified",
            obj=case_request.case, object_label=case_request.case.title,
            metadata={"request_title": link.requested_document_title, "decision": decision},
        )
    return bool(sent)


def notify_recipient_review_decision(case_request, decision: str, reason: str) -> bool:
    """Branded email to the recipient on reject / needs_replacement. Carries the
    request title + reason + (for needs_replacement) the public upload link — never
    a private file URL, storage key, or document content. Never raises."""
    from django.conf import settings

    link = case_request.document_request
    if not link.recipient_email:
        return False
    base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
    # The recipient's OWN public upload page (only included for needs_replacement,
    # where the link is re-opened and can_upload is true).
    upload_url = f"{base}/document-request/{link.token}" if (
        decision == "needs_replacement" and link.can_upload
    ) else ""
    org = case_request.case.organization
    from_name = org.name or "A CertaNest organization"

    from common.email import send_branded_email

    return send_branded_email(
        subject=("Action needed: please re-upload your document"
                 if decision == "needs_replacement"
                 else "Update on your document submission"),
        template="portal_review_decision",
        context={
            "from_name": from_name,
            "recipient_name": link.recipient_name,
            "requested_document_title": link.requested_document_title,
            "decision": decision,
            "reason": (reason or "").strip(),
            "upload_url": upload_url,
            "due_date": link.due_date.isoformat() if link.due_date else None,
            "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            "preferences_url": f"{base}/dashboard/settings",
        },
        to=link.recipient_email,
        email_type="portal_review_decision",
        category="transactional",
    )


# ---- Queue + payloads -------------------------------------------------------


def build_portal_review_queue(organization, user=None, filters: dict | None = None) -> list[dict]:
    """Org-wide review queue: case requests whose linked upload is awaiting review.
    Supports status / case_id / person_id / search filters."""
    filters = filters or {}
    rows = (
        PortalCaseDocumentRequest.objects
        .filter(case__organization=organization)
        .exclude(case__status=PortalCase.Status.ARCHIVED)
        .select_related("case", "case__person", "document_request")
    )
    for row in rows:
        sync_case_request_review_status(row)

    status_filter = (filters.get("status") or "").strip()
    case_id = filters.get("case_id")
    person_id = filters.get("person_id")
    search = (filters.get("search") or "").strip().lower()

    out = []
    for row in rows:
        if status_filter:
            if row.review_status != status_filter:
                continue
        elif row.review_status not in PortalCaseDocumentRequest.REVIEW_QUEUE_STATUSES:
            continue
        if case_id and str(row.case_id) != str(case_id):
            continue
        if person_id and str(row.case.person_id) != str(person_id):
            continue
        if search and search not in (
            f"{row.document_request.requested_document_title} "
            f"{row.case.title} {row.case.person.full_name}".lower()
        ):
            continue
        out.append(build_case_review_item(row, organization=organization))
    return out


def build_case_review_items(case, user=None) -> list[dict]:
    rows = (
        case.case_requests.select_related("document_request", "reviewed_by")
        .order_by("-created_at")
    )
    items = []
    for row in rows:
        sync_case_request_review_status(row)
        items.append(build_case_review_item(row, organization=case.organization))
    return items


def build_case_review_item(case_request, *, organization=None) -> dict:
    """Owner-safe review item. The uploaded file is referenced ONLY by an
    org-scoped proxy route — never a raw storage URL or token."""
    link = case_request.document_request
    case = case_request.case
    org_id = organization.id if organization is not None else case.organization_id
    base = f"/api/v1/organizations/{org_id}/portal/cases/{case.id}/requests/{case_request.id}"

    file_info = None
    if link.uploaded_file_id:
        f = link.uploaded_file
        file_info = {
            "id": f.id,
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "is_previewable": f.is_previewable,
            "preview_url": f"{base}/file/preview/",
            "download_url": f"{base}/file/download/",
        }

    return {
        "case_request_id": case_request.id,
        "case_id": case.id,
        "case_title": case.title,
        "person_name": case.person.full_name,
        "person_id": case.person_id,
        "document_request_id": link.id,
        "requested_document_title": link.requested_document_title,
        "review_status": case_request.review_status,
        "document_request_status": link.status,
        "recipient_name": link.recipient_name,
        "has_recipient_email": bool(link.recipient_email),
        "can_upload": link.can_upload,
        "uploaded_at": link.uploaded_at.isoformat() if link.uploaded_at else None,
        "due_date": link.due_date.isoformat() if link.due_date else None,
        "reviewed_by": getattr(case_request.reviewed_by, "first_name", "") or "",
        "reviewed_at": case_request.reviewed_at.isoformat() if case_request.reviewed_at else None,
        "review_note": case_request.review_note,
        "rejection_reason": case_request.rejection_reason,
        "decision_count": case_request.decision_count,
        "requirement_id": case_request.requirement_id,
        "uploaded_file": file_info,
    }


def build_case_request_decisions(case_request) -> list[dict]:
    return [
        {
            "id": d.id,
            "decision": d.decision,
            "note": d.note,
            "decided_by": getattr(d.decided_by, "first_name", "") or "",
            "decided_at": d.decided_at.isoformat(),
            "previous_status": d.previous_status,
            "new_status": d.new_status,
            "notified_recipient": d.notified_recipient,
        }
        for d in case_request.decisions.select_related("decided_by").all()
    ]


def resolve_case_request_file(case_request):
    """Return the uploaded ``DocumentFile`` for an org-scoped preview/download, or
    None. Permission-first: the caller must have already verified org membership +
    that the case_request belongs to the org's case."""
    link = case_request.document_request
    if link.uploaded_file_id is None:
        return None
    f = link.uploaded_file
    if f is None or f.is_trashed:
        return None
    return f
