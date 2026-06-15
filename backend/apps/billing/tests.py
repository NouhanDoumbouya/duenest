import json

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

from . import entitlements
from .models import (
    BillingEvent,
    ManualAccessGrant,
    Plan,
    PromoCode,
    UserSubscription,
)

User = get_user_model()


@override_settings(BILLING_PROVIDER="manual", BILLING_TEST_MODE=True)
class BillingCoreTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")
        self.free = Plan.objects.get(key="free")

    # ---- Plans / status ----------------------------------------------------

    def test_plans_endpoint_is_public(self):
        resp = self.client.get("/api/v1/billing/plans/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        keys = {p["key"] for p in resp.data}
        self.assertEqual(keys, {"free", "pro", "organization"})
        # Provider price IDs are never exposed publicly.
        self.assertNotIn("monthly_provider_price_id", resp.data[0])

    def test_free_user_status(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/billing/status/")
        self.assertEqual(resp.data["status"], "free")
        self.assertFalse(resp.data["is_pro"])
        self.assertEqual(resp.data["message"], "You are on the Free plan.")

    # ---- Entitlements ------------------------------------------------------

    def test_free_entitlements(self):
        self.assertEqual(
            entitlements.get_feature_limit(self.user, "documents_limit"), 25
        )
        self.assertTrue(
            entitlements.has_feature(self.user, "emergency_protocol_enabled")
        )
        self.assertFalse(entitlements.has_feature(self.user, "smart_intake_enabled"))

    def test_pro_entitlements_after_manual_grant(self):
        ManualAccessGrant.objects.create(
            user=self.user, plan=self.pro,
            grant_status=UserSubscription.Status.MANUAL_PRO,
        )
        self.assertTrue(entitlements.is_pro(self.user))
        self.assertIsNone(entitlements.get_feature_limit(self.user, "documents_limit"))
        # The service/endpoints call sync_user_plan; do so here for the bridge.
        entitlements.sync_user_plan(self.user)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "pro_placeholder")

    # ---- Checkout (manual provider activates immediately) ------------------

    def test_manual_checkout_activates_pro(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "month"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["manual"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "pro_placeholder")
        sub = UserSubscription.objects.get(user=self.user)
        self.assertEqual(sub.status, "active")

    def test_checkout_rejects_unknown_plan(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "nope", "interval": "month"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_checkout_rejects_invalid_interval(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "weekly"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_checkout_cannot_buy_free_plan(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "free", "interval": "month"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- Promo codes -------------------------------------------------------

    def _make_promo(self, **kwargs):
        defaults = dict(
            code="SAVE20",
            promo_type=PromoCode.PromoType.PERCENTAGE_DISCOUNT,
            percent_off=20,
            is_active=True,
        )
        defaults.update(kwargs)
        return PromoCode.objects.create(**defaults)

    def test_promo_valid(self):
        self._make_promo()
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/promo/validate/", {"code": "save20"}, format="json"
        )
        self.assertTrue(resp.data["valid"])
        self.assertEqual(resp.data["discount_label"], "20% off")

    def test_promo_expired(self):
        self._make_promo(ends_at=timezone.now() - timezone.timedelta(days=1))
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/promo/validate/", {"code": "SAVE20"}, format="json"
        )
        self.assertFalse(resp.data["valid"])
        self.assertEqual(resp.data["reason"], "This code has expired.")

    def test_promo_plan_ineligible(self):
        self._make_promo(applies_to_plans=["family"])
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/promo/validate/",
            {"code": "SAVE20", "plan_key": "pro"},
            format="json",
        )
        self.assertFalse(resp.data["valid"])
        self.assertIn("not valid for this plan", resp.data["reason"])

    def test_promo_unknown(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/billing/promo/validate/", {"code": "NOPE"}, format="json"
        )
        self.assertFalse(resp.data["valid"])

    # ---- Webhooks ----------------------------------------------------------

    def _post_event(self, event: dict):
        return self.client.post(
            "/api/v1/billing/webhook/stripe/",
            data=json.dumps(event),
            content_type="application/json",
        )

    def test_webhook_idempotency(self):
        sub = UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="manual",
            provider_subscription_id="sub_1", provider_customer_id="cus_1",
            status="active",
        )
        event = {
            "id": "evt_dupe",
            "type": "customer.subscription.updated",
            "data": {"object": {
                "object": "subscription", "id": "sub_1",
                "customer": "cus_1", "status": "past_due",
            }},
        }
        first = self._post_event(event)
        second = self._post_event(event)
        self.assertEqual(first.data["status"], "processed")
        self.assertEqual(second.data["status"], "ignored")
        self.assertEqual(BillingEvent.objects.filter(provider_event_id="evt_dupe").count(), 1)
        sub.refresh_from_db()
        self.assertEqual(sub.status, "past_due")

    def test_webhook_payment_failed_sets_grace(self):
        UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="manual",
            provider_subscription_id="sub_2", provider_customer_id="cus_2",
            status="active",
        )
        self._post_event({
            "id": "evt_fail",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "in_1", "subscription": "sub_2", "customer": "cus_2"}},
        })
        sub = UserSubscription.objects.get(provider_subscription_id="sub_2")
        self.assertEqual(sub.status, "grace_period")
        self.assertIsNotNone(sub.grace_period_until)

    def test_webhook_unknown_event_does_not_crash(self):
        resp = self._post_event({"id": "evt_x", "type": "some.unknown.event", "data": {"object": {}}})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ---- Downgrade safety --------------------------------------------------

    def test_downgrade_does_not_delete_documents(self):
        grant = ManualAccessGrant.objects.create(
            user=self.user, plan=self.pro,
            grant_status=UserSubscription.Status.MANUAL_PRO,
        )
        entitlements.sync_user_plan(self.user)
        Document.objects.create(owner=self.user, title="Passport")
        Document.objects.create(owner=self.user, title="ID")
        # Revoke -> back to free, but documents remain.
        grant.is_active = False
        grant.save()
        entitlements.sync_user_plan(self.user)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "free")
        self.assertEqual(Document.objects.filter(owner=self.user).count(), 2)


@override_settings(BILLING_PROVIDER="manual")
class FounderBillingPermissionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="normal", email="n@example.com", password="StrongPassword123!DN"
        )
        self.staff = User.objects.create_user(
            username="founder", email="f@example.com",
            password="StrongPassword123!DN", is_staff=True,
        )
        self.pro = Plan.objects.get(key="pro")

    def test_normal_user_blocked_from_founder_billing(self):
        self.client.force_authenticate(self.user)
        for path in [
            "/api/v1/founder/billing/overview/",
            "/api/v1/founder/billing/subscribers/",
            "/api/v1/founder/billing/promo-codes/",
            "/api/v1/founder/billing/manual-access/",
            "/api/v1/founder/billing/events/",
        ]:
            self.assertEqual(self.client.get(path).status_code, status.HTTP_403_FORBIDDEN)

    def test_founder_can_create_promo_code(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            "/api/v1/founder/billing/promo-codes/",
            {"code": "founder50", "promo_type": "founder_discount", "percent_off": 50},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["code"], "FOUNDER50")  # normalized

    def test_founder_can_grant_and_revoke_manual_access(self):
        self.client.force_authenticate(self.staff)
        create = self.client.post(
            "/api/v1/founder/billing/manual-access/",
            {"user": self.user.id, "plan": self.pro.id, "grant_status": "manual_pro"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "pro_placeholder")
        grant_id = create.data["id"]
        delete = self.client.delete(
            f"/api/v1/founder/billing/manual-access/{grant_id}/"
        )
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "free")

    def test_founder_overview_returns_estimates(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get("/api/v1/founder/billing/overview/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("mrr_estimate_minor", resp.data)
        self.assertIn("estimate_note", resp.data)


@override_settings(BILLING_PROVIDER="manual", BILLING_TEST_MODE=True)
class BillingImprovementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="imp", email="imp@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")
        self.pro.monthly_provider_price_id = "price_pro_m"
        self.pro.yearly_provider_price_id = "price_pro_y"
        self.pro.save()

    def _post_event(self, event):
        return self.client.post(
            "/api/v1/billing/webhook/stripe/",
            data=json.dumps(event),
            content_type="application/json",
        )

    def test_webhook_resolves_plan_and_terms_from_price_id(self):
        event = {
            "id": "evt_price",
            "type": "customer.subscription.created",
            "data": {"object": {
                "object": "subscription",
                "id": "sub_price",
                "customer": "cus_price",
                "status": "active",
                "metadata": {"user_id": str(self.user.id)},
                "items": {"data": [{"price": {
                    "id": "price_pro_m",
                    "unit_amount": 599,
                    "recurring": {"interval": "month"},
                }}]},
            }},
        }
        resp = self._post_event(event)
        self.assertEqual(resp.data["status"], "processed")
        sub = UserSubscription.objects.get(provider_subscription_id="sub_price")
        self.assertEqual(sub.plan.key, "pro")  # resolved from price id, not Free
        self.assertEqual(sub.billing_interval, "month")
        self.assertEqual(sub.amount, 599)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "pro_placeholder")

    def test_sync_command_expires_manual_grant_and_fixes_drift(self):
        from django.core.management import call_command

        ManualAccessGrant.objects.create(
            user=self.user, plan=self.pro,
            grant_status=UserSubscription.Status.MANUAL_PRO,
            ends_at=timezone.now() - timezone.timedelta(hours=1),
        )
        # Simulate stale denormalized state (tier left as Pro after grant ended).
        self.user.plan = "pro_placeholder"
        self.user.save(update_fields=["plan"])

        call_command("sync_billing_access")

        grant = ManualAccessGrant.objects.get(user=self.user)
        self.assertFalse(grant.is_active)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "free")

    def test_sync_command_expires_grace_period(self):
        from django.core.management import call_command

        sub = UserSubscription.objects.create(
            user=self.user, plan=self.pro, provider="manual",
            provider_subscription_id="sub_grace",
            status=UserSubscription.Status.GRACE_PERIOD,
            grace_period_until=timezone.now() - timezone.timedelta(hours=1),
        )
        call_command("sync_billing_access")
        sub.refresh_from_db()
        self.assertEqual(sub.status, "unpaid")
        self.user.refresh_from_db()
        self.assertEqual(self.user.plan, "free")
