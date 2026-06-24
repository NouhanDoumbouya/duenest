"""
Seed the ``ai_magic_inbox`` plan flag for Magic Inbox AI triage (Pro-only).

This is a PRODUCT entitlement flag (alongside the other ``ai_*`` plan flags from
migration 0012): Free has it OFF, Pro/Teams have it ON. Magic Inbox manual
intake/apply works without AI on every plan; this flag governs only whether the
plan may use the optional AI *triage* (credit-metered at 3 credits per success by
the existing AI credits system). Data migration only; idempotent and reversible.
"""

from django.db import migrations

FLAG = "ai_magic_inbox"


def apply(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    def set_flag(plan_key, enabled):
        plan = Plan.objects.filter(key=plan_key).first()
        if plan is None:
            return
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=FLAG,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=enabled),
        )

    set_flag("free", False)
    for plan_key in ("pro", "organization"):  # Teams inherits Pro's AI features
        set_flag(plan_key, True)


def revert(apps, schema_editor):
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    PlanEntitlement.objects.filter(feature_key=FLAG).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0015_ai_application_document_generation_flag")]
    operations = [migrations.RunPython(apply, revert)]
