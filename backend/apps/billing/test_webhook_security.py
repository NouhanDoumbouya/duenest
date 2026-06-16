"""
SEC-004 regression tests: billing webhook / provider production safety.

The manual provider accepts unsigned JSON and activates plans with no payment;
it must never be usable in production. Stripe must have its keys configured so
webhook signatures can actually be verified.
"""

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .providers import BillingError, get_provider, manual_provider_allowed
from .providers import validate_billing_configuration as validate

WEBHOOK_URL = "/api/v1/billing/webhook/stripe/"


class BillingConfigValidationTests(APITestCase):
    @override_settings(
        DEBUG=False, BILLING_PROVIDER="manual", BILLING_ALLOW_MANUAL_PROVIDER=False
    )
    def test_manual_provider_rejected_in_production(self):
        self.assertFalse(manual_provider_allowed())
        with self.assertRaises(BillingError):
            validate()
        with self.assertRaises(BillingError):
            get_provider()

    @override_settings(
        DEBUG=False, BILLING_PROVIDER="manual", BILLING_ALLOW_MANUAL_PROVIDER=True
    )
    def test_manual_provider_allowed_when_explicitly_enabled(self):
        self.assertTrue(manual_provider_allowed())
        validate()  # should not raise

    @override_settings(DEBUG=True, BILLING_PROVIDER="manual")
    def test_manual_provider_allowed_in_debug(self):
        self.assertTrue(manual_provider_allowed())
        validate()

    @override_settings(
        DEBUG=False,
        BILLING_PROVIDER="stripe",
        STRIPE_SECRET_KEY="",
        STRIPE_PUBLISHABLE_KEY="",
        STRIPE_WEBHOOK_SECRET="",
    )
    def test_stripe_requires_keys(self):
        with self.assertRaises(BillingError):
            validate()

    @override_settings(
        DEBUG=False,
        BILLING_PROVIDER="stripe",
        STRIPE_SECRET_KEY="sk_test_x",
        STRIPE_PUBLISHABLE_KEY="pk_test_x",
        STRIPE_WEBHOOK_SECRET="whsec_x",
    )
    def test_stripe_with_keys_validates(self):
        validate()  # should not raise


class WebhookFailClosedTests(APITestCase):
    @override_settings(
        DEBUG=False, BILLING_PROVIDER="manual", BILLING_ALLOW_MANUAL_PROVIDER=False
    )
    def test_forged_manual_webhook_rejected_in_production(self):
        # A forged "checkout completed" event must NOT be processed when the
        # manual provider is disabled — the endpoint fails closed.
        resp = self.client.post(
            WEBHOOK_URL,
            {"id": "evt_forged", "type": "checkout.session.completed",
             "data": {"object": {"metadata": {"user_id": "1"}}}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(
        DEBUG=False, BILLING_PROVIDER="manual", BILLING_ALLOW_MANUAL_PROVIDER=True
    )
    def test_manual_webhook_processed_when_allowed(self):
        # When explicitly allowed (dev/test), the manual webhook still parses.
        resp = self.client.post(
            WEBHOOK_URL,
            {"id": "evt_ok", "type": "some.unhandled.event", "data": {"object": {}}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
