from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.notifications.models import EmailLog

from .models import BillingEmailSettings, Plan, UserSubscription

User = get_user_model()


@override_settings(FOUNDER_ALLOW_ALL_STAFF=True)
class BillingEmailSettingsApiTests(APITestCase):
    URL = "/api/v1/founder/billing/email-settings/"

    def setUp(self):
        self.founder = User.objects.create_user(
            username="f",
            email="f@example.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )
        self.member = User.objects.create_user(
            username="m", email="m@example.com", password="StrongPassword123!DN"
        )

    def test_requires_founder(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(self.URL).status_code, 403)

    def test_get_defaults_and_patch(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["trial_ending_days_before"], 3)
        self.assertEqual(resp.data["grace_period_days"], 7)

        resp = self.client.patch(
            self.URL,
            {"trial_ending_days_before": 7, "dunning_followup_days": 3},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        cfg = BillingEmailSettings.load()
        self.assertEqual(cfg.trial_ending_days_before, 7)
        self.assertEqual(cfg.dunning_followup_days, 3)

    def test_followup_must_be_less_than_grace(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.patch(
            self.URL,
            {"grace_period_days": 5, "dunning_followup_days": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


@override_settings(
    EMAIL_CONFIGURED=True,
    DEFAULT_FROM_EMAIL="billing@duenest.test",
    BACKEND_PUBLIC_URL="https://api.duenest.test",
)
class CronTimingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def test_configurable_trial_window(self):
        # Trial ends in 6 days — outside the default 3, inside a configured 7.
        cfg = BillingEmailSettings.load()
        cfg.trial_ending_days_before = 7
        cfg.save()
        UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            status="trialing",
            trial_end=timezone.now() + timedelta(days=6),
        )
        call_command("sync_billing_access")
        self.assertEqual(
            EmailLog.objects.filter(
                email_type="billing_trial_ending", status="sent"
            ).count(),
            1,
        )

    def test_dunning_followup_sends_once(self):
        cfg = BillingEmailSettings.load()
        cfg.grace_period_days = 7
        cfg.dunning_followup_days = 2
        cfg.save()
        # Failure ~2 days ago: grace ends in 5 days, so the follow-up is due.
        UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            status="grace_period",
            grace_period_until=timezone.now() + timedelta(days=5),
        )
        call_command("sync_billing_access")
        call_command("sync_billing_access")  # dedupe
        self.assertEqual(
            EmailLog.objects.filter(
                email_type="billing_payment_failed_followup", status="sent"
            ).count(),
            1,
        )

    def test_followup_off_by_default(self):
        UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            status="grace_period",
            grace_period_until=timezone.now() + timedelta(days=5),
        )
        call_command("sync_billing_access")
        self.assertFalse(
            EmailLog.objects.filter(
                email_type="billing_payment_failed_followup"
            ).exists()
        )
