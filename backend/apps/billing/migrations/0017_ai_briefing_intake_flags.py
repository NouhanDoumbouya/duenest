"""
Seed the ``ai_briefing`` and ``ai_intake`` plan flags (Pro-only).

These move two AI features from Free to Pro so the paid tier owns the ongoing
"automation" AI (proactive briefings + AI file intake), while the conversational
assistant stays available on Free as a credit-limited taste. PRODUCT entitlement
flags alongside the other ``ai_*`` flags from migration 0012: Free OFF,
Pro/Teams ON. The deterministic (non-AI) intake path still works on every plan;
these flags govern only the optional AI, which is also credit-metered. Data
migration only; idempotent and reversible.
"""

from django.db import migrations

FLAGS = ["ai_briefing", "ai_intake"]


def apply(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    def set_flag(plan_key, flag, enabled):
        plan = Plan.objects.filter(key=plan_key).first()
        if plan is None:
            return
        PlanEntitlement.objects.update_or_create(
            plan=plan,
            feature_key=flag,
            defaults=dict(limit_value=None, limit_period="total", is_enabled=enabled),
        )

    for flag in FLAGS:
        set_flag("free", flag, False)
        for plan_key in ("pro", "organization"):  # Teams inherits Pro's AI features
            set_flag(plan_key, flag, True)


def revert(apps, schema_editor):
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    PlanEntitlement.objects.filter(feature_key__in=FLAGS).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0016_ai_magic_inbox_flag")]
    operations = [migrations.RunPython(apply, revert)]
