"""
Seed the initial public plans (Free, Pro, Organization) and their entitlements.

Numeric Free limits mirror apps.users.plans.PLAN_LIMITS so the new entitlement
layer never disagrees with the existing enforcement. Prices are USD minor units
and are intentionally editable later via the admin without code changes.
"""

from django.db import migrations

# Free numeric limits — mirror apps.users.plans.PLAN_LIMITS (None = unlimited).
FREE_ENTITLEMENTS = [
    ("documents_limit", 25, "total"),
    ("files_limit", 60, "total"),
    ("bundles_limit", 3, "total"),
    ("reminders_limit", 40, "total"),
    ("quick_shares_active", 5, "total"),
    ("tracked_subscriptions_limit", 10, "total"),
    ("emergency_packs_limit", 1, "total"),
    ("storage_mb", 100, "total"),
    # New metered features (display + future enforcement).
    ("scanner_scans_per_month", 5, "month"),
    ("quick_shares_per_month", 5, "month"),
    ("ocr_pages_per_month", 0, "month"),
]
FREE_FLAGS = [
    ("emergency_protocol_enabled", True),
    ("organizations_enabled", True),  # matches existing free allowance (1 org)
    ("smart_intake_enabled", False),
    ("full_money_radar", False),
    ("priority_features", False),
]

PRO_NUMERIC = [
    "documents_limit",
    "files_limit",
    "bundles_limit",
    "reminders_limit",
    "quick_shares_active",
    "tracked_subscriptions_limit",
    "emergency_packs_limit",
    "storage_mb",
    "scanner_scans_per_month",
    "quick_shares_per_month",
    "ocr_pages_per_month",
]
PRO_FLAGS = [
    "emergency_protocol_enabled",
    "organizations_enabled",
    "smart_intake_enabled",
    "full_money_radar",
    "priority_features",
]


def seed(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    free, _ = Plan.objects.update_or_create(
        key="free",
        defaults=dict(
            name="Free",
            description="Start with the basics.",
            tier="free",
            is_public=True,
            is_active=True,
            is_recommended=False,
            currency="usd",
            monthly_price=0,
            yearly_price=0,
            sort_order=0,
        ),
    )
    pro, _ = Plan.objects.update_or_create(
        key="pro",
        defaults=dict(
            name="Pro",
            description="For serious personal readiness.",
            tier="pro",
            is_public=True,
            is_active=True,
            is_recommended=True,
            currency="usd",
            monthly_price=599,  # $5.99
            yearly_price=5900,  # $59.00
            trial_days=0,
            sort_order=1,
            metadata={"beta_monthly_price": 399, "beta_yearly_price": 3900},
        ),
    )
    org, _ = Plan.objects.update_or_create(
        key="organization",
        defaults=dict(
            name="Organization",
            description="For groups and teams managing shared readiness.",
            tier="organization",
            is_public=True,
            is_active=True,
            is_recommended=False,
            currency="usd",
            monthly_price=500,  # $5 / seat / month
            yearly_price=4900,  # $49 / seat / year
            sort_order=2,
            metadata={"per_seat": True, "coming_soon": True, "cta": "contact"},
        ),
    )

    # Free entitlements.
    for key, value, period in FREE_ENTITLEMENTS:
        PlanEntitlement.objects.update_or_create(
            plan=free,
            feature_key=key,
            defaults=dict(limit_value=value, limit_period=period, is_enabled=True),
        )
    for key, enabled in FREE_FLAGS:
        PlanEntitlement.objects.update_or_create(
            plan=free,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=enabled),
        )

    # Pro entitlements — unlimited numeric, all flags on.
    for key in PRO_NUMERIC:
        period = "month" if key.endswith("_per_month") else "total"
        PlanEntitlement.objects.update_or_create(
            plan=pro,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period=period, is_enabled=True),
        )
    for key in PRO_FLAGS:
        PlanEntitlement.objects.update_or_create(
            plan=pro,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=True),
        )

    # Organization inherits Pro entitlements (unlimited + flags).
    for key in PRO_NUMERIC:
        period = "month" if key.endswith("_per_month") else "total"
        PlanEntitlement.objects.update_or_create(
            plan=org,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period=period, is_enabled=True),
        )
    for key in PRO_FLAGS:
        PlanEntitlement.objects.update_or_create(
            plan=org,
            feature_key=key,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=True),
        )


def unseed(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(key__in=["free", "pro", "organization"]).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
