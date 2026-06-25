"""
Organization Templates V1 — reusable case workflows for B2B portals.

An organization defines a template once (case type, title pattern, priority, due
offset, a checklist of requirements, and auto-create toggles for pack / sharing
room / document requests). Staff then create a portal case from it in one step.

Applying a template is pure ORCHESTRATION over the existing portal primitives —
it reuses ``portals.create_portal_case`` / ``create_case_pack`` /
``create_case_room`` / ``create_case_document_request`` (which already enforce the
org's Teams limits and record audit events) and never introduces a second pack,
room, request, or upload system. Configuration only — templates store no document
contents, files, tokens, or recipient data. Deterministic — no AI, no AI credits.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone

from . import portals
from .models import (
    OrganizationCaseTemplate,
    OrganizationCaseTemplateRequirement,
    PortalCase,
    PortalPerson,
)
from .portals import PortalError, record_portal_audit_event

_TemplateStatus = OrganizationCaseTemplate.Status


# ---- Template CRUD ----------------------------------------------------------


def create_case_template(organization, user, payload: dict) -> OrganizationCaseTemplate:
    name = (payload.get("name") or "").strip()
    if not name:
        raise PortalError("A template name is required.")
    template = OrganizationCaseTemplate.objects.create(
        organization=organization,
        created_by=user,
        name=name[:255],
        description=(payload.get("description") or "").strip(),
        case_type=_case_type(payload.get("case_type")),
        default_case_title=(payload.get("default_case_title") or "").strip()[:255],
        default_priority=portals._choice(
            payload.get("default_priority"), PortalCase.Priority, PortalCase.Priority.NORMAL
        ),
        default_due_days=_positive_int(payload.get("default_due_days")),
        auto_create_pack=_as_bool(payload.get("auto_create_pack"), True),
        auto_create_room=_as_bool(payload.get("auto_create_room"), True),
        auto_create_requests=_as_bool(payload.get("auto_create_requests"), False),
        default_room_title=(payload.get("default_room_title") or "").strip()[:255],
        default_room_description=(payload.get("default_room_description") or "").strip(),
        default_custom_status_key=(payload.get("default_custom_status_key") or "").strip()[:80],
        default_custom_field_values=_safe_dict(payload.get("default_custom_field_values")),
    )
    _replace_requirements(template, payload.get("requirements"))
    record_template_audit_event(
        organization, user, "organization_template_created", template,
        metadata={"template_name": template.name, "case_type": template.case_type,
                  "requirements_count": template.requirements.count()},
    )
    return template


def update_case_template(template, user, payload: dict) -> OrganizationCaseTemplate:
    fields = []
    for attr, key, maxlen in (
        ("name", "name", 255),
        ("description", "description", None),
        ("default_case_title", "default_case_title", 255),
        ("default_room_title", "default_room_title", 255),
        ("default_room_description", "default_room_description", None),
    ):
        if key in payload:
            value = (payload.get(key) or "").strip()
            setattr(template, attr, value[:maxlen] if maxlen else value)
            fields.append(attr)
    if "case_type" in payload:
        template.case_type = _case_type(payload.get("case_type"))
        fields.append("case_type")
    if "default_priority" in payload:
        template.default_priority = portals._choice(
            payload.get("default_priority"), PortalCase.Priority, template.default_priority
        )
        fields.append("default_priority")
    if "default_due_days" in payload:
        template.default_due_days = _positive_int(payload.get("default_due_days"))
        fields.append("default_due_days")
    if "default_custom_status_key" in payload:
        template.default_custom_status_key = (payload.get("default_custom_status_key") or "").strip()[:80]
        fields.append("default_custom_status_key")
    if "default_custom_field_values" in payload:
        template.default_custom_field_values = _safe_dict(payload.get("default_custom_field_values"))
        fields.append("default_custom_field_values")
    for attr in ("auto_create_pack", "auto_create_room", "auto_create_requests"):
        if attr in payload:
            setattr(template, attr, _as_bool(payload.get(attr), getattr(template, attr)))
            fields.append(attr)
    if not template.name.strip():
        raise PortalError("A template name is required.")
    if fields:
        fields.append("updated_at")
        template.save(update_fields=fields)
    if "requirements" in payload:
        _replace_requirements(template, payload.get("requirements"))
    record_template_audit_event(
        template.organization, user, "organization_template_updated", template,
        metadata={"template_name": template.name},
    )
    return template


def archive_case_template(template, user) -> OrganizationCaseTemplate:
    if template.status != _TemplateStatus.ARCHIVED:
        template.status = _TemplateStatus.ARCHIVED
        template.archived_at = timezone.now()
        template.save(update_fields=["status", "archived_at", "updated_at"])
        record_template_audit_event(
            template.organization, user, "organization_template_archived", template,
            metadata={"template_name": template.name},
        )
    return template


def duplicate_case_template(template, user) -> OrganizationCaseTemplate:
    """Create an editable copy of a template (same org). Reuses create_case_template
    so the copy is a fresh active template with its own requirements."""
    payload = build_case_template_payload(template, include_requirements=True)
    payload["name"] = f"{template.name} (copy)"[:255]
    return create_case_template(template.organization, user, payload)


def _replace_requirements(template, requirements):
    """Replace the template's requirement rows from a payload list (ordered)."""
    if requirements is None:
        return
    template.requirements.all().delete()
    rows = []
    for i, raw in enumerate(requirements or []):
        if isinstance(raw, str):
            raw = {"title": raw}
        if not isinstance(raw, dict):
            continue
        title = (raw.get("title") or "").strip()
        if not title:
            continue
        rows.append(OrganizationCaseTemplateRequirement(
            template=template,
            title=title[:255],
            instructions=(raw.get("instructions") or "").strip(),
            required=_as_bool(raw.get("required"), True),
            sort_order=_positive_int(raw.get("sort_order")) or i,
            request_message=(raw.get("request_message") or "").strip(),
            due_days_offset=_positive_int(raw.get("due_days_offset")),
            accepted_file_types=_string_list(raw.get("accepted_file_types")),
        ))
    OrganizationCaseTemplateRequirement.objects.bulk_create(rows)


# ---- Payloads ---------------------------------------------------------------


def build_case_template_payload(template, *, include_requirements=True) -> dict:
    data = {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "case_type": template.case_type,
        "default_case_title": template.default_case_title,
        "default_priority": template.default_priority,
        "default_due_days": template.default_due_days,
        "auto_create_pack": template.auto_create_pack,
        "auto_create_room": template.auto_create_room,
        "auto_create_requests": template.auto_create_requests,
        "default_room_title": template.default_room_title,
        "default_room_description": template.default_room_description,
        "default_custom_status_key": template.default_custom_status_key,
        "default_custom_field_values": template.default_custom_field_values or {},
        "status": template.status,
        "requirement_count": template.requirements.count(),
        "created_at": template.created_at.isoformat(),
        "updated_at": template.updated_at.isoformat(),
    }
    if include_requirements:
        data["requirements"] = [
            _requirement_payload(r) for r in template.requirements.all()
        ]
    return data


def _requirement_payload(req) -> dict:
    return {
        "id": req.id,
        "title": req.title,
        "instructions": req.instructions,
        "required": req.required,
        "sort_order": req.sort_order,
        "request_message": req.request_message,
        "due_days_offset": req.due_days_offset,
        "accepted_file_types": req.accepted_file_types or [],
    }


def build_case_template_list_payload(organization, *, include_archived=False) -> list[dict]:
    qs = OrganizationCaseTemplate.objects.filter(organization=organization)
    if not include_archived:
        qs = qs.exclude(status=_TemplateStatus.ARCHIVED)
    return [build_case_template_payload(t, include_requirements=False) for t in qs]


# ---- Due-date helpers -------------------------------------------------------


def compute_template_default_due_date(template, base_date=None):
    if not template.default_due_days:
        return None
    base = base_date or timezone.now().date()
    return base + timedelta(days=int(template.default_due_days))


def compute_requirement_due_date(template_requirement, case_due_date=None, base_date=None):
    if template_requirement.due_days_offset is not None:
        base = base_date or timezone.now().date()
        return base + timedelta(days=int(template_requirement.due_days_offset))
    return case_due_date


# ---- Create case from template ----------------------------------------------


def create_case_from_template(organization, user, template, person, payload: dict) -> dict:
    """Create a PortalCase from a template, plus the optional pack / room / requests.

    Best-effort on the OPTIONAL resources: a room/request that hits an org limit is
    skipped with a warning rather than discarding the already-created case. The
    case itself (and its case limit) is the only hard blocker — that error
    propagates as the structured org-limit response.
    """
    if template.status == _TemplateStatus.ARCHIVED:
        raise PortalError("This template is archived and cannot create cases.")
    if template.organization_id != organization.id:
        raise PortalError("That template is not in this organization.")
    if person.organization_id != organization.id:
        raise PortalError("That person is not in this organization.")

    create_pack = _as_bool(payload.get("create_pack"), template.auto_create_pack)
    create_room = _as_bool(payload.get("create_room"), template.auto_create_room)
    create_requests = _as_bool(payload.get("create_requests"), template.auto_create_requests)
    send_emails = _as_bool(payload.get("send_request_emails"), False)

    base_date = timezone.now().date()
    due_date = portals._date(payload.get("due_date")) or compute_template_default_due_date(
        template, base_date
    )
    title = (payload.get("title") or "").strip() or _render_title(template, person)

    selected = _selected_requirements(template, payload.get("selected_requirement_ids"))
    warnings: list[str] = []

    # 1) The case (enforces the active-case org limit; raises on exceed).
    case = portals.create_portal_case(organization, user, person, {
        "title": title,
        "case_type": template.case_type,
        "priority": template.default_priority,
        "due_date": due_date.isoformat() if isinstance(due_date, date) else None,
    })

    # B2B Custom Fields and Statuses V1 — apply the template's custom defaults and
    # any custom field values submitted with the create-case request. Best-effort:
    # a bad value warns but never discards the created case.
    _apply_custom_defaults(case, template, payload, user, warnings)

    pack = None
    if create_pack and selected:
        pack = create_template_pack(case, template, user, selected)

    room = None
    if create_room:
        try:
            room = create_template_room(case, template, user)
        except portals.PortalError:
            warnings.append("room_not_created")
        except Exception as exc:  # noqa: BLE001 — org-limit etc. → warn, keep the case
            if _is_org_limit(exc):
                warnings.append("room_limit_reached")
            else:
                raise

    created_requests = 0
    skipped_requirements: list[str] = []
    if create_requests and selected:
        created_requests, skipped_requirements, req_warnings = create_template_document_requests(
            case, template, user, selected, send_emails=send_emails
        )
        warnings.extend(req_warnings)

    record_template_audit_event(
        organization, user, "portal_case_created_from_template", template,
        obj=case, object_label=case.title,
        metadata={"template_name": template.name, "case_id": case.id,
                  "case_type": case.case_type,
                  "requirements_count": len(selected),
                  "created_requests_count": created_requests,
                  "result": "ok"},
    )

    return {
        "case": portals.build_portal_case_payload(case),
        "pack_created": pack is not None,
        "room_created": room is not None,
        "created_requests_count": created_requests,
        "skipped_requirements": skipped_requirements,
        "warnings": warnings,
        "progress": portals.compute_case_progress(case),
    }


def create_template_pack(case, template, user, selected_requirements=None):
    """Create the case pack from template requirements (reuses create_case_pack),
    then enrich each created requirement with its instructions / due date /
    sort order (which create_case_pack does not carry)."""
    reqs = selected_requirements if selected_requirements is not None else list(
        template.requirements.all()
    )
    if not reqs:
        return None
    bundle = portals.create_case_pack(
        case, user,
        requirements=[{"title": r.title, "required": r.required} for r in reqs],
    )
    record_template_audit_event(
        case.organization, user, "portal_template_pack_created", template,
        obj=case, object_label=case.title, related_object=bundle,
        metadata={"template_name": template.name, "case_id": case.id,
                  "requirements_count": len(reqs)},
    )
    # Enrich: create_case_pack assigns sort_order in list order, so zip 1:1.
    created = list(bundle.requirements.order_by("sort_order", "id"))
    case_due = case.due_date
    for tmpl_req, bundle_req in zip(reqs, created):
        bundle_req.description = tmpl_req.instructions
        bundle_req.due_date = compute_requirement_due_date(tmpl_req, case_due)
        bundle_req.sort_order = tmpl_req.sort_order
        bundle_req.save(update_fields=["description", "due_date", "sort_order", "updated_at"])
    return bundle


def create_template_room(case, template, user):
    """Create the case sharing room (reuses create_case_room; enforces the org
    sharing-room limit). Applies the template's room title/description if set."""
    room = portals.create_case_room(case, user)
    changed = []
    if template.default_room_title:
        room.title = template.default_room_title[:255]
        changed.append("title")
    if template.default_room_description:
        room.description = template.default_room_description
        changed.append("description")
    if changed:
        changed.append("updated_at")
        room.save(update_fields=changed)
    record_template_audit_event(
        case.organization, user, "portal_template_room_created", template,
        obj=case, object_label=case.title, related_object=room,
        metadata={"template_name": template.name, "case_id": case.id},
    )
    return room


def create_template_document_requests(case, template, user, selected_requirements=None,
                                      *, send_emails=False):
    """Create a DocumentRequestLink per selected template requirement (reuses
    create_case_document_request; enforces the org request limit per request).

    Returns ``(created_count, skipped_requirement_titles, warnings)``. A request
    that hits the org limit stops the loop with a ``request_limit_reached`` warning;
    the case + already-created requests are kept.
    """
    reqs = selected_requirements if selected_requirements is not None else list(
        template.requirements.all()
    )
    created = 0
    skipped: list[str] = []
    warnings: list[str] = []
    person = case.person
    case_due = case.due_date

    # Map template requirements to the pack's bundle requirements (by order) so the
    # request satisfies the right requirement on acceptance.
    bundle_reqs = []
    if case.linked_bundle_id:
        bundle_reqs = list(case.linked_bundle.requirements.order_by("sort_order", "id"))

    for idx, tmpl_req in enumerate(reqs):
        requirement_obj = bundle_reqs[idx] if idx < len(bundle_reqs) else None
        due = compute_requirement_due_date(tmpl_req, case_due)
        req_payload = {
            "requested_document_title": tmpl_req.title,
            "instructions": tmpl_req.request_message or tmpl_req.instructions,
            "recipient_name": person.full_name,
            "recipient_email": person.email,
            "due_date": due.isoformat() if isinstance(due, date) else None,
        }
        try:
            link = portals.create_case_document_request(
                case, user, requirement=requirement_obj, payload=req_payload
            )
        except portals.PortalError:
            skipped.append(tmpl_req.title)
            continue
        except Exception as exc:  # noqa: BLE001 — org request-limit → stop + warn
            if _is_org_limit(exc):
                warnings.append("request_limit_reached")
                skipped.append(tmpl_req.title)
                break
            raise
        created += 1
        if send_emails:
            _send_request_email(link, case)

    if created:
        record_template_audit_event(
            case.organization, user, "portal_template_requests_created", template,
            obj=case, object_label=case.title,
            metadata={"template_name": template.name, "case_id": case.id,
                      "created_requests_count": created},
        )
    return created, skipped, warnings


def _send_request_email(link, case) -> bool:
    """Optionally notify the recipient about a freshly created request. Reuses the
    shared branded-email helper + the existing ``portal_bulk_reminder`` template —
    no new email system. Carries only the public upload link + safe context; never
    a private file URL, storage key, or document content. Never raises."""
    if not link.recipient_email:
        return False
    try:
        from django.conf import settings

        from common.email import send_branded_email

        base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
        action_url = (f"{base}/document-request/{link.token}"
                      if link.can_upload and link.token else "")
        return send_branded_email(
            subject="Action needed: please upload your document",
            template="portal_bulk_reminder",
            context={
                "from_name": case.organization.name or "Your document portal",
                "recipient_name": link.recipient_name,
                "reminder_type": "overdue_requests",
                "reminder_label": "Document request",
                "case_title": case.title,
                "document_title": link.requested_document_title,
                "missing_titles": [],
                "due_date": link.due_date.isoformat() if link.due_date else None,
                "reason": link.instructions or "",
                "action_url": action_url,
                "message_intro": "",
                "preferences_url": f"{base}/dashboard/settings",
            },
            to=link.recipient_email,
            email_type="portal_template_request",
            category="transactional",
        )
    except Exception:  # noqa: BLE001 — emailing must never break case creation
        return False


# ---- Audit ------------------------------------------------------------------


def record_template_audit_event(organization, user, event_type, template, *, obj=None,
                                object_label=None, related_object=None, metadata=None):
    meta = dict(metadata or {})
    meta.setdefault("template_id", template.id if template is not None else "")
    record_portal_audit_event(
        organization, user, event_type,
        obj=obj if obj is not None else template,
        object_label=object_label or (template.name if template is not None else ""),
        related_object=related_object, metadata=meta,
    )


# ---- Helpers ----------------------------------------------------------------


def _render_title(template, person) -> str:
    pattern = template.default_case_title or "{person_name}"
    title = pattern.replace("{person_name}", person.full_name or "")
    title = title.strip()
    if not title:
        title = person.full_name or template.name
    return title[:255]


def _selected_requirements(template, selected_ids):
    qs = template.requirements.all()
    if selected_ids:
        wanted = {str(s) for s in selected_ids}
        return [r for r in qs if str(r.id) in wanted]
    return list(qs)


def _case_type(value) -> str:
    value = (value or "").strip().lower()
    return value if value in PortalCase.CaseType.values else PortalCase.CaseType.GENERAL


def _is_org_limit(exc) -> bool:
    from .portal_limits import OrganizationPlanLimitExceeded

    return isinstance(exc, OrganizationPlanLimitExceeded)


def _as_bool(value, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _positive_int(value):
    try:
        n = int(value)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def _string_list(value) -> list:
    if not isinstance(value, (list, tuple)):
        return []
    return [str(v)[:40] for v in value][:20]


def _apply_custom_defaults(case, template, payload, user, warnings):
    """Apply the template's default custom status + field values, then any custom
    field values submitted with the create-case payload (which override defaults).
    Best-effort — a validation error is recorded as a warning, not raised."""
    from . import custom_fields
    from .models import OrganizationCaseStatusDefinition

    org = case.organization
    # Default custom status (by key).
    status_key = (template.default_custom_status_key or "").strip()
    if status_key:
        status_def = OrganizationCaseStatusDefinition.objects.filter(
            organization=org, key=status_key, is_active=True
        ).first()
        if status_def is not None:
            try:
                custom_fields.set_case_custom_status(case, status_def, user)
            except PortalError:
                warnings.append("custom_status_not_applied")

    # Merge template default field values with the submitted ones (submitted wins).
    values = {}
    if isinstance(template.default_custom_field_values, dict):
        values.update(template.default_custom_field_values)
    submitted = payload.get("custom_field_values")
    if isinstance(submitted, dict):
        values.update(submitted)
    if values:
        try:
            custom_fields.set_custom_field_values(org, case, values, user)
        except PortalError:
            warnings.append("custom_fields_not_applied")


def _safe_dict(value) -> dict:
    """A shallow {str: scalar/list} dict for template custom-field defaults. Drops
    nested objects, huge values, and non-string keys (validated again on apply)."""
    if not isinstance(value, dict):
        return {}
    out = {}
    for k, v in list(value.items())[:50]:
        if not isinstance(k, str):
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[k] = (v[:2000] if isinstance(v, str) else v)
        elif isinstance(v, list):
            out[k] = [str(x)[:120] for x in v[:50]]
    return out
