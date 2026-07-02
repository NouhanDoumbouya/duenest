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


# ---- AI plan entitlements (monthly AI credits model) -----------------------
#
# These are PRODUCT entitlements (per-plan AI allowances). They sit ALONGSIDE the
# infrastructure AI budget guard (settings.AI_DAILY_TOKEN_CAP_* /
# AI_MONTHLY_COST_LIMIT_USD), never replacing it: the budget guard protects spend
# globally; these cap what each plan can do.
#
# AI is metered in **monthly credits**, not "AI actions per day" — different AI
# features cost different amounts (a single-doc summary is cheap; a multi-document
# Q&A or pack copilot run is much heavier). The monthly allowance lives in the
# ``ai_credits_per_month`` entitlement; consumption is tracked in a
# ``FeatureUsageCounter`` row keyed ``ai_credits`` (monthly period). Seeded in
# migration 0012. The legacy ``ai_actions_per_day`` entitlement (migration 0010)
# is retained for backward compatibility but is NO LONGER used for enforcement.

AI_CREDITS_PER_MONTH = "ai_credits_per_month"  # plan allowance entitlement key
AI_CREDITS_USAGE_KEY = "ai_credits"  # FeatureUsageCounter key (monthly period)
AI_INDEXED_DOCUMENTS = "ai_indexed_documents"

# Legacy (no longer enforced — kept so old data/imports don't break abruptly).
AI_ACTIONS_PER_DAY = "ai_actions_per_day"

# A short, stable AI feature name -> its per-plan boolean entitlement flag.
# Features NOT listed here are treated as "basic" AI (allowed on every plan that
# has AI, still metered by credits). Free has only the basic flags enabled.
AI_FEATURE_PLAN_FLAGS = {
    "document_summary": "ai_document_summary",
    "document_qa": "ai_document_qa",
    "multi_document_qa": "ai_multi_document_qa",
    "deadline_extraction": "ai_deadline_extraction",
    "reminder_suggestion": "ai_reminder_suggestion",
    "document_extraction": "ai_document_extraction",
    "document_draft": "ai_document_draft",
    "pack_copilot": "ai_pack_copilot",
    "share_readiness": "ai_readiness_checks",
    "bundle_readiness": "ai_readiness_checks",
    "requirement_link_checklist": "ai_requirement_checklist",
    "application_document_generation": "ai_application_document_generation",
    "magic_inbox_triage": "ai_magic_inbox",
    # Automation AI reserved for Pro. NOTE: "ai_chat" is deliberately NOT here —
    # the conversational assistant stays available on Free (credit-limited) as an
    # acquisition taste; briefing + intake are the paid "automation" AI.
    "briefing": "ai_briefing",
    "intake": "ai_intake",
}

# Feature-based credit costs. Heavier / multi-document features cost more. An
# unconfigured feature defaults to a safe 1 credit.
DEFAULT_AI_CREDIT_COST = 1
AI_FEATURE_CREDIT_COSTS = {
    "document_summary": 1,
    "document_qa": 1,
    "deadline_extraction": 1,
    "reminder_suggestion": 1,
    "document_extraction": 1,
    "share_readiness": 2,
    "bundle_readiness": 2,
    "pack_copilot": 3,
    "document_draft": 3,
    "requirement_link_checklist": 5,  # future feature
    "magic_inbox_triage": 3,  # smart triage of one intake item (text/file)
    "multi_document_qa": 5,
    "long_application_review": 5,  # future feature
    # Application document generation cost VARIES by document type (email 3 /
    # letter 5 / SOP & CV 8); the generator passes the exact amount to
    # spend_ai_credits(). This default is a safe fallback only.
    "application_document_generation": 8,
}


def get_plan_limits(user) -> dict:
    """A compact snapshot of the user's effective plan entitlements (UI/diagnostics)."""
    return get_user_entitlements(user)


# -- Monthly AI credit accounting --------------------------------------------


def get_ai_credit_limit(user):
    """The user's monthly AI credit allowance (``None`` = unlimited / not capped)."""
    return get_feature_limit(user, AI_CREDITS_PER_MONTH)


def get_ai_credits_used_this_month(user) -> int:
    """AI credits the user has spent in the current calendar month."""
    return get_usage_count(user, AI_CREDITS_USAGE_KEY)  # period defaults to month


def get_ai_credits_remaining(user):
    """Remaining AI credits this month (``None`` when the plan is uncapped)."""
    limit = get_ai_credit_limit(user)
    if limit is None:
        return None
    return max(int(limit) - get_ai_credits_used_this_month(user), 0)


def get_ai_feature_credit_cost(feature: str) -> int:
    """Credit cost for an AI feature (unknown features default to a safe 1)."""
    return int(AI_FEATURE_CREDIT_COSTS.get(feature, DEFAULT_AI_CREDIT_COST))


def can_use_ai_feature(user, feature: str) -> bool:
    """
    Whether the user's *plan* allows an AI feature at all (ignores credit balance).

    Premium features (e.g. ``multi_document_qa``, ``pack_copilot``,
    ``document_draft``) check the plan's boolean flag. Basic features not in
    :data:`AI_FEATURE_PLAN_FLAGS` are always plan-allowed (still credit-metered).
    Pairs with — never replaces — the infrastructure AI budget guard.
    """
    flag = AI_FEATURE_PLAN_FLAGS.get(feature)
    if flag is None:
        return True
    return has_feature(user, flag)


def can_spend_ai_credits(user, feature: str) -> bool:
    """Whether the user has enough monthly AI credits left for ``feature``."""
    remaining = get_ai_credits_remaining(user)
    if remaining is None:
        return True  # uncapped plan
    return remaining >= get_ai_feature_credit_cost(feature)


def spend_ai_credits(user, feature: str, amount: int | None = None) -> int:
    """
    Deduct AI credits for a *successful* feature use and return the amount spent.

    Call this ONLY after the AI action succeeded (so a blocked / failed / refused
    call never costs the user a credit). No-ops for uncapped plans and for a
    zero/negative cost. The current-month counter is bumped atomically.
    """
    if get_ai_credit_limit(user) is None:
        return 0  # uncapped plan: nothing to meter against
    cost = int(amount) if amount is not None else get_ai_feature_credit_cost(feature)
    if cost <= 0:
        return 0
    increment_usage(user, AI_CREDITS_USAGE_KEY, amount=cost)
    return cost


def remaining_ai_actions_today(user):
    """Deprecated: AI is now metered in monthly credits. Kept for compatibility.

    Returns the remaining monthly AI credits (``None`` when uncapped) so any
    lingering caller degrades sensibly instead of reading the retired daily cap.
    """
    return get_ai_credits_remaining(user)


# -- Indexed-document cap -----------------------------------------------------


def can_index_document_for_ai(user) -> bool:
    """
    Whether the user can index ANOTHER document for AI under their plan's
    ``ai_indexed_documents`` cap (None = unlimited). Counts the distinct
    documents that already have chunks for this user. Never hard-blocks on a
    counting error.
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


# -- Friendly gate payloads for AI endpoints ---------------------------------
#
# AI endpoints degrade gracefully (HTTP 200 + ``{available: false, reason: ...}``)
# rather than throwing the 403 ``plan_limit_exceeded`` paywall used by hard CRUD
# limits — so the AI UI can show inline upgrade copy in-flow. These helpers build
# that blocked payload; an endpoint returns it as-is when not None.


def ai_feature_gate(user, feature: str) -> dict | None:
    """
    Return a friendly "blocked" payload when the user's plan/credits disallow
    ``feature``, else ``None`` (clear to proceed). Checked BEFORE any model call,
    so a block never costs a credit.
    """
    if not can_use_ai_feature(user, feature):
        return {
            "available": False,
            "reason": "ai_feature_not_in_plan",
            "message": "This AI feature is available on Pro.",
            "upgrade": True,
        }
    if not can_spend_ai_credits(user, feature):
        pro = is_pro(user)
        if pro:
            message = (
                "You've used your Pro AI credits for this month. "
                "They reset at the start of next month."
            )
        else:
            message = (
                "You've used your Free AI credits for this month. "
                "Upgrade to Pro for 200 AI credits/month."
            )
        return {
            "available": False,
            "reason": "ai_credits_exhausted",
            "message": message,
            "credits": {
                "limit": get_ai_credit_limit(user),
                "used": get_ai_credits_used_this_month(user),
                "remaining": get_ai_credits_remaining(user),
            },
            "upgrade": not pro,
        }
    return None


def ai_index_gate(user) -> dict | None:
    """
    Return a friendly "blocked" payload when the user is at their AI indexing cap,
    else ``None``. Callers should skip this for documents that are already indexed
    (re-indexing must never be blocked by the cap).
    """
    if can_index_document_for_ai(user):
        return None
    limit = get_feature_limit(user, AI_INDEXED_DOCUMENTS)
    pro = is_pro(user)
    if pro:
        message = (
            f"You've reached your plan's AI indexing limit of {limit} documents."
        )
    else:
        message = (
            "Free includes AI indexing for up to 3 documents. "
            "Upgrade to Pro for 300 indexed documents."
        )
    return {
        "available": False,
        "reason": "ai_index_limit_exceeded",
        "message": message,
        "limit": limit,
        "upgrade": not pro,
    }


def ai_call_succeeded(result: dict) -> bool:
    """Whether an AI service result reflects a real, successful model call.

    The AI services share a ``{available, reason, ...}`` contract; a genuine model
    success is ``available=True`` AND ``reason="ok"``. Everything else (budget
    pause, provider error, refusal, not-configured, no-context, validation) is a
    non-success and must NOT be charged a credit.

    A deterministic / no-provider-call path that still answers "ok" (e.g. an
    all-clear briefing with nothing to do) sets ``model_called=False`` to opt out
    of being charged — no real AI value was produced. Results that omit the field
    default to charged, since elsewhere ``reason="ok"`` is only ever returned after
    a successful Claude call.
    """
    return (
        bool(result.get("available"))
        and result.get("reason") == "ok"
        and result.get("model_called", True)
    )


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
