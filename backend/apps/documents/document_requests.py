"""
Document Request Links V1 — request a document from someone, collect ONE secure
upload, review it, and attach the accepted file to the vault / a pack.

Deterministic — **no AI, no AI credits**. Owner-scoped throughout. The recipient
uploads via an unguessable public token without an account; the uploaded bytes are
stored as an encrypted, owner-owned ``DocumentFile`` (the standard private-storage
chain) and are only ever served through the authenticated owner download route —
never a raw/public storage URL, and never handed back to the recipient. Nothing is
auto-accepted: the owner reviews and accepts / rejects / asks for a replacement.

Workflow: Request -> Upload -> Review -> Accept/Reject/Needs-replacement -> Attach/Save.
"""

from __future__ import annotations

from django.utils import timezone

from apps.users import plans as user_plans

from .models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentRequestLink,
    TrackedApplication,
)
from .plan_usage import enforce_plan_limit

_Status = DocumentRequestLink.Status

# Public-resolve outcomes.
RESOLVE_OK = "ok"
RESOLVE_NOT_FOUND = "not_found"
RESOLVE_EXPIRED = "expired"
RESOLVE_CANCELLED = "cancelled"
RESOLVE_CLOSED = "closed"  # accepted/rejected — no longer accepting uploads


class DocumentRequestError(ValueError):
    """A request-flow error reported to the caller (mapped to a 400)."""


# ---- Create -----------------------------------------------------------------


def create_document_request(owner, payload: dict, *, enforce_limit: bool = True) -> DocumentRequestLink:
    """
    Create an owner-scoped request + mint a public upload token. Validates that
    any linked pack/application/requirement belongs to the owner. Enforces the
    active document-request-links plan limit. No AI.

    ``enforce_limit=False`` skips the personal per-user request-link limit — used
    by the B2B portal, which governs requests by ORGANIZATION limits instead of
    the owner's personal plan (personal default stays True for normal use).
    """
    title = (payload.get("requested_document_title") or "").strip()
    if not title:
        raise DocumentRequestError("A requested document title is required.")

    bundle = _owned_or_none(DocumentBundle, owner, payload.get("linked_bundle"))
    application = _owned_or_none(TrackedApplication, owner, payload.get("linked_application"))
    requirement = _owned_or_none(
        DocumentBundleRequirement, owner, payload.get("linked_requirement")
    )
    # A linked requirement implies its pack (keep them consistent).
    if requirement is not None and bundle is None:
        bundle = requirement.bundle

    if enforce_limit:
        enforce_plan_limit(owner, user_plans.RESOURCE_DOCUMENT_REQUEST_LINKS)

    return DocumentRequestLink.objects.create(
        owner=owner,
        status=_Status.REQUESTED,
        requested_document_title=title[:255],
        requested_document_type=(payload.get("requested_document_type") or "").strip()[:100],
        instructions=(payload.get("instructions") or "").strip(),
        recipient_name=(payload.get("recipient_name") or "").strip()[:255],
        recipient_email=(payload.get("recipient_email") or "").strip()[:254],
        recipient_message=(payload.get("recipient_message") or "").strip(),
        due_date=_date(payload.get("due_date")),
        expires_at=_datetime(payload.get("expires_at")),
        owner_note=(payload.get("owner_note") or "").strip(),
        linked_bundle=bundle,
        linked_application=application,
        linked_requirement=requirement,
    )


# ---- Payloads ---------------------------------------------------------------


def build_public_document_request_payload(request: DocumentRequestLink) -> dict:
    """
    Recipient-facing payload: ONLY the metadata needed to upload. Reveals no owner
    private data (no vault, no email, no notes, no file URLs) — just a safe display
    name + the request details.
    """
    return {
        "requested_document_title": request.requested_document_title,
        "requested_document_type": request.requested_document_type,
        "instructions": request.instructions,
        "recipient_name": request.recipient_name,
        "recipient_message": request.recipient_message,
        "due_date": request.due_date.isoformat() if request.due_date else None,
        "expires_at": request.expires_at.isoformat() if request.expires_at else None,
        "status": request.status,
        "can_upload": request.can_upload,
        "from_name": _owner_display_name(request.owner),
        "app_name": "CertaNest",
    }


# ---- Token resolution + open --------------------------------------------------


def resolve_document_request_token(token: str):
    """Resolve a public token to ``(request, state)``. Never raises."""
    if not token:
        return None, RESOLVE_NOT_FOUND
    request = DocumentRequestLink.objects.filter(token=token).first()
    if request is None:
        return None, RESOLVE_NOT_FOUND
    if request.status == _Status.CANCELLED:
        return request, RESOLVE_CANCELLED
    if request.is_expired or request.status == _Status.EXPIRED:
        return request, RESOLVE_EXPIRED
    if request.status in (_Status.ACCEPTED, _Status.REJECTED):
        return request, RESOLVE_CLOSED
    return request, RESOLVE_OK


def mark_document_request_opened(request: DocumentRequestLink) -> None:
    """Record the first recipient open (requested -> opened). Idempotent-ish."""
    if request.status == _Status.REQUESTED:
        request.status = _Status.OPENED
        request.opened_at = timezone.now()
        request.save(update_fields=["status", "opened_at", "updated_at"])


# ---- Upload (recipient) -----------------------------------------------------


def attach_uploaded_file(request: DocumentRequestLink, document_file) -> DocumentRequestLink:
    """
    Record a recipient upload (the view created the encrypted owner-owned
    ``DocumentFile``). Moves the request to ``uploaded`` for owner review. Never
    auto-accepts. Raises if the request is not currently uploadable.
    """
    if not request.can_upload:
        raise DocumentRequestError("This request is not accepting uploads.")
    request.uploaded_file = document_file
    request.upload_count = (request.upload_count or 0) + 1
    request.status = _Status.UPLOADED
    request.uploaded_at = timezone.now()
    request.rejection_reason = ""  # clear any prior needs-replacement reason
    request.save(update_fields=[
        "uploaded_file", "upload_count", "status", "uploaded_at",
        "rejection_reason", "updated_at",
    ])
    return request


# ---- Review (owner) ---------------------------------------------------------


def review_document_request(request: DocumentRequestLink, action: str, *, reason: str = "") -> DocumentRequestLink:
    """Dispatch an owner review action: accept / reject / needs_replacement."""
    if action == "accept":
        return accept_document_request(request)
    if action == "reject":
        return reject_document_request(request, reason)
    if action == "needs_replacement":
        return mark_needs_replacement(request, reason)
    raise DocumentRequestError("Unknown review action.")


def _require_reviewable(request: DocumentRequestLink) -> None:
    if request.status not in (_Status.UPLOADED, _Status.UNDER_REVIEW):
        raise DocumentRequestError("There is no uploaded file to review.")
    if request.uploaded_file_id is None:
        raise DocumentRequestError("There is no uploaded file to review.")


def accept_document_request(request: DocumentRequestLink) -> DocumentRequestLink:
    _require_reviewable(request)
    now = timezone.now()
    request.status = _Status.ACCEPTED
    request.reviewed_at = now
    request.accepted_at = now
    request.save(update_fields=["status", "reviewed_at", "accepted_at", "updated_at"])
    return request


def reject_document_request(request: DocumentRequestLink, reason: str = "") -> DocumentRequestLink:
    _require_reviewable(request)
    now = timezone.now()
    request.status = _Status.REJECTED
    request.rejection_reason = (reason or "").strip()
    request.reviewed_at = now
    request.rejected_at = now
    request.save(update_fields=[
        "status", "rejection_reason", "reviewed_at", "rejected_at", "updated_at",
    ])
    return request


def mark_needs_replacement(request: DocumentRequestLink, reason: str = "") -> DocumentRequestLink:
    """Ask the recipient for a clearer/correct replacement (re-opens upload)."""
    _require_reviewable(request)
    request.status = _Status.NEEDS_REPLACEMENT
    request.rejection_reason = (reason or "").strip()
    request.reviewed_at = timezone.now()
    request.save(update_fields=["status", "rejection_reason", "reviewed_at", "updated_at"])
    return request


def cancel_document_request(request: DocumentRequestLink) -> DocumentRequestLink:
    if request.status in (_Status.ACCEPTED, _Status.CANCELLED):
        return request
    request.status = _Status.CANCELLED
    request.save(update_fields=["status", "updated_at"])
    return request


def expire_document_requests(now=None) -> int:
    """Deterministic sweep: mark past-expiry active requests as expired."""
    now = now or timezone.now()
    qs = DocumentRequestLink.objects.filter(
        status__in=DocumentRequestLink.ACTIVE_STATUSES,
        expires_at__isnull=False,
        expires_at__lte=now,
    )
    return qs.update(status=_Status.EXPIRED, updated_at=now)


# ---- Attach / save accepted file (owner) ------------------------------------


def save_request_file_to_vault(request: DocumentRequestLink) -> Document:
    """
    Promote the accepted upload to a tracked vault ``Document`` (reuses the
    inbox->document pattern). Owner-scoped; enforces the documents plan limit.
    """
    _require_accepted(request)
    if request.created_document_id:
        return request.created_document
    enforce_plan_limit(request.owner, user_plans.RESOURCE_DOCUMENTS)
    file = request.uploaded_file
    title = (request.requested_document_title
             or file.original_filename.rsplit(".", 1)[0])[:255]
    document = Document.objects.create(
        owner=request.owner, title=title,
        document_type=request.requested_document_type or "",
    )
    file.document = document
    file.save(update_fields=["document", "updated_at"])
    request.created_document = document
    request.save(update_fields=["created_document", "updated_at"])
    return document


def attach_request_file_to_pack(request: DocumentRequestLink):
    """
    Attach the accepted upload to the linked pack — satisfying ``linked_requirement``
    if set, else adding a new satisfied requirement to ``linked_bundle``. Recomputes
    pack readiness. Returns the requirement.
    """
    _require_accepted(request)
    file = request.uploaded_file
    requirement = request.linked_requirement
    bundle = request.linked_bundle or (requirement.bundle if requirement else None)
    if bundle is None or bundle.owner_id != request.owner_id:
        raise DocumentRequestError("This request is not linked to one of your packs.")

    if requirement is not None and requirement.owner_id == request.owner_id:
        requirement.linked_file = file
        if request.created_document_id:
            requirement.linked_document = request.created_document
        requirement.status = DocumentBundleRequirement.Status.ATTACHED
        requirement.save(update_fields=[
            "linked_file", "linked_document", "status", "updated_at",
        ])
    else:
        requirement = DocumentBundleRequirement.objects.create(
            owner=request.owner,
            bundle=bundle,
            title=request.requested_document_title[:255],
            requirement_type=DocumentBundleRequirement.RequirementType.FILE,
            status=DocumentBundleRequirement.Status.ATTACHED,
            linked_file=file,
            linked_document=request.created_document,
            sort_order=bundle.requirements.count(),
        )
    bundle.recalculate_readiness()
    return requirement


# ---- Helpers ----------------------------------------------------------------


def _require_accepted(request: DocumentRequestLink) -> None:
    if request.status != _Status.ACCEPTED or request.uploaded_file_id is None:
        raise DocumentRequestError("Accept the uploaded file before saving/attaching it.")


def _owned_or_none(model, owner, pk):
    if not pk:
        return None
    obj = model.objects.filter(owner=owner, pk=pk).first()
    if obj is None:
        raise DocumentRequestError(
            f"The linked {model.__name__} was not found or is not yours."
        )
    return obj


def _owner_display_name(owner) -> str:
    name = (getattr(owner, "first_name", "") or "").strip()
    if name:
        return name
    # Fall back to a non-identifying label — never expose the owner's email.
    return "A CertaNest user"


def _date(value):
    if not value:
        return None
    from datetime import date

    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _datetime(value):
    if not value:
        return None
    from django.utils.dateparse import parse_datetime

    parsed = parse_datetime(str(value))
    if parsed is not None and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed
