"""
Teams Plan + Portal Limits V1 — ORGANIZATION-level entitlements for B2B portals.

Portal resources (people, cases, document requests, sharing rooms, member seats)
are governed by the ORGANIZATION's plan, not by whichever staff member clicked the
button. An organization's entitlement lives in ``OrganizationPlanProfile``; the
numeric caps come from the central ``ORG_PORTAL_PLAN_LIMITS`` table below (easy to
change in one place), with optional per-org overrides on the profile.

Deterministic — no AI. No Stripe changes: a profile is activated by a founder/beta
management command, not by live checkout. Errors use a clear org-level shape
(``organization_plan_limit_exceeded`` / ``portal_not_enabled``) distinct from the
personal ``plan_limit_exceeded``.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException

from .models import (
    OrganizationMembership,
    OrganizationPlanProfile,
    PortalCase,
    PortalPerson,
)

# Central org-level limit table. ``None`` = unlimited (mirrors the user-plan
# convention). Change numbers HERE — nothing else hardcodes them.
ORG_PORTAL_PLAN_LIMITS: dict[str, dict] = {
    "free": {
        "portal_enabled": False,
        "max_members": 3, "max_portal_people": 0, "max_active_portal_cases": 0,
        "max_active_document_requests": 0, "max_active_sharing_rooms": 0,
    },
    "pro": {
        "portal_enabled": False,
        "max_members": 5, "max_portal_people": 0, "max_active_portal_cases": 0,
        "max_active_document_requests": 0, "max_active_sharing_rooms": 0,
    },
    "teams_beta": {
        "portal_enabled": True,
        "max_members": 5, "max_portal_people": 100, "max_active_portal_cases": 50,
        "max_active_document_requests": 200, "max_active_sharing_rooms": 50,
    },
    "teams": {
        "portal_enabled": True,
        "max_members": 10, "max_portal_people": 500, "max_active_portal_cases": 250,
        "max_active_document_requests": 1000, "max_active_sharing_rooms": 250,
    },
    "enterprise": {
        "portal_enabled": True,
        "max_members": None, "max_portal_people": None, "max_active_portal_cases": None,
        "max_active_document_requests": None, "max_active_sharing_rooms": None,
    },
}

# resource key -> (limit field on the table, override field on the profile)
_RESOURCES = {
    "members": ("max_members", "max_members"),
    "portal_people": ("max_portal_people", "max_portal_people"),
    "active_portal_cases": ("max_active_portal_cases", "max_active_portal_cases"),
    "active_document_requests": ("max_active_document_requests", "max_active_document_requests"),
    "active_sharing_rooms": ("max_active_sharing_rooms", "max_active_sharing_rooms"),
}

_RESOURCE_LABELS = {
    "members": "member seats",
    "portal_people": "portal people",
    "active_portal_cases": "active cases",
    "active_document_requests": "active document requests",
    "active_sharing_rooms": "active sharing rooms",
}

_DEFAULT_PLAN = "free"


# ---- Exceptions -------------------------------------------------------------


class OrganizationPlanLimitExceeded(APIException):
    """403 — the ORGANIZATION reached an org-level portal limit (distinct from the
    personal ``plan_limit_exceeded``)."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "organization_plan_limit_exceeded"

    def __init__(self, *, resource: str, limit: int, used: int, plan: str):
        label = _RESOURCE_LABELS.get(resource, resource)
        super().__init__(
            detail={
                "code": self.default_code,
                "resource": resource,
                "limit": limit,
                "used": used,
                "plan": plan,
                "message": f"This organization has reached its {label} limit.",
            },
            code=self.default_code,
        )


class PortalNotEnabled(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "portal_not_enabled"
    default_detail = {
        "code": "portal_not_enabled",
        "message": "B2B Portals are not enabled for this organization. "
                   "Portals are available on Teams.",
    }


# ---- Entitlement + limits ---------------------------------------------------


def get_organization_entitlement(organization) -> OrganizationPlanProfile | None:
    return getattr(organization, "plan_profile", None)


def _plan_for(organization) -> str:
    profile = get_organization_entitlement(organization)
    if profile is None:
        return _DEFAULT_PLAN
    return profile.plan if profile.plan in ORG_PORTAL_PLAN_LIMITS else _DEFAULT_PLAN


def get_organization_portal_limits(organization) -> dict:
    """Effective org limits (per-org override wins; else the plan default; ``None``
    = unlimited)."""
    profile = get_organization_entitlement(organization)
    plan = _plan_for(organization)
    defaults = ORG_PORTAL_PLAN_LIMITS[plan]
    limits = {}
    for resource, (table_field, override_field) in _RESOURCES.items():
        override = getattr(profile, override_field, None) if profile else None
        limits[resource] = override if override is not None else defaults[table_field]
    return limits


def is_teams_portal_enabled(organization) -> bool:
    """Whether the organization's entitlement currently allows portal usage."""
    profile = get_organization_entitlement(organization)
    if profile is None:
        return False
    if profile.status not in (
        OrganizationPlanProfile.Status.ACTIVE, OrganizationPlanProfile.Status.TRIALING
    ):
        return False
    return bool(profile.portal_enabled)


# ---- Usage ------------------------------------------------------------------


def get_organization_portal_usage(organization) -> dict:
    """Org-wide counts. Only portal-linked active primitives are counted — never
    unrelated personal rooms/requests."""
    from apps.documents.models import DocumentRequestLink, SharingRoom

    members = OrganizationMembership.objects.filter(
        organization=organization, status=OrganizationMembership.Status.ACTIVE
    ).count()
    people = PortalPerson.objects.filter(organization=organization).exclude(
        status=PortalPerson.Status.ARCHIVED
    ).count()
    cases = PortalCase.objects.filter(
        organization=organization, status__in=PortalCase.ACTIVE_STATUSES
    ).count()
    requests = DocumentRequestLink.objects.filter(
        portal_case_links__case__organization=organization,
        status__in=DocumentRequestLink.ACTIVE_STATUSES,
    ).distinct().count()
    rooms = SharingRoom.objects.filter(
        portal_cases__organization=organization,
        status__in=SharingRoom.ACTIVE_STATUSES,
    ).distinct().count()
    return {
        "members": members,
        "portal_people": people,
        "active_portal_cases": cases,
        "active_document_requests": requests,
        "active_sharing_rooms": rooms,
    }


# ---- Gates + enforcement ----------------------------------------------------


def enforce_portal_enabled(organization) -> None:
    """Raise ``PortalNotEnabled`` if the org's entitlement does not allow portals.
    (The ``b2b_portals`` feature flag is enforced separately, in the view, for beta
    exposure — this gate governs the org's actual entitlement.)"""
    if not is_teams_portal_enabled(organization):
        raise PortalNotEnabled()


def enforce_organization_portal_limit(organization, resource: str, amount: int = 1) -> None:
    """Raise ``OrganizationPlanLimitExceeded`` if creating ``amount`` more of
    ``resource`` would exceed the org limit. A ``None`` limit means unlimited."""
    if resource not in _RESOURCES:
        return
    limit = get_organization_portal_limits(organization).get(resource)
    if limit is None:
        return
    used = get_organization_portal_usage(organization).get(resource, 0)
    if used + amount > limit:
        record_org_plan_audit_event(
            organization, "organization_portal_limit_reached",
            metadata={"resource": resource, "limit": limit, "used": used},
            severity="warning",
        )
        raise OrganizationPlanLimitExceeded(
            resource=resource, limit=limit, used=used, plan=_plan_for(organization)
        )


def enforce_organization_seat_limit(organization) -> None:
    """Enforce the org member-seat limit when the org is on a Teams plan. Counts
    active members + pending invites so an org can't over-invite past its seats.
    A no-op for orgs without a Teams entitlement (their existing personal member
    limit still applies)."""
    if not is_teams_portal_enabled(organization):
        return
    limit = get_organization_portal_limits(organization).get("members")
    if limit is None:
        return
    from .models import OrganizationInvite

    active = OrganizationMembership.objects.filter(
        organization=organization, status=OrganizationMembership.Status.ACTIVE
    ).count()
    pending = OrganizationInvite.objects.filter(
        organization=organization, status=OrganizationInvite.Status.PENDING
    ).count()
    if active + pending >= limit:
        record_org_plan_audit_event(
            organization, "organization_portal_limit_reached",
            metadata={"resource": "members", "limit": limit, "used": active + pending},
            severity="warning",
        )
        raise OrganizationPlanLimitExceeded(
            resource="members", limit=limit, used=active + pending, plan=_plan_for(organization)
        )


def build_organization_limit_payload(organization) -> dict:
    limits = get_organization_portal_limits(organization)
    usage = get_organization_portal_usage(organization)
    remaining = {
        k: (None if limits[k] is None else max(limits[k] - usage.get(k, 0), 0))
        for k in limits
    }
    return {
        "plan": _plan_for(organization),
        "portal_enabled": is_teams_portal_enabled(organization),
        "limits": limits,
        "usage": usage,
        "remaining": remaining,
    }


# ---- Plan management + audit ------------------------------------------------


def set_organization_plan(organization, *, plan: str, portal_enabled: bool | None = None,
                          status_value: str | None = None, actor=None) -> OrganizationPlanProfile:
    """Create/update an org's plan profile (used by the founder management command).
    Records an audit event. Does NOT touch Stripe."""
    if plan not in ORG_PORTAL_PLAN_LIMITS:
        raise ValueError(f"Unknown org plan: {plan}")
    profile, created = OrganizationPlanProfile.objects.get_or_create(
        organization=organization
    )
    previous_plan = profile.plan
    previous_enabled = profile.portal_enabled
    profile.plan = plan
    if portal_enabled is None:
        # Default the toggle from the plan's table value on first set.
        profile.portal_enabled = bool(ORG_PORTAL_PLAN_LIMITS[plan]["portal_enabled"])
    else:
        profile.portal_enabled = bool(portal_enabled)
    if status_value:
        profile.status = status_value
    profile.save()

    if created:
        record_org_plan_audit_event(organization, "organization_plan_profile_created",
                                    metadata={"plan": plan}, actor=actor)
    if previous_plan != profile.plan:
        record_org_plan_audit_event(
            organization, "organization_plan_changed",
            metadata={"status_from": previous_plan, "status_to": profile.plan}, actor=actor,
        )
    if previous_enabled != profile.portal_enabled:
        event = ("organization_portal_enabled" if profile.portal_enabled
                 else "organization_portal_disabled")
        record_org_plan_audit_event(organization, event, actor=actor)
    return profile


def record_org_plan_audit_event(organization, event_type, *, metadata=None, actor=None,
                                severity="info"):
    """Record an org-plan/limit audit event in the unified Audit Log (best-effort).
    Owner = the org owner user; never stores secrets/tokens/URLs."""
    try:
        from apps.documents.audit import record_audit_event

        from .portals import _org_owner_user

        owner = _org_owner_user(organization)
        if owner is None:
            return None
        meta = dict(metadata or {})
        meta["org_id"] = organization.id
        return record_audit_event(
            owner, event_type, "system",
            actor_user=actor if getattr(actor, "is_authenticated", False) else None,
            object_type="Organization", object_id=organization.id,
            object_label=organization.name, metadata=meta, severity=severity,
        )
    except Exception:  # noqa: BLE001 — audit must never break the action
        return None
