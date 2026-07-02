"""
Payment lifecycle hardening tests.

Covers the gaps closed in billing/lifecycle-hardening-v1:
  * cancel/resume actually call Stripe (not just a local flag) — and don't flip
    the local flag if the provider call fails;
  * a Stripe `past_due` arriving via subscription.updated gets a grace deadline;
  * customer.subscription.trial_will_end and invoice.upcoming are handled (they
    were previously ignored) and send the matching heads-up email;
  * current_period_start is persisted from the webhook.

Stripe SDK calls are mocked; no real Stripe account/keys are needed.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from . import services
from .models import Plan, UserSubscription

User = get_user_model()

STRIPE_ENV = dict(
    BILLING_PROVIDER="stripe",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_PUBLISHABLE_KEY="pk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_dummy",
)


class CancelResumeCallsStripeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="c", email="c@x.com", password="StrongPass123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def _stripe_sub(self, sub_id, **extra):
        return UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="stripe",
            provider_subscription_id=sub_id, provider_customer_id="cus_" + sub_id,
            status="active", **extra,
        )

    @override_settings(**STRIPE_ENV)
    def test_cancel_calls_stripe_then_flips_local_flag(self):
        sub = self._stripe_sub("sub_X")
        with mock.patch("stripe.Subscription.modify") as modify:
            services.cancel_subscription(self.user)
        modify.assert_called_once_with("sub_X", cancel_at_period_end=True)
        sub.refresh_from_db()
        self.assertTrue(sub.cancel_at_period_end)

    @override_settings(**STRIPE_ENV)
    def test_failed_stripe_cancel_does_not_flip_local_flag(self):
        # If Stripe fails, we must NOT show "canceled" locally while billing
        # continues — the provider call happens first and its error propagates.
        sub = self._stripe_sub("sub_Y")
        with mock.patch("stripe.Subscription.modify", side_effect=Exception("stripe down")):
            with self.assertRaises(Exception):
                services.cancel_subscription(self.user)
        sub.refresh_from_db()
        self.assertFalse(sub.cancel_at_period_end)

    @override_settings(**STRIPE_ENV)
    def test_resume_calls_stripe(self):
        sub = self._stripe_sub("sub_Z", cancel_at_period_end=True)
        with mock.patch("stripe.Subscription.modify") as modify:
            services.resume_subscription(self.user)
        modify.assert_called_once_with("sub_Z", cancel_at_period_end=False)
        sub.refresh_from_db()
        self.assertFalse(sub.cancel_at_period_end)

    def test_manual_cancel_does_not_call_stripe(self):
        # Default (manual) provider: no Stripe call, local flag still flips.
        UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="manual",
            provider_subscription_id="manual_1", status="active",
        )
        with mock.patch("stripe.Subscription.modify") as modify:
            sub = services.cancel_subscription(self.user)
        modify.assert_not_called()
        self.assertTrue(sub.cancel_at_period_end)


class WebhookLifecycleTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="w", email="w@x.com", password="StrongPass123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def _post(self, event):
        return self.client.post(
            "/api/v1/billing/webhook/stripe/",
            data=json.dumps(event), content_type="application/json",
        )

    def _sub(self, sub_id, status="active"):
        return UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="manual",
            provider_subscription_id=sub_id, provider_customer_id="cus_" + sub_id,
            status=status,
        )

    def test_past_due_via_subscription_update_sets_grace_deadline(self):
        self._sub("sub_pd")
        resp = self._post({
            "id": "evt_pd", "type": "customer.subscription.updated",
            "data": {"object": {
                "object": "subscription", "id": "sub_pd",
                "customer": "cus_sub_pd", "status": "past_due",
            }},
        })
        self.assertEqual(resp.data["status"], "processed")
        sub = UserSubscription.objects.get(provider_subscription_id="sub_pd")
        self.assertEqual(sub.status, "past_due")
        self.assertIsNotNone(sub.grace_period_until)

    def test_period_start_persisted_from_webhook(self):
        self._sub("sub_ps")
        self._post({
            "id": "evt_ps", "type": "customer.subscription.updated",
            "data": {"object": {
                "object": "subscription", "id": "sub_ps", "customer": "cus_sub_ps",
                "status": "active",
                "current_period_start": 1893456000, "current_period_end": 1896134400,
            }},
        })
        sub = UserSubscription.objects.get(provider_subscription_id="sub_ps")
        self.assertIsNotNone(sub.current_period_start)
        self.assertIsNotNone(sub.current_period_end)

    def test_trial_will_end_is_handled_and_emails(self):
        self._sub("sub_tw", status="trialing")
        before = len(mail.outbox)
        resp = self._post({
            "id": "evt_tw", "type": "customer.subscription.trial_will_end",
            "data": {"object": {
                "object": "subscription", "id": "sub_tw",
                "customer": "cus_sub_tw", "status": "trialing",
            }},
        })
        self.assertEqual(resp.data["status"], "processed")  # was "ignored" before
        self.assertGreater(len(mail.outbox), before)

    def test_invoice_upcoming_is_handled_and_emails(self):
        self._sub("sub_up")
        before = len(mail.outbox)
        resp = self._post({
            "id": "evt_up", "type": "invoice.upcoming",
            "data": {"object": {
                "id": "in_up", "subscription": "sub_up", "customer": "cus_sub_up",
            }},
        })
        self.assertEqual(resp.data["status"], "processed")
        self.assertGreater(len(mail.outbox), before)
