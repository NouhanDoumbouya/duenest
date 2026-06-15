"""
Centralized entitlement + plan-resolution service.

Everything that needs to know "what can this user do?" goes through here, so
plan checks are never scattered. It resolves a user's *effective* plan from
(in priority order) an active manual grant, then an active subscription, then
Free — and reads limits/flags from that plan's PlanEntitlement rows.

It also keeps ``User.plan`` (free / pro_placeholder) in sync so the existing
limit enforcement in apps.documents.plan_usage keeps working unchanged.
"""

from __future__ import annotations

from django.utils import timezone

from .models import ManualAccessGrant, Plan, PlanEntitlement, UserSubscription


def _free_plan() -> Plan | None:
    return Plan.objects.filter(key="free").first()


def get_active_manual_grant(user) -> ManualAccessGrant | None:
    """The current (active, in-window) manual grant for a user, if any."""
    now = timezone.now()
    grants = (
        ManualAccessGrant.objects.filter(user=user, is_active=True, starts_at__lte=now)
        .select_related("plan")
        .order_by("-created_at")
    )
    for grant in grants:
        if grant.ends_at is None or now < grant.ends_at:
            return grant
    return None


def get_effective_subscription(user) -> UserSubscription | None:
    """The subscription that currently controls a user's access, if any."""
    subs = (
        UserSubscription.objects.filter(user=user)
        .exclude(status=UserSubscription.Status.FREE)
        .select_related("plan")
        .order_by("-created_at")
    )
    for sub in subs:
        if sub.grants_paid_access:
            return sub
    # No paid sub — return the most recent non-free record (e.g. canceled) for
    # status display, or None.
    return subs.first()


def get_user_plan(user) -> Plan | None:
    """The user's effective billing Plan (manual grant > subscription > Free)."""
    grant = get_active_manual_grant(user)
    if grant:
        return grant.plan
    sub = get_effective_subscription(user)
    if sub and sub.grants_paid_access:
        return sub.plan
    return _free_plan()


def get_user_subscription_status(user) -> str:
    """The user-facing subscription status string."""
    grant = get_active_manual_grant(user)
    if grant:
        return grant.grant_status
    sub = get_effective_subscription(user)
    if sub:
        return sub.status
    return UserSubscription.Status.FREE


def is_pro(user) -> bool:
    """Whether the user currently has paid (Pro-tier or better) access."""
    if get_active_manual_grant(user):
        return True
    sub = get_effective_subscription(user)
    return bool(sub and sub.grants_paid_access)


def get_user_entitlements(user) -> dict:
    """All entitlements for the user's effective plan, keyed by feature_key."""
    plan = get_user_plan(user)
    if plan is None:
        return {}
    out = {}
    for ent in PlanEntitlement.objects.filter(plan=plan):
        out[ent.feature_key] = {
            "enabled": ent.is_enabled,
            "limit": ent.limit_value,  # None = unlimited
            "period": ent.limit_period,
            "unlimited": ent.is_enabled and ent.limit_value is None,
        }
    return out


def has_feature(user, feature_key: str) -> bool:
    """Whether a boolean feature flag is enabled on the user's plan."""
    ent = get_user_entitlements(user).get(feature_key)
    return bool(ent and ent["enabled"])


def get_feature_limit(user, feature_key: str):
    """The numeric limit for a feature (None = unlimited / not limited)."""
    ent = get_user_entitlements(user).get(feature_key)
    if not ent or not ent["enabled"]:
        return 0
    return ent["limit"]


def sync_user_plan(user) -> bool:
    """
    Denormalize the effective tier onto ``User.plan`` so the existing limit
    enforcement (apps.users.plans / apps.documents.plan_usage) stays correct.
    Returns True if the stored value changed.
    """
    from apps.users import plans as user_plans

    target = (
        user_plans.PLAN_PRO_PLACEHOLDER if is_pro(user) else user_plans.PLAN_FREE
    )
    if user.plan != target:
        user.plan = target
        user.save(update_fields=["plan"])
        return True
    return False


def build_upgrade_context(user, feature_key: str) -> dict:
    """A small, UI-friendly payload describing why an upgrade is needed."""
    plan = get_user_plan(user)
    limit = get_feature_limit(user, feature_key)
    return {
        "feature_key": feature_key,
        "current_plan": plan.key if plan else "free",
        "current_plan_name": plan.name if plan else "Free",
        "limit": limit,
        "is_pro": is_pro(user),
        "upgrade_to": "pro",
        "message": (
            "You have reached your plan limit. Upgrade to Pro to add more, "
            "use the full scanner, and unlock secure sharing."
        ),
    }
