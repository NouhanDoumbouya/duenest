"""
Plan usage measurement and free-tier limit enforcement.

Counting lives here (next to the document models it measures) while the plan
*definitions* live in ``apps.users.plans``. Ownership is always enforced: every
count is scoped to a single user, so usage and limits never leak across
accounts.
"""

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.users import plans

from .models import (
    Document,
    DocumentBundle,
    DocumentFile,
    DocumentFileShareLink,
    DocumentReminderRule,
    EmergencyAccessPack,
)


class PlanLimitExceeded(APIException):
    """Raised when a create would exceed the user's plan limit (HTTP 403)."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "plan_limit_exceeded"

    def __init__(self, resource: str, limit: int, plan: str):
        label = plans.RESOURCE_LABELS.get(resource, resource)
        detail = {
            "detail": (
                f"You've reached the {plans.PLAN_LABELS.get(plan, plan)} plan "
                f"limit of {limit} {label}. Remove some or upgrade to add more."
            ),
            "code": self.default_code,
            "resource": resource,
            "limit": limit,
            "plan": plan,
        }
        super().__init__(detail=detail, code=self.default_code)


def _active_share_links(user):
    now = timezone.now()
    return DocumentFileShareLink.objects.filter(
        owner=user, revoked_at__isnull=True, expires_at__gt=now
    )


def count_resource(user, resource: str) -> int:
    """Current owner-scoped count for a tracked resource."""
    if resource == plans.RESOURCE_DOCUMENTS:
        return Document.objects.filter(owner=user, is_trashed=False).count()
    if resource == plans.RESOURCE_FILES:
        return DocumentFile.objects.filter(
            document__owner=user, is_trashed=False
        ).count()
    if resource == plans.RESOURCE_BUNDLES:
        return DocumentBundle.objects.filter(owner=user).count()
    if resource == plans.RESOURCE_REMINDERS:
        return DocumentReminderRule.objects.filter(owner=user).count()
    if resource == plans.RESOURCE_SHARE_LINKS:
        return _active_share_links(user).count()
    if resource == plans.RESOURCE_EMERGENCY_PACKS:
        return EmergencyAccessPack.objects.filter(owner=user).count()
    if resource == plans.RESOURCE_SUBSCRIPTIONS:
        # Lazy import keeps the documents app independent of the subscriptions
        # app at load time (no import cycle).
        from apps.subscriptions.models import Subscription

        return Subscription.objects.filter(owner=user, is_archived=False).count()
    if resource in {
        plans.RESOURCE_ORGANIZATIONS,
        plans.RESOURCE_ORGANIZATION_DOCUMENTS,
        plans.RESOURCE_ORGANIZATION_MEMBERS,
        plans.RESOURCE_ORGANIZATION_REQUESTS,
        plans.RESOURCE_ORGANIZATION_CAMPAIGNS,
        plans.RESOURCE_ORGANIZATION_ROOMS,
    }:
        from apps.organizations.models import (
            DocumentCollectionCampaign,
            DocumentRequest,
            Organization,
            OrganizationDocument,
            OrganizationInvite,
            OrganizationMembership,
            OrganizationSecureRoom,
        )

        owned_orgs = Organization.objects.filter(created_by=user, archived_at__isnull=True)
        if resource == plans.RESOURCE_ORGANIZATIONS:
            return owned_orgs.count()
        if resource == plans.RESOURCE_ORGANIZATION_DOCUMENTS:
            return OrganizationDocument.objects.filter(
                organization__in=owned_orgs,
                is_archived=False,
            ).count()
        if resource == plans.RESOURCE_ORGANIZATION_MEMBERS:
            active_members = OrganizationMembership.objects.filter(
                organization__in=owned_orgs,
                status=OrganizationMembership.Status.ACTIVE,
            ).count()
            pending_invites = OrganizationInvite.objects.filter(
                organization__in=owned_orgs,
                status=OrganizationInvite.Status.PENDING,
            ).count()
            return active_members + pending_invites
        if resource == plans.RESOURCE_ORGANIZATION_REQUESTS:
            return DocumentRequest.objects.filter(organization__in=owned_orgs).count()
        if resource == plans.RESOURCE_ORGANIZATION_CAMPAIGNS:
            return DocumentCollectionCampaign.objects.filter(
                organization__in=owned_orgs
            ).count()
        if resource == plans.RESOURCE_ORGANIZATION_ROOMS:
            return OrganizationSecureRoom.objects.filter(organization__in=owned_orgs).count()
    return 0


def _storage_bytes(user) -> int:
    total = DocumentFile.objects.filter(
        document__owner=user, is_trashed=False
    ).aggregate(total=Sum("file_size"))["total"]
    return int(total or 0)


def enforce_plan_limit(user, resource: str) -> None:
    """
    Raise :class:`PlanLimitExceeded` if creating another ``resource`` would put
    the user over their plan limit. A ``None`` limit (e.g. the pro placeholder)
    means unlimited and is always allowed.
    """
    limit = plans.get_limit(user.plan, resource)
    if limit is None:
        return
    if count_resource(user, resource) >= limit:
        raise PlanLimitExceeded(resource=resource, limit=limit, plan=user.plan)


def _resource_usage(user, resource: str, limit) -> dict:
    used = count_resource(user, resource)
    remaining = None if limit is None else max(limit - used, 0)
    return {
        "resource": resource,
        "label": plans.RESOURCE_LABELS.get(resource, resource),
        "used": used,
        "limit": limit,
        "remaining": remaining,
        "at_limit": limit is not None and used >= limit,
        "unlimited": limit is None,
    }


def compute_plan_usage(user) -> dict:
    """
    Build the full plan + usage snapshot for a user. Read-only; safe to call on
    every dashboard load.
    """
    plan = plans.normalize_plan(user.plan)
    limits = plans.get_plan_limits(plan)

    resources = {
        resource: _resource_usage(user, resource, limits.get(resource))
        for resource in plans.ENFORCED_RESOURCES
    }

    storage_limit = limits.get("storage_bytes")
    storage_used = _storage_bytes(user)

    return {
        "plan": plan,
        "plan_label": plans.PLAN_LABELS.get(plan, plan),
        "is_free": plan == plans.PLAN_FREE,
        "resources": resources,
        "storage": {
            "used_bytes": storage_used,
            "limit_bytes": storage_limit,
            "remaining_bytes": (
                None
                if storage_limit is None
                else max(storage_limit - storage_used, 0)
            ),
            "unlimited": storage_limit is None,
        },
    }
