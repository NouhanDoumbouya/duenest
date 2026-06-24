"""
B2B Portals MVP — orchestration over existing primitives.

A portal *case* manages one document workflow for a portal *person* (client /
student / applicant / employee). It does NOT introduce a second upload, room, or
request system — it CREATES and LINKS the existing per-user primitives from
``apps.documents``:

* a **DocumentBundle** (pack) for the checklist + progress,
* a **SharingRoom** for the secure case workspace,
* **DocumentRequestLink**s to collect each missing document (recipient defaults to
  the case person), satisfying pack requirements on acceptance,
* optional **TrackedApplication** semantics,
* **AuditLogEntry** for portal security events.

Deterministic — no AI, no AI credits. Org-scoped: access is gated by organization
membership (see ``apps.organizations.services.require_membership/require_role``);
the linked primitives are owned by the case's creating member (``created_by``) so
the existing owner-scoped services apply unchanged. The recipient/public side
continues entirely through the existing Document Request Link / Sharing Room
public routes — the portal adds no public surface.
"""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from .models import (
    PortalCase,
    PortalCaseDocumentRequest,
    PortalPerson,
)

# Audit category for portal events (reuses the unified Audit Logs V1 system).
_AUDIT_CATEGORY = "system"


class PortalError(ValueError):
    """A portal-flow error reported to the caller (mapped to a 400)."""


# ---- People -----------------------------------------------------------------


def create_portal_person(organization, user, payload: dict) -> PortalPerson:
    full_name = (payload.get("full_name") or "").strip()
    if not full_name:
        raise PortalError("A full name is required.")
    from .portal_limits import enforce_organization_portal_limit

    enforce_organization_portal_limit(organization, "portal_people")
    person = PortalPerson.objects.create(
        organization=organization,
        created_by=user,
        full_name=full_name[:255],
        email=(payload.get("email") or "").strip()[:254],
        phone=(payload.get("phone") or "").strip()[:40],
        person_type=_choice(payload.get("person_type"), PortalPerson.PersonType, PortalPerson.PersonType.CLIENT),
        status=_choice(payload.get("status"), PortalPerson.Status, PortalPerson.Status.ACTIVE),
        notes=(payload.get("notes") or "").strip(),
    )
    record_portal_audit_event(organization, user, "portal_person_created",
                              obj=person, object_label=person.full_name,
                              metadata={"name": person.full_name})
    return person


def archive_portal_person(person: PortalPerson, user) -> PortalPerson:
    if person.status != PortalPerson.Status.ARCHIVED:
        person.status = PortalPerson.Status.ARCHIVED
        person.archived_at = timezone.now()
        person.save(update_fields=["status", "archived_at", "updated_at"])
        record_portal_audit_event(person.organization, user, "portal_person_archived",
                                  obj=person, object_label=person.full_name)
    return person


# ---- Cases ------------------------------------------------------------------


def create_portal_case(organization, user, person: PortalPerson, payload: dict) -> PortalCase:
    if person.organization_id != organization.id:
        raise PortalError("That person is not in this organization.")
    title = (payload.get("title") or "").strip()
    if not title:
        raise PortalError("A case title is required.")
    from .portal_limits import enforce_organization_portal_limit

    enforce_organization_portal_limit(organization, "active_portal_cases")
    case = PortalCase.objects.create(
        organization=organization,
        person=person,
        created_by=user,
        title=title[:255],
        case_type=_choice(payload.get("case_type"), PortalCase.CaseType, PortalCase.CaseType.GENERAL),
        status=_choice(payload.get("status"), PortalCase.Status, PortalCase.Status.DRAFT),
        priority=_choice(payload.get("priority"), PortalCase.Priority, PortalCase.Priority.NORMAL),
        due_date=_date(payload.get("due_date")),
        notes=(payload.get("notes") or "").strip(),
    )
    record_portal_audit_event(organization, user, "portal_case_created",
                              obj=case, object_label=case.title,
                              metadata={"case_type": case.case_type, "title": case.title})

    # Optional initial pack from a list of requirement titles.
    requirements = payload.get("requirements")
    if requirements:
        create_case_pack(case, user, requirements=requirements)
    return case


def update_portal_case_status(case: PortalCase, user, new_status: str) -> PortalCase:
    if new_status not in PortalCase.Status.values:
        raise PortalError("Invalid case status.")
    if new_status == case.status:
        return case
    previous = case.status
    case.status = new_status
    case.save(update_fields=["status", "updated_at"])
    record_portal_audit_event(case.organization, user, "portal_case_status_changed",
                              obj=case, object_label=case.title,
                              metadata={"status_from": previous, "status_to": new_status})
    return case


def archive_portal_case(case: PortalCase, user) -> PortalCase:
    if case.status != PortalCase.Status.ARCHIVED:
        case.status = PortalCase.Status.ARCHIVED
        case.archived_at = timezone.now()
        case.save(update_fields=["status", "archived_at", "updated_at"])
        record_portal_audit_event(case.organization, user, "portal_case_archived",
                                  obj=case, object_label=case.title)
    return case


# ---- Primitive orchestration ------------------------------------------------


def create_case_pack(case: PortalCase, user, requirements=None):
    """
    Create a DocumentBundle (pack) for the case + requirement rows, owned by the
    case creator. Reuses the existing pack/requirement model and readiness. Links
    it to the case.
    """
    from apps.documents.models import DocumentBundle, DocumentBundleRequirement

    if case.linked_bundle_id:
        return case.linked_bundle
    owner = _case_owner(case)
    bundle = DocumentBundle.objects.create(
        owner=owner,
        title=case.title[:255],
        bundle_type=DocumentBundle.BundleType.APPLICATION,
        status=DocumentBundle.Status.IN_PROGRESS,
    )
    for i, req in enumerate(_normalize_requirements(requirements)):
        DocumentBundleRequirement.objects.create(
            owner=owner, bundle=bundle, title=req["title"][:255],
            is_required=bool(req.get("required", True)),
            requirement_type=DocumentBundleRequirement.RequirementType.DOCUMENT,
            status=DocumentBundleRequirement.Status.MISSING, sort_order=i,
        )
    bundle.recalculate_readiness()
    case.linked_bundle = bundle
    case.save(update_fields=["linked_bundle", "updated_at"])
    record_portal_audit_event(case.organization, user, "portal_case_pack_created",
                              obj=case, object_label=case.title, related_object=bundle)
    return bundle


def create_case_room(case: PortalCase, user):
    """Create a SharingRoom for the case (from its pack if present). Reuses the
    Sharing Room primitive."""
    from apps.documents.sharing_rooms import create_room_from_pack, create_sharing_room

    from .portal_limits import enforce_organization_portal_limit

    if case.linked_room_id:
        return case.linked_room
    enforce_organization_portal_limit(case.organization, "active_sharing_rooms")
    owner = _case_owner(case)
    payload = {"title": case.title, "room_type": "client"}
    # enforce_limit=False: the portal governs rooms by ORG limits (enforced above),
    # not by the owner's personal sharing-room limit.
    if case.linked_bundle_id:
        room = create_room_from_pack(case.linked_bundle, owner, payload=payload, enforce_limit=False)
    else:
        room = create_sharing_room(owner, payload, enforce_limit=False)
    case.linked_room = room
    case.save(update_fields=["linked_room", "updated_at"])
    record_portal_audit_event(case.organization, user, "portal_case_room_created",
                              obj=case, object_label=case.title, related_object=room)
    return room


def create_case_document_request(case: PortalCase, user, *, requirement=None, payload: dict | None = None):
    """
    Create a DocumentRequestLink for the case (recipient defaults to the person),
    optionally tied to a pack requirement, and link it to the case. Reuses the
    Document Request Link primitive (no second request system). If the case has a
    room that allows upload, the request is surfaced there too.
    """
    from apps.documents.document_requests import DocumentRequestError, create_document_request
    from apps.documents.models import DocumentBundleRequirement

    from .portal_limits import enforce_organization_portal_limit

    enforce_organization_portal_limit(case.organization, "active_document_requests")
    payload = dict(payload or {})
    owner = _case_owner(case)
    person = case.person

    req_payload = {
        "requested_document_title": (payload.get("requested_document_title")
                                     or (requirement.title if requirement else "")
                                     or "Requested document"),
        "instructions": payload.get("instructions") or "",
        "recipient_name": payload.get("recipient_name") or person.full_name,
        "recipient_email": payload.get("recipient_email") or person.email,
        "due_date": payload.get("due_date") or (case.due_date.isoformat() if case.due_date else None),
        "expires_at": payload.get("expires_at"),
    }
    if case.linked_bundle_id:
        req_payload["linked_bundle"] = case.linked_bundle_id
    requirement_obj = None
    if requirement is not None:
        requirement_obj = requirement
    elif payload.get("requirement"):
        requirement_obj = DocumentBundleRequirement.objects.filter(
            pk=payload["requirement"], owner=owner,
            bundle__portal_cases=case,
        ).first()
    if requirement_obj is not None:
        req_payload["linked_requirement"] = requirement_obj.id
        req_payload["linked_bundle"] = requirement_obj.bundle_id

    try:
        # enforce_limit=False: governed by the ORG request limit (enforced above).
        link = create_document_request(owner, req_payload, enforce_limit=False)
    except DocumentRequestError as exc:
        raise PortalError(str(exc))

    PortalCaseDocumentRequest.objects.create(
        case=case, document_request=link, requirement=requirement_obj
    )
    # If the case has an open room that surfaces uploads, add the request there.
    if case.linked_room_id and case.linked_room.allow_upload:
        from apps.documents.sharing_rooms import add_document_request_to_room

        try:
            add_document_request_to_room(case.linked_room, link, owner)
        except Exception:  # noqa: BLE001 — linking to the room is best-effort
            pass

    if case.status == PortalCase.Status.DRAFT:
        update_portal_case_status(case, user, PortalCase.Status.COLLECTING_DOCUMENTS)
    record_portal_audit_event(case.organization, user, "portal_case_request_created",
                              obj=case, object_label=case.title, related_object=link,
                              metadata={"title": link.requested_document_title})
    return link


def attach_request_to_case(case: PortalCase, request_link, user) -> PortalCaseDocumentRequest:
    """Link an existing (owner-owned) request to the case."""
    if request_link.owner_id != _case_owner(case).id:
        raise PortalError("That request is not owned by this case.")
    join, _ = PortalCaseDocumentRequest.objects.get_or_create(
        case=case, document_request=request_link
    )
    return join


# ---- Progress + review ------------------------------------------------------


def compute_case_progress(case: PortalCase) -> dict:
    """Deterministic progress from the linked pack's requirements + the case's
    document requests. Never raises."""
    from apps.documents.models import DocumentRequestLink as DR

    progress = {
        "total_requirements": 0, "satisfied_requirements": 0, "missing_requirements": 0,
        "readiness_score": 0,
        "requests_total": 0, "requests_uploaded": 0, "requests_accepted": 0,
        "requests_needs_replacement": 0, "uploads_needing_review": 0,
        "suggested_status": case.status,
    }
    bundle = case.linked_bundle
    required_missing = None
    if bundle is not None:
        from apps.documents.services import bundle_readiness

        r = bundle_readiness(bundle)
        progress["total_requirements"] = r.required_total
        progress["satisfied_requirements"] = r.required_satisfied
        progress["missing_requirements"] = r.required_missing
        progress["readiness_score"] = r.score
        required_missing = r.required_missing

    links = DR.objects.filter(portal_case_links__case=case)
    progress["requests_total"] = links.count()
    progress["requests_accepted"] = links.filter(status=DR.Status.ACCEPTED).count()
    review = links.filter(status__in=(DR.Status.UPLOADED, DR.Status.UNDER_REVIEW)).count()
    progress["uploads_needing_review"] = review
    progress["requests_uploaded"] = review
    progress["requests_needs_replacement"] = links.filter(
        status=DR.Status.NEEDS_REPLACEMENT
    ).count()

    if review > 0:
        progress["suggested_status"] = PortalCase.Status.WAITING_FOR_REVIEW
    elif required_missing == 0 and progress["total_requirements"] > 0:
        progress["suggested_status"] = PortalCase.Status.READY
    elif (progress["missing_requirements"] > 0) or (progress["requests_total"] > 0):
        progress["suggested_status"] = PortalCase.Status.COLLECTING_DOCUMENTS
    return progress


def build_review_queue(organization) -> list[dict]:
    """Document requests across the org's cases with an upload awaiting review."""
    from apps.documents.models import DocumentRequestLink as DR

    rows = (
        PortalCaseDocumentRequest.objects.filter(
            case__organization=organization,
            document_request__status__in=(DR.Status.UPLOADED, DR.Status.UNDER_REVIEW),
        )
        .exclude(case__status=PortalCase.Status.ARCHIVED)
        .select_related("case", "case__person", "document_request")
        .order_by("-document_request__uploaded_at")
    )
    out = []
    for row in rows:
        link = row.document_request
        out.append({
            "case_id": row.case_id,
            "case_title": row.case.title,
            "person_name": row.case.person.full_name,
            "document_request_id": link.id,
            "requested_document_title": link.requested_document_title,
            "status": link.status,
            "uploaded_at": link.uploaded_at.isoformat() if link.uploaded_at else None,
        })
    return out


# ---- Dashboard + payloads ---------------------------------------------------


def build_portal_dashboard_context(organization, user) -> dict:
    today = timezone.now().date()
    cases = PortalCase.objects.filter(organization=organization)
    active = cases.exclude(status=PortalCase.Status.ARCHIVED)
    people = PortalPerson.objects.filter(organization=organization)
    review_queue = build_review_queue(organization)
    return {
        "people_total": people.exclude(status=PortalPerson.Status.ARCHIVED).count(),
        "active_cases": active.count(),
        "people_waiting_for_documents": people.filter(
            status=PortalPerson.Status.WAITING_FOR_DOCUMENTS
        ).count(),
        "uploads_needing_review": len(review_queue),
        "overdue_cases": active.filter(due_date__lt=today).count(),
        "ready_cases": active.filter(status=PortalCase.Status.READY).count(),
        "blocked_cases": active.filter(status=PortalCase.Status.BLOCKED).count(),
    }


def build_portal_person_payload(person: PortalPerson) -> dict:
    return {
        "id": person.id,
        "full_name": person.full_name,
        "email": person.email,
        "phone": person.phone,
        "person_type": person.person_type,
        "status": person.status,
        "notes": person.notes,
        "active_cases": person.cases.exclude(status=PortalCase.Status.ARCHIVED).count(),
        "created_at": person.created_at.isoformat(),
        "updated_at": person.updated_at.isoformat(),
    }


def build_portal_case_payload(case: PortalCase, user=None) -> dict:
    progress = compute_case_progress(case)
    room = case.linked_room
    return {
        "id": case.id,
        "title": case.title,
        "case_type": case.case_type,
        "status": case.status,
        "priority": case.priority,
        "due_date": case.due_date.isoformat() if case.due_date else None,
        "notes": case.notes,
        "person": {
            "id": case.person_id,
            "full_name": case.person.full_name,
            "email": case.person.email,
            "person_type": case.person.person_type,
        },
        "linked_bundle": case.linked_bundle_id,
        "linked_application": case.linked_application_id,
        "linked_room": case.linked_room_id,
        # The room's public page route only — never a raw storage URL.
        "room_public_url": _room_public_url(room) if room else None,
        "progress": progress,
        "requests": _case_requests_payload(case),
        "created_at": case.created_at.isoformat(),
        "updated_at": case.updated_at.isoformat(),
    }


def _case_requests_payload(case: PortalCase) -> list[dict]:
    rows = (
        PortalCaseDocumentRequest.objects.filter(case=case)
        .select_related("document_request").order_by("-created_at")
    )
    out = []
    for row in rows:
        link = row.document_request
        out.append({
            "document_request_id": link.id,
            "requested_document_title": link.requested_document_title,
            "status": link.status,
            "recipient_name": link.recipient_name,
            "can_upload": link.can_upload,
            # Public upload page route (frontend) — never a storage URL/token-as-URL.
            "upload_url": _request_public_url(link),
            "requirement_id": row.requirement_id,
        })
    return out


# ---- Audit ------------------------------------------------------------------


def record_portal_audit_event(organization, user, event_type, *, obj=None,
                              object_label=None, related_object=None, metadata=None,
                              severity="info"):
    """Record a portal security event in the unified Audit Log (best-effort).

    Owner = the org-portal owner user (the case/person creator or org creator);
    actor = the acting member. ``org_id`` is added to metadata for scoping. Never
    stores document contents, tokens, or URLs.
    """
    try:
        from apps.documents.audit import record_audit_event

        owner = _org_owner_user(organization)
        if owner is None:
            return None
        meta = dict(metadata or {})
        meta["org_id"] = organization.id
        return record_audit_event(
            owner, event_type, _AUDIT_CATEGORY,
            actor_user=user if getattr(user, "is_authenticated", False) else None,
            obj=obj, object_type=obj.__class__.__name__ if obj is not None else "",
            object_label=object_label, related_object=related_object,
            metadata=meta, severity=severity,
        )
    except Exception:  # noqa: BLE001 — audit must never break a portal action
        return None


# ---- Helpers ----------------------------------------------------------------


def _case_owner(case: PortalCase):
    # Portal-created primitives are owned by ONE consistent user — the organization
    # owner — so org-level limits govern them (not a random staff member's personal
    # plan). The acting member is recorded separately as created_by/actor. Falls
    # back to the case creator only if the org has no resolvable owner.
    return _org_owner_user(case.organization) or case.created_by


def _org_owner_user(organization):
    if organization.created_by_id:
        return organization.created_by
    from .models import OrganizationMembership

    m = OrganizationMembership.objects.filter(
        organization=organization, role=OrganizationMembership.Role.OWNER,
        status=OrganizationMembership.Status.ACTIVE,
    ).select_related("user").first()
    return m.user if m else None


def _room_public_url(room):
    from django.conf import settings

    base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
    return f"{base}/room/{room.token}"


def _request_public_url(link):
    from django.conf import settings

    base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
    return f"{base}/document-request/{link.token}"


def _normalize_requirements(requirements) -> list[dict]:
    out = []
    for r in requirements or []:
        if isinstance(r, str):
            title = r.strip()
            if title:
                out.append({"title": title, "required": True})
        elif isinstance(r, dict) and (r.get("title") or "").strip():
            out.append({"title": r["title"].strip(), "required": bool(r.get("required", True))})
    return out


def _choice(value, choices_cls, default):
    value = (value or "").strip().lower()
    return value if value in choices_cls.values else default


def _date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None
