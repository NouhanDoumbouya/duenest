"""
B2B Custom Fields and Statuses V1 — org-defined metadata + workflow statuses.

Organizations define custom fields (on portal people/cases) and custom case
statuses without a CRM, a form builder, dynamic DB columns, or raw SQL. Field
VALUES are stored as validated JSON on ``OrganizationCustomFieldValue`` (validated
by ``field_type``); custom statuses LAYER on top of the fixed ``PortalCase.Status``
(each maps to a system category) so the dashboard / reminders / review workflows
keep working unchanged. Deterministic — no AI, no AI credits. Stores no files,
tokens, or secrets; size-limited values.
"""

from __future__ import annotations

import re
from datetime import date

from django.utils import timezone
from django.utils.text import slugify

from .models import (
    OrganizationCaseStatusDefinition,
    OrganizationCustomField,
    OrganizationCustomFieldValue,
    PortalCase,
)
from .portals import PortalError, record_portal_audit_event

_FieldType = OrganizationCustomField.FieldType
_MAX_TEXT = 2000
_MAX_SHORT = 255
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Custom-status category → the authoritative fixed PortalCase.Status it keeps in
# sync. This is what makes custom statuses safe: the system status never drifts.
_CATEGORY_TO_SYSTEM = {
    "planning": PortalCase.Status.DRAFT,
    "collecting": PortalCase.Status.COLLECTING_DOCUMENTS,
    "reviewing": PortalCase.Status.WAITING_FOR_REVIEW,
    "ready": PortalCase.Status.READY,
    "submitted": PortalCase.Status.SUBMITTED,
    "completed": PortalCase.Status.COMPLETED,
    "blocked": PortalCase.Status.BLOCKED,
    "closed": PortalCase.Status.COMPLETED,
}

# Default seeded statuses (mirror the system workflow) — (key, label, category,
# maps_to_system_status, is_terminal, is_default).
_DEFAULT_STATUSES = [
    ("planning", "Planning", "planning", "planning", False, True),
    ("collecting_documents", "Collecting Documents", "collecting", "documents_missing", False, False),
    ("in_review", "In Review", "reviewing", "under_review", False, False),
    ("ready_to_submit", "Ready to Submit", "ready", "ready_to_submit", False, False),
    ("submitted", "Submitted", "submitted", "submitted", False, False),
    ("accepted", "Accepted", "completed", "accepted", True, False),
    ("rejected", "Rejected", "closed", "rejected", True, False),
    ("withdrawn", "Withdrawn", "closed", "withdrawn", True, False),
    ("renewal_needed", "Renewal Needed", "collecting", "renewal_needed", False, False),
]


# ---- Limits -----------------------------------------------------------------

_CAPS = {
    "teams_beta": {"fields": 50, "statuses": 30, "options": 50},
    "teams": {"fields": 200, "statuses": 100, "options": 200},
    "enterprise": {"fields": None, "statuses": None, "options": None},
}


def _caps(organization) -> dict:
    from .portal_limits import _plan_for

    return _CAPS.get(_plan_for(organization), _CAPS["teams_beta"])


def _enforce_cap(organization, resource, model_qs):
    cap = _caps(organization).get(resource)
    if cap is not None and model_qs.count() >= cap:
        raise PortalError(f"This organization has reached its {resource} limit ({cap}).")


# ---- Custom field definitions -----------------------------------------------


def create_custom_field(organization, user, payload: dict) -> OrganizationCustomField:
    label = (payload.get("label") or "").strip()
    if not label:
        raise PortalError("A field label is required.")
    target = _choice(payload.get("target"), OrganizationCustomField.Target, None)
    if target is None:
        raise PortalError("Field target must be 'person' or 'case'.")
    field_type = _choice(payload.get("field_type"), _FieldType, None)
    if field_type is None:
        raise PortalError("A valid field_type is required.")
    _enforce_cap(organization, "fields",
                 OrganizationCustomField.objects.filter(organization=organization, is_active=True))
    key = _unique_field_key(organization, target, payload.get("key") or label)
    options = _validate_options(organization, field_type, payload.get("options"))
    field = OrganizationCustomField.objects.create(
        organization=organization, key=key, label=label[:120],
        description=(payload.get("description") or "").strip()[:255],
        target=target, field_type=field_type, options=options,
        required=_truthy(payload.get("required")),
        visibility=_choice(payload.get("visibility"), OrganizationCustomField.Visibility,
                          OrganizationCustomField.Visibility.INTERNAL),
        sort_order=_int(payload.get("sort_order")), created_by=user,
    )
    _audit(organization, user, "organization_custom_field_created", obj=field,
           metadata={"field_id": field.id, "field_key": field.key,
                     "field_label": field.label, "target": field.target,
                     "field_type": field.field_type})
    return field


def update_custom_field(field, user, payload: dict) -> OrganizationCustomField:
    fields = []
    if "label" in payload:
        field.label = (payload.get("label") or "").strip()[:120]
        fields.append("label")
    if "description" in payload:
        field.description = (payload.get("description") or "").strip()[:255]
        fields.append("description")
    if "required" in payload:
        field.required = _truthy(payload.get("required"))
        fields.append("required")
    if "visibility" in payload:
        field.visibility = _choice(payload.get("visibility"),
                                   OrganizationCustomField.Visibility, field.visibility)
        fields.append("visibility")
    if "sort_order" in payload:
        field.sort_order = _int(payload.get("sort_order"))
        fields.append("sort_order")
    if "options" in payload:
        field.options = _validate_options(field.organization, field.field_type,
                                          payload.get("options"))
        fields.append("options")
    # field_type and target are immutable after creation (existing values rely on
    # the original type) — silently ignored to avoid corrupting stored values.
    if not field.label.strip():
        raise PortalError("A field label is required.")
    if fields:
        fields.append("updated_at")
        field.save(update_fields=fields)
    _audit(field.organization, user, "organization_custom_field_updated", obj=field,
           metadata={"field_id": field.id, "field_key": field.key})
    return field


def archive_custom_field(field, user) -> OrganizationCustomField:
    if field.is_active:
        field.is_active = False
        field.save(update_fields=["is_active", "updated_at"])
        _audit(field.organization, user, "organization_custom_field_archived", obj=field,
               metadata={"field_id": field.id, "field_key": field.key})
    return field


# ---- Validation -------------------------------------------------------------


def validate_custom_field_value(field, value):
    """Validate + normalize a value for ``field`` by its type. Returns the cleaned
    value (JSON-safe), or raises ``PortalError``. ``None``/'' clears the value
    (rejected only if the field is required, checked by the caller)."""
    ft = field.field_type
    if value is None or value == "":
        return None
    if ft in (_FieldType.SHORT_TEXT, _FieldType.EMAIL, _FieldType.PHONE, _FieldType.URL):
        value = _as_text(value, _MAX_SHORT)
        if ft == _FieldType.EMAIL and not _EMAIL_RE.match(value):
            raise PortalError(f"'{field.label}' must be a valid email address.")
        if ft == _FieldType.URL and not re.match(r"^https?://", value, re.I):
            raise PortalError(f"'{field.label}' must be an http(s) URL.")
        return value
    if ft == _FieldType.LONG_TEXT:
        return _as_text(value, _MAX_TEXT)
    if ft == _FieldType.NUMBER:
        try:
            return int(value) if float(value).is_integer() else float(value)
        except (TypeError, ValueError):
            raise PortalError(f"'{field.label}' must be a number.")
    if ft == _FieldType.DATE:
        try:
            return date.fromisoformat(str(value)[:10]).isoformat()
        except (TypeError, ValueError):
            raise PortalError(f"'{field.label}' must be an ISO date (YYYY-MM-DD).")
    if ft == _FieldType.BOOLEAN:
        return _truthy(value)
    if ft == _FieldType.SINGLE_SELECT:
        keys = _option_keys(field)
        if str(value) not in keys:
            raise PortalError(f"'{field.label}' must be one of its options.")
        return str(value)
    if ft == _FieldType.MULTI_SELECT:
        if not isinstance(value, (list, tuple)):
            raise PortalError(f"'{field.label}' must be a list of options.")
        keys = _option_keys(field)
        cleaned = [str(v) for v in value if str(v) in keys]
        if len(cleaned) != len(value):
            raise PortalError(f"'{field.label}' contains an unknown option.")
        return cleaned[:50]
    raise PortalError("Unsupported field type.")


def _as_text(value, maxlen) -> str:
    if isinstance(value, (dict, list)):
        raise PortalError("This field does not accept structured values.")
    text = str(value)
    if len(text) > maxlen:
        raise PortalError(f"Value exceeds the maximum length ({maxlen}).")
    # Reject obvious script/HTML payloads (defense-in-depth; never rendered raw).
    if "<script" in text.lower():
        raise PortalError("Value contains disallowed content.")
    return text


# ---- Field values -----------------------------------------------------------


def set_custom_field_values(organization, target, values: dict, user) -> list[str]:
    """Set/clear custom field values on a person or case. ``target`` is a
    PortalPerson or PortalCase. ``values`` is {field_key: value}. Returns the list
    of changed field keys. Validates scope + type; rejects archived fields."""
    is_case = isinstance(target, PortalCase)
    target_kind = OrganizationCustomField.Target.CASE if is_case else OrganizationCustomField.Target.PERSON
    if getattr(target, "organization_id", None) != organization.id:
        raise PortalError("That target is not in this organization.")

    fields_by_key = {
        f.key: f for f in OrganizationCustomField.objects.filter(
            organization=organization, target=target_kind, is_active=True)
    }
    changed = []
    for key, raw in (values or {}).items():
        field = fields_by_key.get(key)
        if field is None:
            # Unknown or archived field key — skip (archived fields take no new values).
            continue
        cleaned = validate_custom_field_value(field, raw)
        if cleaned is None and field.required:
            raise PortalError(f"'{field.label}' is required.")
        lookup = {"field": field, "case": target} if is_case else {"field": field, "person": target}
        obj, created = OrganizationCustomFieldValue.objects.get_or_create(
            defaults={"organization": organization, "value": cleaned, "updated_by": user},
            **lookup,
        )
        if not created:
            obj.value = cleaned
            obj.updated_by = user
            obj.save(update_fields=["value", "updated_by", "updated_at"])
        changed.append(key)

    if changed:
        meta = {"changed_field_keys": changed[:25], "result": "ok"}
        if is_case:
            meta["case_id"] = target.id
        else:
            meta["person_id"] = target.id
        # PRIVACY: audit records WHICH keys changed, never the values themselves.
        _audit(organization, user, "organization_custom_field_value_updated",
               obj=target, metadata=meta)
    return changed


def build_custom_field_values_payload(target) -> dict:
    """{field_key: value} for a person/case (active fields only)."""
    rows = target.custom_field_values.select_related("field").all()
    return {r.field.key: r.value for r in rows if r.field.is_active}


def build_custom_field_schema(organization, target_kind: str) -> list[dict]:
    qs = OrganizationCustomField.objects.filter(
        organization=organization, target=target_kind, is_active=True)
    return [build_custom_field_payload(f) for f in qs]


def build_custom_field_payload(field) -> dict:
    return {
        "id": field.id, "key": field.key, "label": field.label,
        "description": field.description, "target": field.target,
        "field_type": field.field_type, "options": field.options or [],
        "required": field.required, "visibility": field.visibility,
        "sort_order": field.sort_order, "is_active": field.is_active,
    }


# ---- Custom case statuses ---------------------------------------------------


def create_case_status_definition(organization, user, payload: dict) -> OrganizationCaseStatusDefinition:
    label = (payload.get("label") or "").strip()
    if not label:
        raise PortalError("A status label is required.")
    category = _choice(payload.get("category"), OrganizationCaseStatusDefinition.Category, None)
    if category is None:
        raise PortalError("A valid status category is required.")
    _enforce_cap(organization, "statuses",
                 OrganizationCaseStatusDefinition.objects.filter(organization=organization, is_active=True))
    key = _unique_status_key(organization, payload.get("key") or label)
    status = OrganizationCaseStatusDefinition.objects.create(
        organization=organization, key=key, label=label[:120],
        description=(payload.get("description") or "").strip()[:255],
        category=category, color=(payload.get("color") or "").strip()[:20],
        icon=(payload.get("icon") or "").strip()[:40],
        sort_order=_int(payload.get("sort_order")),
        is_default=_truthy(payload.get("is_default")),
        is_terminal=_truthy(payload.get("is_terminal")),
        maps_to_system_status=_choice(payload.get("maps_to_system_status"),
                                      OrganizationCaseStatusDefinition.SystemStatus, ""),
        created_by=user,
    )
    if status.is_default:
        _clear_other_defaults(organization, status)
    _audit(organization, user, "organization_case_status_created", obj=status,
           metadata={"status_id": status.id, "status_key": status.key,
                     "status_label": status.label, "result": status.category})
    return status


def update_case_status_definition(status, user, payload: dict) -> OrganizationCaseStatusDefinition:
    fields = []
    for attr, key, maxlen in (("label", "label", 120), ("description", "description", 255),
                              ("color", "color", 20), ("icon", "icon", 40)):
        if key in payload:
            setattr(status, attr, (payload.get(key) or "").strip()[:maxlen])
            fields.append(attr)
    if "category" in payload:
        status.category = _choice(payload.get("category"),
                                  OrganizationCaseStatusDefinition.Category, status.category)
        fields.append("category")
    if "maps_to_system_status" in payload:
        status.maps_to_system_status = _choice(
            payload.get("maps_to_system_status"),
            OrganizationCaseStatusDefinition.SystemStatus, status.maps_to_system_status)
        fields.append("maps_to_system_status")
    for attr in ("sort_order",):
        if attr in payload:
            status.sort_order = _int(payload.get(attr))
            fields.append(attr)
    for attr in ("is_terminal", "is_default"):
        if attr in payload:
            setattr(status, attr, _truthy(payload.get(attr)))
            fields.append(attr)
    if not status.label.strip():
        raise PortalError("A status label is required.")
    if fields:
        fields.append("updated_at")
        status.save(update_fields=fields)
    if status.is_default:
        _clear_other_defaults(status.organization, status)
    _audit(status.organization, user, "organization_case_status_updated", obj=status,
           metadata={"status_id": status.id, "status_key": status.key})
    return status


def archive_case_status_definition(status, user) -> OrganizationCaseStatusDefinition:
    if status.is_active:
        status.is_active = False
        status.is_default = False
        status.save(update_fields=["is_active", "is_default", "updated_at"])
        _audit(status.organization, user, "organization_case_status_archived", obj=status,
               metadata={"status_id": status.id, "status_key": status.key})
    return status


def set_case_custom_status(case, status_def, user) -> PortalCase:
    """Set a case's custom status AND keep the fixed system ``status`` in sync from
    the custom status's category (so dashboards/reminders/review stay correct)."""
    from .portals import update_portal_case_status

    if status_def is not None and status_def.organization_id != case.organization_id:
        raise PortalError("That status is not in this organization.")
    case.custom_status = status_def
    case.save(update_fields=["custom_status", "updated_at"])
    if status_def is not None:
        system_status = _CATEGORY_TO_SYSTEM.get(status_def.category)
        if system_status and system_status != case.status:
            update_portal_case_status(case, user, system_status)
    _audit(case.organization, user, "portal_case_custom_status_updated", obj=case,
           metadata={"case_id": case.id,
                     "status_id": status_def.id if status_def else "",
                     "status_key": status_def.key if status_def else "",
                     "result": case.status})
    return case


def seed_default_case_statuses(organization, user=None) -> list[OrganizationCaseStatusDefinition]:
    """Seed the org's default custom statuses (mirroring the system workflow). Idempotent."""
    created = []
    for i, (key, label, category, system, terminal, default) in enumerate(_DEFAULT_STATUSES):
        obj, was_created = OrganizationCaseStatusDefinition.objects.get_or_create(
            organization=organization, key=key,
            defaults={"label": label, "category": category, "sort_order": i,
                      "maps_to_system_status": system, "is_terminal": terminal,
                      "is_default": default, "created_by": user},
        )
        if was_created:
            created.append(obj)
    if created:
        _audit(organization, user, "default_case_statuses_seeded", obj=organization,
               metadata={"result": str(len(created))})
    return created


def build_case_status_payload(status) -> dict:
    return {
        "id": status.id, "key": status.key, "label": status.label,
        "description": status.description, "category": status.category,
        "color": status.color, "icon": status.icon, "sort_order": status.sort_order,
        "is_default": status.is_default, "is_terminal": status.is_terminal,
        "is_active": status.is_active, "maps_to_system_status": status.maps_to_system_status,
    }


# ---- Helpers ----------------------------------------------------------------


def _clear_other_defaults(organization, status):
    OrganizationCaseStatusDefinition.objects.filter(
        organization=organization, is_default=True
    ).exclude(pk=status.pk).update(is_default=False)


def _validate_options(organization, field_type, options):
    if field_type not in (_FieldType.SINGLE_SELECT, _FieldType.MULTI_SELECT):
        return []
    if not isinstance(options, (list, tuple)):
        return []
    cap = _caps(organization).get("options")
    out = []
    seen = set()
    for i, opt in enumerate(options):
        if isinstance(opt, str):
            opt = {"key": slugify(opt)[:60], "label": opt}
        if not isinstance(opt, dict):
            continue
        label = (opt.get("label") or "").strip()
        key = slugify(opt.get("key") or label)[:60]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({"key": key, "label": label[:120] or key,
                    "color": (opt.get("color") or "").strip()[:20],
                    "sort_order": _int(opt.get("sort_order")) or i})
        if cap is not None and len(out) >= cap:
            break
    return out


def _option_keys(field) -> set:
    return {o.get("key") for o in (field.options or []) if isinstance(o, dict)}


def _unique_field_key(organization, target, raw):
    base = slugify(raw)[:70] or "field"
    key = base
    n = 2
    while OrganizationCustomField.objects.filter(
        organization=organization, target=target, key=key
    ).exists():
        key = f"{base[:74]}_{n}"
        n += 1
    return key


def _unique_status_key(organization, raw):
    base = slugify(raw)[:70] or "status"
    key = base
    n = 2
    while OrganizationCaseStatusDefinition.objects.filter(
        organization=organization, key=key
    ).exists():
        key = f"{base[:74]}_{n}"
        n += 1
    return key


def _audit(organization, user, event_type, *, obj=None, metadata=None):
    meta = dict(metadata or {})
    record_portal_audit_event(organization, user, event_type, obj=obj,
                              object_label=getattr(obj, "label", None) or getattr(obj, "title", None),
                              metadata=meta)


def _choice(value, choices_cls, default):
    value = (value or "").strip().lower() if isinstance(value, str) else value
    return value if value in choices_cls.values else default


def _int(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")
