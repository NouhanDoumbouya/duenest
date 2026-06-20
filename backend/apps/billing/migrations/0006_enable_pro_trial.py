"""Enable a 14-day free trial on the Pro plan.

Trial support is fully wired (Stripe ``trial_period_days`` + the manual provider
+ TRIALING access + trial-ending/expiry emails); this just turns it on for Pro.
Reversible: the down migration sets ``trial_days`` back to 0.
"""

from django.db import migrations

TRIAL_DAYS = 14


def enable_pro_trial(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(key="pro").update(trial_days=TRIAL_DAYS)


def disable_pro_trial(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(key="pro").update(trial_days=0)


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0005_invoicerecord_receipt_number_and_more"),
    ]

    operations = [
        migrations.RunPython(enable_pro_trial, disable_pro_trial),
    ]
