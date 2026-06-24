"""
Align the billing display-mirror entitlements with the enforced storage/plan
limits (backend/storage-plan-limits).

The enforced source of truth for these non-AI limits is
``apps.users.plans.PLAN_LIMITS`` (+ ``apps.documents.plan_usage``). These billing
``PlanEntitlement`` rows are the *display* mirror that powers the public pricing
table and the plan-comparison UI, so they must show the same numbers:

  Free:  documents 25 -> 30, bundles 3 -> 1, reminders 40 -> 10
         (files 60, storage_mb 100, emergency_packs 1, quick_shares 5 unchanged)
  Pro:   documents_limit -> 1000, storage_mb -> 10240 (10 GB)
         (other Pro numeric limits stay unlimited / None)

Storage limits are PRODUCT limits, wholly separate from the Cloudflare R2
infrastructure (which stays private). Data migration only; idempotent/reversible.
"""

from django.db import migrations

FREE_UPDATES = [
    ("documents_limit", 30),
    ("bundles_limit", 1),
    ("reminders_limit", 10),
]
PRO_UPDATES = [
    ("documents_limit", 1000),
    ("storage_mb", 10240),  # 10 GB in MB
]

# For reverting to the previous (migration 0002) display values.
FREE_REVERT = [
    ("documents_limit", 25),
    ("bundles_limit", 3),
    ("reminders_limit", 40),
]
PRO_REVERT = [
    ("documents_limit", None),
    ("storage_mb", None),
]


def _apply(apps, plan_key, updates):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    plan = Plan.objects.filter(key=plan_key).first()
    if plan is None:
        return
    for key, value in updates:
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=key,
            defaults=dict(limit_value=value, limit_period="total", is_enabled=True),
        )


def apply(apps, schema_editor):
    _apply(apps, "free", FREE_UPDATES)
    for plan_key in ("pro", "organization"):  # Teams mirrors Pro
        _apply(apps, plan_key, PRO_UPDATES)


def revert(apps, schema_editor):
    _apply(apps, "free", FREE_REVERT)
    for plan_key in ("pro", "organization"):
        _apply(apps, plan_key, PRO_REVERT)


class Migration(migrations.Migration):
    dependencies = [("billing", "0012_ai_credits_and_feature_flags")]
    operations = [migrations.RunPython(apply, revert)]
