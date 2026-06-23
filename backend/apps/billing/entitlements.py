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


# ---- AI plan entitlements (constants prepared for backend/ai-plan-gating) ---
#
# These are PRODUCT entitlements (per-plan AI allowances). They sit ALONGSIDE the
# infrastructure AI budget guard (settings.AI_DAILY_TOKEN_CAP_* /
# AI_MONTHLY_COST_LIMIT_USD), never replacing it: the budget guard protects spend
# globally; these cap what each plan can do. Seeded in migration 0010.

AI_ACTIONS_PER_DAY = "ai_actions_per_day"
AI_INDEXED_DOCUMENTS = "ai_indexed_documents"

# Map a short AI feature name -> the per-plan boolean entitlement flag.
_AI_FEATURE_FLAGS = {
    "multi_document_qa": "multi_document_qa_enabled",
    "document_drafting": "document_drafting_enabled",
    "pack_copilot": "pack_copilot_enabled",
    "readiness": "readiness_enabled",
}


def get_plan_limits(user) -> dict:
    """A compact snapshot of the user's effective plan entitlements (UI/diagnostics)."""
    return get_user_entitlements(user)


def remaining_ai_actions_today(user):
    """Remaining AI actions allowed on the user's plan today (None = unlimited)."""
    return check_usage_limit(user, AI_ACTIONS_PER_DAY)["remaining"]


def can_use_ai_feature(user, feature: str) -> bool:
    """
    Whether the user's plan allows an AI feature right now.

    A named premium feature (``multi_document_qa`` / ``document_drafting`` /
    ``pack_copilot`` / ``readiness``) checks the plan flag; any other value is
    treated as a generic AI action and checked against the per-day plan cap.
    Pairs with — never replaces — the infrastructure AI budget guard.
    """
    flag = _AI_FEATURE_FLAGS.get(feature)
    if flag is not None:
        return has_feature(user, flag)
    return check_usage_limit(user, AI_ACTIONS_PER_DAY)["allowed"]


def can_index_document_for_ai(user) -> bool:
    """
    Whether the user can index ANOTHER document for AI under their plan's
    ``ai_indexed_documents`` cap (None = unlimited). Counts the distinct
    documents that already have chunks for this user. Never hard-blocks on a
    counting error — the gating branch refines enforcement.
    """
    limit = get_feature_limit(user, AI_INDEXED_DOCUMENTS)
    if limit is None:
        return True  # unlimited
    if not limit:
        return False  # feature disabled / zero allowance on this plan
    try:
        from apps.documents.models import DocumentChunk

        indexed = (
            DocumentChunk.objects.filter(owner=user)
            .values("document_id")
            .distinct()
            .count()
        )
    except Exception:  # noqa: BLE001 — never block on a counting hiccup
        return True
    return indexed < limit


# ---- Scanner plan rules ----------------------------------------------------
#
# The scanner stays mostly FREE (acquisition/trust). Free is bounded by vault
# limits (documents/storage), NOT a scan count. Pro unlocks larger multi-page
# scans, HD export, and advanced enhancement. Keys seeded in migration 0011.

SCANNER_MAX_PAGES = "scanner_max_pages_per_pdf"
SCANNER_HD_EXPORT = "scanner_hd_export"
SCANNER_ADVANCED_ENHANCEMENT = "scanner_advanced_enhancement"


def scanner_max_pages(user):
    """
    Max pages per scanned PDF for the user's plan, or ``None`` for unlimited.

    Fails OPEN: a missing/disabled entitlement returns ``None`` (no gate) so a
    config gap can never accidentally block scanning.
    """
    ent = _entitlement(user, SCANNER_MAX_PAGES)
    if not ent or not ent["enabled"]:
        return None
    return ent["limit"]  # None = unlimited


def can_use_scanner_hd(user) -> bool:
    """Whether the user's plan includes HD PDF export from the scanner."""
    return has_feature(user, SCANNER_HD_EXPORT)


def can_use_scanner_advanced_enhancement(user) -> bool:
    """Whether the user's plan includes advanced scanner enhancement."""
    return has_feature(user, SCANNER_ADVANCED_ENHANCEMENT)
