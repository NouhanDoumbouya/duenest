"""Stripe billing provider/endpoint tests.

These cover the parts of the Stripe path the manual provider can't exercise:
that checkout/portal require auth, that the StripeProvider reuses an existing
Stripe customer (and otherwise passes the email), that price IDs resolve from the
STRIPE_PRICE_* env settings when a plan has no DB price, and that an invalid
webhook signature is rejected. The Stripe SDK network calls are mocked, so no
real Stripe account or keys are needed.
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from stripe import Event

from . import services
from .models import BillingEvent, CustomerBillingProfile, Plan, UserSubscription
from .providers import BillingError, StripeProvider
from .services import _to_plain_dict

User = get_user_model()

STRIPE_ENV = dict(
    BILLING_PROVIDER="stripe",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_PUBLISHABLE_KEY="pk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_dummy",
)


class CheckoutAuthTests(APITestCase):
    """The self-serve billing endpoints must reject anonymous callers."""

    def test_checkout_requires_authentication(self):
        resp = self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "month"},
            format="json",
        )
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_portal_requires_authentication(self):
        resp = self.client.post("/api/v1/billing/portal/", {}, format="json")
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


@override_settings(**STRIPE_ENV)
class StripeProviderTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="s", email="s@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")
        # Blank DB price IDs so the STRIPE_PRICE_* env fallback path is exercised.
        self.pro.monthly_provider_price_id = ""
        self.pro.yearly_provider_price_id = ""
        self.pro.save(
            update_fields=[
                "monthly_provider_price_id",
                "yearly_provider_price_id",
            ]
        )

    @staticmethod
    def _fake_checkout_session():
        s = MagicMock()
        s.url = "https://checkout.stripe.test/c/sess_123"
        s.id = "cs_test_123"
        return s

    @override_settings(STRIPE_PRICE_PRO_MONTHLY="price_env_pro_monthly")
    @patch("stripe.checkout.Session.create")
    def test_checkout_uses_env_price_when_db_blank(self, mock_create):
        mock_create.return_value = self._fake_checkout_session()
        profile = CustomerBillingProfile.objects.create(user=self.user)
        out = StripeProvider().create_checkout_session(
            user=self.user, plan=self.pro, interval="month", profile=profile
        )
        self.assertEqual(out["session_id"], "cs_test_123")
        params = mock_create.call_args.kwargs
        self.assertEqual(params["mode"], "subscription")
        self.assertEqual(params["line_items"][0]["price"], "price_env_pro_monthly")
        # User identity is carried for the webhook to reconcile.
        self.assertEqual(params["client_reference_id"], str(self.user.id))
        self.assertEqual(params["metadata"]["user_id"], str(self.user.id))

    @override_settings(STRIPE_PRICE_PRO_MONTHLY="price_env_pro_monthly")
    @patch("stripe.checkout.Session.create")
    def test_checkout_reuses_existing_customer(self, mock_create):
        mock_create.return_value = self._fake_checkout_session()
        profile = CustomerBillingProfile.objects.create(
            user=self.user, provider_customer_id="cus_existing_123"
        )
        StripeProvider().create_checkout_session(
            user=self.user, plan=self.pro, interval="month", profile=profile
        )
        params = mock_create.call_args.kwargs
        self.assertEqual(params["customer"], "cus_existing_123")
        self.assertNotIn("customer_email", params)

    @override_settings(STRIPE_PRICE_PRO_MONTHLY="price_env_pro_monthly")
    @patch("stripe.checkout.Session.create")
    def test_checkout_passes_email_when_no_customer_yet(self, mock_create):
        mock_create.return_value = self._fake_checkout_session()
        profile = CustomerBillingProfile.objects.create(user=self.user)
        StripeProvider().create_checkout_session(
            user=self.user, plan=self.pro, interval="month", profile=profile
        )
        params = mock_create.call_args.kwargs
        self.assertNotIn("customer", params)
        self.assertEqual(params["customer_email"], "s@example.com")

    @patch("stripe.billing_portal.Session.create")
    def test_portal_requires_existing_customer(self, mock_create):
        profile = CustomerBillingProfile.objects.create(user=self.user)
        with self.assertRaises(BillingError):
            StripeProvider().create_portal_session(user=self.user, profile=profile)
        mock_create.assert_not_called()

    @patch("stripe.billing_portal.Session.create")
    def test_portal_returns_url_for_existing_customer(self, mock_create):
        sess = MagicMock()
        sess.url = "https://portal.stripe.test/p/sess_1"
        mock_create.return_value = sess
        profile = CustomerBillingProfile.objects.create(
            user=self.user, provider_customer_id="cus_x"
        )
        out = StripeProvider().create_portal_session(user=self.user, profile=profile)
        self.assertEqual(out["url"], "https://portal.stripe.test/p/sess_1")
        self.assertEqual(mock_create.call_args.kwargs["customer"], "cus_x")

    @patch("stripe.Webhook.construct_event")
    def test_webhook_rejects_invalid_signature(self, mock_construct):
        # Stripe raises SignatureVerificationError; the provider must wrap it.
        mock_construct.side_effect = Exception("bad signature")
        with self.assertRaises(BillingError):
            StripeProvider().verify_and_parse_webhook(b"{}", "t=1,v1=forged")


@override_settings(**STRIPE_ENV)
class StripeWebhookObjectTests(APITestCase):
    """Stripe's SDK returns a StripeObject/Event (no `.get()`), which 500'd the
    webhook. These exercise the normalization + the full handler with a real
    StripeObject event, not just plain dicts."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="w", email="w@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def test_to_plain_dict_normalizes_nested_stripe_object(self):
        ev = Event.construct_from(
            {
                "id": "evt_n",
                "type": "customer.subscription.updated",
                "data": {
                    "object": {
                        "id": "sub_n",
                        "status": "active",
                        "items": {"data": [{"price": {"id": "price_n"}}]},
                    }
                },
            },
            "sk_test",
        )
        # The raw Event has no `.get()` — this is the exact prod failure.
        self.assertFalse(hasattr(ev, "get"))
        d = _to_plain_dict(ev)
        self.assertIsInstance(d, dict)
        self.assertEqual(d.get("id"), "evt_n")
        obj = d["data"]["object"]
        self.assertIsInstance(obj, dict)
        self.assertEqual(obj.get("status"), "active")
        # Deeply nested values are plain dicts too.
        self.assertEqual(obj["items"]["data"][0]["price"].get("id"), "price_n")

    def test_to_plain_dict_passes_plain_dict_through(self):
        out = _to_plain_dict({"id": "x", "data": {"object": {"k": 1}}})
        self.assertEqual(out["data"]["object"].get("k"), 1)

    @patch("stripe.Webhook.construct_event")
    def test_handle_webhook_accepts_stripe_object_event(self, mock_construct):
        sub = UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            provider="stripe",
            provider_subscription_id="sub_obj",
            provider_customer_id="cus_obj",
            status="active",
        )
        payload = {
            "id": "evt_obj",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "object": "subscription",
                    "id": "sub_obj",
                    "customer": "cus_obj",
                    "status": "past_due",
                }
            },
        }
        # Stripe verification returns a StripeObject/Event (no `.get()`).
        mock_construct.return_value = Event.construct_from(payload, "sk_test")
        result = services.handle_webhook(b'{"raw":true}', "t=1,v1=sig")
        self.assertEqual(result["status"], "processed")  # not a 500 AttributeError
        sub.refresh_from_db()
        self.assertEqual(sub.status, "past_due")

        # Idempotent: a duplicate StripeObject event (same id) is ignored.
        mock_construct.return_value = Event.construct_from(payload, "sk_test")
        dup = services.handle_webhook(b'{"raw":true}', "t=1,v1=sig")
        self.assertEqual(dup["status"], "ignored")
        self.assertEqual(
            BillingEvent.objects.filter(provider_event_id="evt_obj").count(), 1
        )

    @patch("stripe.Webhook.construct_event")
    def test_handle_webhook_unknown_stripe_object_event_no_crash(self, mock_construct):
        mock_construct.return_value = Event.construct_from(
            {"id": "evt_u", "type": "some.unknown.event", "data": {"object": {}}},
            "sk_test",
        )
        result = services.handle_webhook(b"{}", "sig")
        self.assertIn(result["status"], ("processed", "ignored"))
