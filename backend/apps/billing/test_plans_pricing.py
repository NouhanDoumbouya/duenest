"""CertaNest launch pricing + plan-entitlement tests (migration 0010)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription
from apps.billing.providers import BillingError
from apps.billing.services import start_checkout

User = get_user_model()


class PricingDataTests(TestCase):
    def test_pro_is_usd_799_and_7900(self):
        pro = Plan.objects.get(key="pro")
        self.assertEqual(pro.currency, "usd")
        self.assertEqual(pro.monthly_price, 799)  # $7.99
        self.assertEqual(pro.yearly_price, 7900)  # $79.00

    def test_no_stale_beta_or_myr_pricing(self):
        pro = Plan.objects.get(key="pro")
        self.assertNotIn("beta_monthly_price", pro.metadata)
        self.assertNotIn("beta_yearly_price", pro.metadata)
        # No plan is priced in a non-USD currency.
        self.assertEqual(set(Plan.objects.values_list("currency", flat=True)), {"usd"})
        # The old $5.99 / $59 pricing is gone.
        self.assertFalse(Plan.objects.filter(key="pro", monthly_price=599).exists())

    def test_free_is_zero(self):
        free = Plan.objects.get(key="free")
        self.assertEqual(free.monthly_price, 0)
        self.assertEqual(free.yearly_price, 0)


class ComingSoonTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )

    def test_family_and_teams_are_public_but_not_active(self):
        for key in ("family", "organization"):
            plan = Plan.objects.get(key=key)
            self.assertTrue(plan.is_public)
            self.assertFalse(plan.is_active)
            self.assertTrue(plan.metadata.get("coming_soon"))

    def test_coming_soon_plans_appear_on_public_pricing(self):
        resp = self.client.get("/api/v1/billing/plans/")
        keys = {p["key"] for p in resp.data}
        self.assertIn("family", keys)
        self.assertIn("organization", keys)
        # is_active is exposed so the UI can hide checkout for coming-soon plans.
        fam = next(p for p in resp.data if p["key"] == "family")
        self.assertFalse(fam["is_active"])

    def test_family_is_not_purchasable(self):
        with self.assertRaises(BillingError):
            start_checkout(self.user, "family", "month")

    def test_teams_is_not_purchasable(self):
        with self.assertRaises(BillingError):
            start_checkout(self.user, "organization", "month")


class AiEntitlementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="f", email="f@x.com", password="StrongPassword123!DN"
        )  # Free by default
        self.pro_user = User.objects.create_user(
            username="p", email="p@x.com", password="StrongPassword123!DN"
        )
        # Grant Pro via a manual subscription so entitlements resolve to Pro.
        UserSubscription.objects.create(
            user=self.pro_user,
            plan=Plan.objects.get(key="pro"),
            provider="manual",
            status="active",
            billing_interval="month",
        )

    def test_free_ai_limits(self):
        free = Plan.objects.get(key="free")
        ents = {e.feature_key: e for e in free.entitlements.all()}
        # Monthly AI credits (the new metering unit) — Free gets 10/month.
        self.assertEqual(ents["ai_credits_per_month"].limit_value, 10)
        self.assertEqual(ents["ai_credits_per_month"].limit_period, "month")
        self.assertEqual(ents["ai_indexed_documents"].limit_value, 3)
        # Basic AI flags on for Free; premium AI flags off.
        self.assertTrue(ents["ai_document_qa"].is_enabled)
        self.assertTrue(ents["ai_document_summary"].is_enabled)
        self.assertFalse(ents["ai_multi_document_qa"].is_enabled)
        self.assertFalse(ents["ai_pack_copilot"].is_enabled)

    def test_pro_ai_limits(self):
        pro = Plan.objects.get(key="pro")
        ents = {e.feature_key: e for e in pro.entitlements.all()}
        self.assertEqual(ents["ai_credits_per_month"].limit_value, 200)
        self.assertEqual(ents["ai_credits_per_month"].limit_period, "month")
        self.assertEqual(ents["ai_indexed_documents"].limit_value, 300)
        self.assertTrue(ents["ai_multi_document_qa"].is_enabled)
        self.assertTrue(ents["ai_pack_copilot"].is_enabled)

    def test_helper_credits_and_feature_gates(self):
        # Monthly credit allowances.
        self.assertEqual(entitlements.get_ai_credit_limit(self.user), 10)
        self.assertEqual(entitlements.get_ai_credit_limit(self.pro_user), 200)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.user), 10)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.pro_user), 200)
        # Premium AI feature: off on Free, on for Pro.
        self.assertFalse(
            entitlements.can_use_ai_feature(self.user, "multi_document_qa")
        )
        self.assertTrue(
            entitlements.can_use_ai_feature(self.pro_user, "multi_document_qa")
        )
        # Basic AI feature: allowed on both.
        self.assertTrue(entitlements.can_use_ai_feature(self.user, "document_qa"))
        # Indexing allowed initially (no indexed docs yet) under both caps.
        self.assertTrue(entitlements.can_index_document_for_ai(self.user))
        self.assertTrue(entitlements.can_index_document_for_ai(self.pro_user))

    def test_pro_still_purchasable(self):
        # The AI/coming-soon changes must not break the Pro checkout path.
        plan = Plan.objects.filter(key="pro", is_active=True).first()
        self.assertIsNotNone(plan)


class ScannerEntitlementTests(TestCase):
    def setUp(self):
        self.free = User.objects.create_user(
            username="sf", email="sf@x.com", password="StrongPassword123!DN"
        )
        self.pro = User.objects.create_user(
            username="sp", email="sp@x.com", password="StrongPassword123!DN"
        )
        UserSubscription.objects.create(
            user=self.pro,
            plan=Plan.objects.get(key="pro"),
            provider="manual",
            status="active",
            billing_interval="month",
        )

    def test_free_scanner_page_cap_pro_unlimited(self):
        # Free: 5 pages/PDF; Pro: unlimited (None). Basic scanning stays free.
        self.assertEqual(entitlements.scanner_max_pages(self.free), 5)
        self.assertIsNone(entitlements.scanner_max_pages(self.pro))

    def test_hd_and_advanced_enhancement_are_pro_only(self):
        self.assertFalse(entitlements.can_use_scanner_hd(self.free))
        self.assertFalse(entitlements.can_use_scanner_advanced_enhancement(self.free))
        self.assertTrue(entitlements.can_use_scanner_hd(self.pro))
        self.assertTrue(entitlements.can_use_scanner_advanced_enhancement(self.pro))

    def test_scanner_count_is_unlimited_on_free(self):
        # The scanner is NOT metered by a monthly count on Free.
        res = entitlements.check_usage_limit(self.free, "scanner_scans_per_month")
        self.assertTrue(res["unlimited"])
