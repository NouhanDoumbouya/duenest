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
    """Raised when a create would exceed the user's plan limit (HTTP 403).

    Always carries ``code = "plan_limit_exceeded"`` plus a ``resource``
    discriminator (e.g. ``documents`` / ``files`` / ``storage_bytes`` /
    ``bundles`` / ``reminders``) so the frontend's single global upgrade paywall
    keeps working for every limit. ``message``/``extra`` let storage (which needs
    friendly MB/GB copy + byte counters) customize the payload without a parallel
    error scheme.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "plan_limit_exceeded"

    def __init__(self, resource: str, limit: int, plan: str, *, message=None, extra=None):
        label = plans.RESOURCE_LABELS.get(resource, resource)
        detail = {
            "detail": message or (
                f"You've reached the {plans.PLAN_LABELS.get(plan, plan)} plan "
                f"limit of {limit} {label}. Remove some or upgrade to add more."
            ),
            "code": self.default_code,
            "resource": resource,
            "limit": limit,
            "plan": plan,
        }
        if extra:
            detail.update(extra)
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
            Q(document__owner=user) | Q(document__isnull=True, uploaded_by=user),
            is_trashed=False,
        ).count()
    if resource == plans.RESOURCE_BUNDLES:
        return DocumentBundle.objects.filter(owner=user).count()
    if resource == plans.RESOURCE_REMINDERS:
        # Only ACTIVE reminders count toward the limit: an enabled rule on a
        # live (non-trashed) document. Disabling a rule or trashing its document
        # frees a slot; editing an existing active rule never creates a new one.
        return DocumentReminderRule.objects.filter(
            owner=user, is_enabled=True, document__is_trashed=False
        ).count()
    if resource == plans.RESOURCE_SHARE_LINKS:
        # Active single-file share links plus active Quick Share QR sessions.
        from apps.quick_share.models import QuickShareSession

        now = timezone.now()
        quick = (
            QuickShareSession.objects.filter(
                owner=user, revoked_at__isnull=True, expires_at__gt=now
            )
            .exclude(status=QuickShareSession.Status.CONSUMED)
            .count()
        )
        return _active_share_links(user).count() + quick
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
        Q(document__owner=user) | Q(document__isnull=True, uploaded_by=user),
        is_trashed=False,
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


# ---- Storage quota (a hard product limit; R2 stays private) -----------------
#
# Storage is summed from the stored plaintext ``DocumentFile.file_size`` (set at
# upload), owner-scoped — never by calling R2. It is a PRODUCT limit and is fully
# independent of the Cloudflare R2 bucket, which remains private.


def _fmt_bytes(n) -> str:
    """Friendly size label (e.g. ``100MB`` / ``10GB``) for limit copy."""
    if n is None:
        return "unlimited"
    n = int(n)
    gb = 1024 * 1024 * 1024
    mb = 1024 * 1024
    if n >= gb and n % gb == 0:
        return f"{n // gb}GB"
    if n >= gb:
        return f"{n / gb:.1f}GB"
    if n >= mb:
        return f"{n // mb}MB"
    return f"{max(n // 1024, 0)}KB"


def get_user_storage_used_bytes(user) -> int:
    """Total stored bytes the user currently occupies (owner-scoped)."""
    return _storage_bytes(user)


def get_user_storage_limit_bytes(user):
    """The user's storage limit in bytes, or ``None`` when uncapped."""
    return plans.get_limit(plans.normalize_plan(user.plan), "storage_bytes")


def get_user_storage_remaining_bytes(user):
    """Remaining storage in bytes, or ``None`` when uncapped."""
    limit = get_user_storage_limit_bytes(user)
    if limit is None:
        return None
    return max(int(limit) - get_user_storage_used_bytes(user), 0)


def can_upload_bytes(user, incoming_size) -> bool:
    """Whether an upload of ``incoming_size`` bytes fits the user's storage limit."""
    limit = get_user_storage_limit_bytes(user)
    if limit is None:
        return True
    incoming = max(int(incoming_size or 0), 0)
    return get_user_storage_used_bytes(user) + incoming <= int(limit)


def enforce_storage_limit(user, incoming_size) -> None:
    """
    Raise :class:`PlanLimitExceeded` (resource ``storage_bytes``) if an upload of
    ``incoming_size`` bytes would exceed the user's storage quota. ``None`` limit
    (Pro placeholder edge / uncapped) is always allowed. Never calls R2.
    """
    limit = get_user_storage_limit_bytes(user)
    if limit is None:
        return
    incoming = max(int(incoming_size or 0), 0)
    used = get_user_storage_used_bytes(user)
    if used + incoming > int(limit):
        plan = plans.normalize_plan(user.plan)
        if plan == plans.PLAN_FREE:
            message = (
                f"You've reached your Free storage limit of {_fmt_bytes(limit)}. "
                f"Upgrade to Pro for {_fmt_bytes(plans.PRO_STORAGE_BYTES)}."
            )
        else:
            message = (
                f"This upload would exceed your plan's storage limit of "
                f"{_fmt_bytes(limit)}."
            )
        raise PlanLimitExceeded(
            resource="storage_bytes",
            limit=int(limit),
            plan=plan,
            message=message,
            extra={"used_bytes": used, "incoming_bytes": incoming},
        )


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
