"""
Add the ``applications_limit`` display-mirror entitlement for Application
Tracker V1 (Free 3 / Pro 100 active tracked applications).

The enforced source of truth is ``apps.users.plans.PLAN_LIMITS`` +
``apps.documents.plan_usage`` (resource key ``applications``); this billing
``PlanEntitlement`` row is the display mirror that powers the public pricing /
plan-comparison UI. Data migration only; idempotent and reversible.
"""

from django.db import migrations

FREE_UPDATES = [("applications_limit", 3)]
PRO_UPDATES = [("applications_limit", 100)]


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
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    PlanEntitlement.objects.filter(feature_key="applications_limit").delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0013_storage_plan_limit_display")]
    operations = [migrations.RunPython(apply, revert)]
