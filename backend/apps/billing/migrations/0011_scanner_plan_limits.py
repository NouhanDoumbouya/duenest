"""
Scanner plan rules: keep the scanner mostly FREE (acquisition/trust feature),
gate only the serious-workflow extras to Pro.

Product decision: do NOT frame Free as "X scans/month". Free users scan and save
freely, bounded only by their vault limits (documents/storage). So:

* ``scanner_scans_per_month`` becomes UNLIMITED on Free (was 5/month) — scans are
  bounded by the existing vault file/document/storage limits instead.
* ``scanner_max_pages_per_pdf``: Free 5 pages/PDF; Pro unlimited. (Enforced in the
  scanner upload view — small, safe gate.)
* ``scanner_hd_export`` / ``scanner_advanced_enhancement``: Pro-only flags (Free
  off). These are client-side scanner capabilities; enforcement is the
  ``scanner/plan-limits-enforcement`` follow-up — here we define the entitlements
  and surface them in pricing/docs.

OCR / AI extraction / auto-reminders from scans are governed by the AI plan
entitlements (``ai_actions_per_day`` / ``ai_indexed_documents``) seeded in 0010,
not duplicated here.

Data migration only; idempotent and reversible.
"""

from django.db import migrations


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

    # Free: scanner is unmetered by count (vault limits are the real bound).
    set_ent(free, "scanner_scans_per_month", None, "month", True)
    set_ent(free, "scanner_max_pages_per_pdf", 5, "total", True)
    set_ent(free, "scanner_hd_export", None, "total", False)
    set_ent(free, "scanner_advanced_enhancement", None, "total", False)

    # Pro / Teams: full scanner.
    for plan in (pro, org):
        set_ent(plan, "scanner_scans_per_month", None, "month", True)
        set_ent(plan, "scanner_max_pages_per_pdf", None, "total", True)  # unlimited
        set_ent(plan, "scanner_hd_export", None, "total", True)
        set_ent(plan, "scanner_advanced_enhancement", None, "total", True)


def revert(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")

    # Restore the prior Free 5-scans/month cap.
    free = Plan.objects.filter(key="free").first()
    if free:
        PlanEntitlement.objects.update_or_create(
            plan=free,
            feature_key="scanner_scans_per_month",
            defaults=dict(limit_value=5, limit_period="month", is_enabled=True),
        )
    PlanEntitlement.objects.filter(
        feature_key__in=[
            "scanner_max_pages_per_pdf",
            "scanner_hd_export",
            "scanner_advanced_enhancement",
        ]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0010_usd_pricing_and_ai_limits")]
    operations = [migrations.RunPython(apply, revert)]
