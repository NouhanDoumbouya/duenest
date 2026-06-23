"""
Align plans to CertaNest's launch pricing + prepare AI plan entitlements.

* Pro is USD $7.99/mo ($79/yr). (Was $5.99/$59.)
* Teams (the ``organization`` plan) and the new ``family`` plan are **coming
  soon** — public (shown on pricing) but NOT self-serve purchasable
  (``is_active=False``; ``_get_purchasable_plan`` enforces that server-side).
* AI plan limits are seeded as entitlement constants for the upcoming
  ``backend/ai-plan-gating`` branch — Free 3 AI actions/day + 3 indexed docs;
  Pro 30/day + 300 indexed docs; premium AI flags off on Free, on for Pro. These
  are PRODUCT entitlements and sit alongside (never replace) the infrastructure
  AI budget guard (AI_DAILY_TOKEN_CAP_* / AI_MONTHLY_COST_LIMIT_USD).

Data migration only — no schema change. Idempotent and reversible.
"""

from django.db import migrations

AI_FREE_LIMITS = [
    ("ai_actions_per_day", 3, "day"),
    ("ai_indexed_documents", 3, "total"),
]
AI_PRO_LIMITS = [
    ("ai_actions_per_day", 30, "day"),
    ("ai_indexed_documents", 300, "total"),
]
AI_FLAGS = [
    "multi_document_qa_enabled",
    "document_drafting_enabled",
    "pack_copilot_enabled",
    "readiness_enabled",
]


def apply(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    def set_ent(plan, key, value, period, enabled):
        if plan is None:
            return
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=key,
            defaults=dict(limit_value=value, limit_period=period, is_enabled=enabled),
        )

    free = Plan.objects.filter(key="free").first()
    pro = Plan.objects.filter(key="pro").first()
    org = Plan.objects.filter(key="organization").first()

    # 1) Pro USD pricing.
    if pro:
        pro.currency = "usd"
        pro.monthly_price = 799  # $7.99
        pro.yearly_price = 7900  # $79.00
        md = dict(pro.metadata or {})
        md.pop("beta_monthly_price", None)
        md.pop("beta_yearly_price", None)
        pro.metadata = md
        pro.save()

    # 2) Teams (organization): coming soon / contact — not purchasable.
    if org:
        org.is_active = False
        org.is_public = True
        md = dict(org.metadata or {})
        md.update({"coming_soon": True, "cta": "contact"})
        org.metadata = md
        org.save()

    # 3) Family: coming soon — not purchasable yet.
    Plan.objects.update_or_create(
        key="family",
        defaults=dict(
            name="Family",
            description="Shared family vaults and emergency access — coming soon.",
            tier="family",
            is_public=True,
            is_active=False,
            is_recommended=False,
            currency="usd",
            monthly_price=None,
            yearly_price=None,
            sort_order=3,
            metadata={"coming_soon": True, "cta": "waitlist"},
        ),
    )

    # 4) AI plan entitlements (constants for the AI plan-gating branch).
    for key, value, period in AI_FREE_LIMITS:
        set_ent(free, key, value, period, True)
    for flag in AI_FLAGS:
        set_ent(free, flag, None, "total", False)

    for plan in (pro, org):  # Teams inherits Pro's AI allowances
        for key, value, period in AI_PRO_LIMITS:
            set_ent(plan, key, value, period, True)
        for flag in AI_FLAGS:
            set_ent(plan, flag, None, "total", True)


def revert(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    pro = Plan.objects.filter(key="pro").first()
    if pro:
        pro.monthly_price = 599
        pro.yearly_price = 5900
        pro.save()
    org = Plan.objects.filter(key="organization").first()
    if org:
        org.is_active = True
        org.save()
    Plan.objects.filter(key="family").delete()

    ai_keys = [k for k, _v, _p in AI_FREE_LIMITS] + AI_FLAGS
    PlanEntitlement.objects.filter(feature_key__in=ai_keys).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0009_billingemaillog")]
    operations = [migrations.RunPython(apply, revert)]
