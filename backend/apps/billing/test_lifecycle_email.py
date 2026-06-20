from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.notifications.models import EmailLog
from common.transactional_email import TRANSACTIONAL_EMAILS

from . import lifecycle_email
from .models import Plan, UserSubscription

User = get_user_model()


@override_settings(
    EMAIL_CONFIGURED=True,
    DEFAULT_FROM_EMAIL="billing@duenest.test",
    BACKEND_PUBLIC_URL="https://api.duenest.test",
)
class LifecycleEmailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def _sub(self, **kw):
        defaults = dict(
            user=self.user,
            plan=self.pro,
            status="active",
            billing_interval="month",
            currency="usd",
            amount=900,
        )
        defaults.update(kw)
        return UserSubscription.objects.create(**defaults)

    def test_registry_exposes_lifecycle_keys(self):
        for key in (
            "billing_payment_failed",
            "billing_trial_ending",
            "billing_renewal_upcoming",
            "billing_subscription_canceled",
        ):
            self.assertIn(key, TRANSACTIONAL_EMAILS)

    def test_payment_failed_is_transactional_no_unsubscribe(self):
        sub = self._sub(
            status="grace_period",
            grace_period_until=timezone.now() + timedelta(days=3),
        )
        self.assertTrue(lifecycle_email.send_payment_failed_email(self.user, sub))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("payment", mail.outbox[0].subject.lower())
        self.assertNotIn("List-Unsubscribe", mail.outbox[0].extra_headers)
        self.assertEqual(
            EmailLog.objects.filter(
                email_type="billing_payment_failed", status="sent"
            ).count(),
            1,
        )

    def test_trial_ending_is_lifecycle_with_unsubscribe(self):
        sub = self._sub(
            status="trialing", trial_end=timezone.now() + timedelta(days=2)
        )
        self.assertTrue(lifecycle_email.send_trial_ending_email(self.user, sub))
        self.assertIn("List-Unsubscribe", mail.outbox[0].extra_headers)

    def test_disabled_setting_skips_send(self):
        from apps.founder.models import TransactionalEmailSetting

        TransactionalEmailSetting.objects.create(
            key="billing_renewal_upcoming", name="Renewal", enabled=False
        )
        sub = self._sub(current_period_end=timezone.now() + timedelta(days=2))
        self.assertFalse(lifecycle_email.send_renewal_upcoming_email(self.user, sub))
        self.assertEqual(len(mail.outbox), 0)

    def test_pro_plan_has_14_day_trial(self):
        self.assertEqual(self.pro.trial_days, 14)

    def test_cron_expires_manual_trial_to_free_and_emails(self):
        sub = self._sub(
            status="trialing",
            trial_end=timezone.now() - timedelta(hours=1),
            provider_subscription_id="",
        )
        call_command("sync_billing_access")
        sub.refresh_from_db()
        self.assertEqual(sub.status, "free")
        self.assertEqual(
            EmailLog.objects.filter(
                email_type="billing_trial_ended", status="sent"
            ).count(),
            1,
        )

    def test_cron_leaves_stripe_trial_alone(self):
        # A provider-backed trial is governed by Stripe webhooks, not the cron.
        sub = self._sub(
            status="trialing",
            trial_end=timezone.now() - timedelta(hours=1),
            provider_subscription_id="sub_stripe_1",
        )
        call_command("sync_billing_access")
        sub.refresh_from_db()
        self.assertEqual(sub.status, "trialing")
        self.assertFalse(
            EmailLog.objects.filter(email_type="billing_trial_ended").exists()
        )

    def test_refund_email(self):
        self.assertTrue(
            lifecycle_email.send_refund_email(
                self.user, amount_minor=4900, currency="usd"
            )
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("refund", mail.outbox[0].subject.lower())
        self.assertIn("$49.00", mail.outbox[0].body)

    def test_cron_emails_trial_and_renewal_once(self):
        # Trialing user, trial ends in 2 days.
        self._sub(status="trialing", trial_end=timezone.now() + timedelta(days=2))
        # A second user with an active sub renewing in 2 days.
        other = User.objects.create_user(
            username="o", email="o@example.com", password="StrongPassword123!DN"
        )
        UserSubscription.objects.create(
            user=other,
            plan=self.pro,
            status="active",
            billing_interval="month",
            currency="usd",
            amount=900,
            current_period_end=timezone.now() + timedelta(days=2),
        )
        call_command("sync_billing_access")
        call_command("sync_billing_access")  # dedupe: should not re-send
        types = sorted(
            EmailLog.objects.filter(status="sent").values_list("email_type", flat=True)
        )
        self.assertEqual(
            types, ["billing_renewal_upcoming", "billing_trial_ending"]
        )
