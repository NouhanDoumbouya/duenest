"""
Move AI plan gating from "AI actions per day" to **monthly AI credits**.

Different AI features cost different amounts, so a flat daily action count is the
wrong unit. This seeds:

* ``ai_credits_per_month`` — Free 10, Pro/Teams 200 (monthly period).
* Granular AI feature flags per plan. Free gets only the *basic*, single-document
  features; Pro/Teams get the premium ones too:

    basic (Free + Pro):   ai_document_summary, ai_document_qa,
                          ai_deadline_extraction, ai_reminder_suggestion,
                          ai_document_extraction
    premium (Pro only):   ai_multi_document_qa, ai_document_draft,
                          ai_pack_copilot, ai_readiness_checks,
                          ai_requirement_checklist

The legacy ``ai_actions_per_day`` entitlement (migration 0010) is intentionally
LEFT IN PLACE for backward compatibility but is no longer used for enforcement
(see ``apps.billing.entitlements``). ``ai_indexed_documents`` (Free 3 / Pro 300)
stays as seeded in 0010.

These are PRODUCT entitlements and sit alongside (never replace) the
infrastructure AI budget guard (AI_DAILY_TOKEN_CAP_* / AI_MONTHLY_COST_LIMIT_USD).

Data migration only — no schema change. Idempotent and reversible.
"""

from django.db import migrations

AI_CREDITS_FREE = 10
AI_CREDITS_PRO = 200

# AI feature flags enabled on every AI plan (basic, single-document AI).
AI_BASIC_FLAGS = [
    "ai_document_summary",
    "ai_document_qa",
    "ai_deadline_extraction",
    "ai_reminder_suggestion",
    "ai_document_extraction",
]
# AI feature flags reserved for Pro/Teams (premium / multi-document AI).
AI_PREMIUM_FLAGS = [
    "ai_multi_document_qa",
    "ai_document_draft",
    "ai_pack_copilot",
    "ai_readiness_checks",
    "ai_requirement_checklist",
]

ALL_SEEDED_KEYS = ["ai_credits_per_month", *AI_BASIC_FLAGS, *AI_PREMIUM_FLAGS]


def apply(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    def set_limit(plan, key, value, period, enabled=True):
        if plan is None:
            return
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=key,
            defaults=dict(limit_value=value, limit_period=period, is_enabled=enabled),
        )

    def set_flag(plan, key, enabled):
        if plan is None:
            return
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=enabled),
        )

    free = Plan.objects.filter(key="free").first()
    pro = Plan.objects.filter(key="pro").first()
    org = Plan.objects.filter(key="organization").first()

    # Monthly AI credits.
    set_limit(free, "ai_credits_per_month", AI_CREDITS_FREE, "month")
    for plan in (pro, org):  # Teams inherits Pro's AI allowance
        set_limit(plan, "ai_credits_per_month", AI_CREDITS_PRO, "month")

    # Per-plan AI feature flags.
    for flag in AI_BASIC_FLAGS:
        set_flag(free, flag, True)
    for flag in AI_PREMIUM_FLAGS:
        set_flag(free, flag, False)
    for plan in (pro, org):
        for flag in AI_BASIC_FLAGS + AI_PREMIUM_FLAGS:
            set_flag(plan, flag, True)


def revert(apps, schema_editor):
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    PlanEntitlement.objects.filter(feature_key__in=ALL_SEEDED_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0011_scanner_plan_limits")]
    operations = [migrations.RunPython(apply, revert)]
