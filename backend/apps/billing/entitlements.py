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

from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from .models import (
    FeatureUsageCounter,
    ManualAccessGrant,
    Plan,
    PlanEntitlement,
    UserSubscription,
)


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


# ---- Metered usage (per-period counters) -----------------------------------


class FeatureLimitExceeded(APIException):
    """
    Raised when a metered feature is over its plan limit. Uses the same
    ``plan_limit_exceeded`` code/shape as documents.PlanLimitExceeded so the
    frontend's global upgrade paywall picks it up automatically.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "plan_limit_exceeded"

    def __init__(self, feature_key: str, limit: int):
        nice = feature_key.replace("_", " ")
        super().__init__(
            detail={
                "detail": (
                    f"You've reached your plan limit for {nice}. "
                    "Upgrade to Pro for more."
                ),
                "code": self.default_code,
                "resource": feature_key,
                "limit": limit,
            },
            code=self.default_code,
        )


def _period_key(period: str, now=None) -> str:
    now = now or timezone.now()
    if period == "month":
        return now.strftime("%Y-%m")
    if period == "day":
        return now.strftime("%Y-%m-%d")
    return "total"


def _entitlement(user, feature_key: str):
    return get_user_entitlements(user).get(feature_key)


def get_usage_count(user, feature_key: str) -> int:
    ent = _entitlement(user, feature_key)
    period = ent["period"] if ent else "month"
    row = FeatureUsageCounter.objects.filter(
        user=user, feature_key=feature_key, period_key=_period_key(period)
    ).first()
    return row.count if row else 0


def check_usage_limit(user, feature_key: str) -> dict:
    """Return {allowed, limit, used, remaining, unlimited} for a metered feature."""
    ent = _entitlement(user, feature_key)
    # Feature disabled on this plan -> blocked. Missing entitlement -> allow
    # (feature not metered for this plan).
    if ent is None:
        return {"allowed": True, "limit": None, "used": 0, "remaining": None, "unlimited": True}
    if not ent["enabled"]:
        return {"allowed": False, "limit": 0, "used": 0, "remaining": 0, "unlimited": False}
    limit = ent["limit"]
    if limit is None:
        return {"allowed": True, "limit": None, "used": 0, "remaining": None, "unlimited": True}
    used = get_usage_count(user, feature_key)
    return {
        "allowed": used < limit,
        "limit": limit,
        "used": used,
        "remaining": max(limit - used, 0),
        "unlimited": False,
    }


def enforce_feature_usage(user, feature_key: str) -> None:
    """Raise FeatureLimitExceeded if the user is at/over a metered feature limit."""
    result = check_usage_limit(user, feature_key)
    if not result["allowed"]:
        raise FeatureLimitExceeded(feature_key, result["limit"] or 0)


def increment_usage(user, feature_key: str, amount: int = 1) -> None:
    """Bump the current-period counter (no-op-safe for unlimited features)."""
    ent = _entitlement(user, feature_key)
    period = ent["period"] if ent else "month"
    row, created = FeatureUsageCounter.objects.get_or_create(
        user=user,
        feature_key=feature_key,
        period_key=_period_key(period),
        defaults={"count": amount},
    )
    if not created:
        FeatureUsageCounter.objects.filter(pk=row.pk).update(count=F("count") + amount)
