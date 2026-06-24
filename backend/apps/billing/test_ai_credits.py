"""
Monthly AI credit model + plan-based AI gating (backend/ai-plan-gating).

Covers the product layer only (credit accounting, feature flags, index cap) —
the infrastructure AI budget guard and model routing are tested in apps.ai.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription

User = get_user_model()


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user,
        plan=Plan.objects.get(key="pro"),
        provider="manual",
        status="active",
        billing_interval="month",
    )


class AiCreditModelTests(TestCase):
    def setUp(self):
        self.free = User.objects.create_user(
            username="free", email="free@x.com", password="StrongPass123!DN"
        )
        self.pro = User.objects.create_user(
            username="pro", email="pro@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.pro)

    # --- allowances ---------------------------------------------------------

    def test_free_gets_10_credits_per_month(self):
        self.assertEqual(entitlements.get_ai_credit_limit(self.free), 10)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.free), 10)

    def test_pro_gets_200_credits_per_month(self):
        self.assertEqual(entitlements.get_ai_credit_limit(self.pro), 200)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.pro), 200)

    # --- feature credit costs ----------------------------------------------

    def test_feature_credit_costs_resolve(self):
        self.assertEqual(entitlements.get_ai_feature_credit_cost("document_qa"), 1)
        self.assertEqual(
            entitlements.get_ai_feature_credit_cost("multi_document_qa"), 5
        )
        self.assertEqual(entitlements.get_ai_feature_credit_cost("pack_copilot"), 3)
        self.assertEqual(entitlements.get_ai_feature_credit_cost("document_draft"), 3)
        self.assertEqual(entitlements.get_ai_feature_credit_cost("share_readiness"), 2)
        # Unknown / unconfigured feature defaults to a safe 1 credit.
        self.assertEqual(entitlements.get_ai_feature_credit_cost("mystery"), 1)

    # --- plan feature gating ------------------------------------------------

    def test_free_can_use_basic_features(self):
        self.assertTrue(entitlements.can_use_ai_feature(self.free, "document_qa"))
        self.assertTrue(entitlements.can_use_ai_feature(self.free, "document_summary"))
        self.assertTrue(
            entitlements.can_use_ai_feature(self.free, "deadline_extraction")
        )

    def test_free_cannot_use_premium_features(self):
        for feature in (
            "multi_document_qa",
            "document_draft",
            "pack_copilot",
            "share_readiness",
            "requirement_link_checklist",
        ):
            self.assertFalse(
                entitlements.can_use_ai_feature(self.free, feature), feature
            )

    def test_pro_can_use_premium_features(self):
        for feature in (
            "multi_document_qa",
            "document_draft",
            "pack_copilot",
            "share_readiness",
            "requirement_link_checklist",
        ):
            self.assertTrue(
                entitlements.can_use_ai_feature(self.pro, feature), feature
            )

    # --- spending + exhaustion ---------------------------------------------

    def test_free_can_use_basic_ai_until_credits_exhausted(self):
        # 10 credits, 1 credit each -> 10 successful uses, then blocked.
        for _ in range(10):
            self.assertTrue(
                entitlements.can_spend_ai_credits(self.free, "document_qa")
            )
            entitlements.spend_ai_credits(self.free, "document_qa")
        self.assertEqual(entitlements.get_ai_credits_used_this_month(self.free), 10)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.free), 0)
        self.assertFalse(entitlements.can_spend_ai_credits(self.free, "document_qa"))

    def test_can_spend_respects_feature_cost(self):
        # Spend 8 of 10; a 5-credit feature no longer fits, a 1-credit one does.
        entitlements.spend_ai_credits(self.free, "document_qa", amount=8)
        self.assertEqual(entitlements.get_ai_credits_remaining(self.free), 2)
        self.assertFalse(
            entitlements.can_spend_ai_credits(self.free, "multi_document_qa")
        )
        self.assertTrue(entitlements.can_spend_ai_credits(self.free, "document_qa"))

    def test_ai_feature_gate_blocks_premium_for_free(self):
        block = entitlements.ai_feature_gate(self.free, "pack_copilot")
        self.assertIsNotNone(block)
        self.assertEqual(block["reason"], "ai_feature_not_in_plan")

    def test_ai_feature_gate_blocks_when_credits_exhausted(self):
        entitlements.spend_ai_credits(self.free, "document_qa", amount=10)
        block = entitlements.ai_feature_gate(self.free, "document_qa")
        self.assertIsNotNone(block)
        self.assertEqual(block["reason"], "ai_credits_exhausted")
        self.assertIn("200 AI credits", block["message"])  # Free upsell copy

    def test_ai_feature_gate_clear_when_allowed_and_funded(self):
        self.assertIsNone(entitlements.ai_feature_gate(self.pro, "pack_copilot"))


class AiIndexCapTests(TestCase):
    def setUp(self):
        self.free = User.objects.create_user(
            username="fi", email="fi@x.com", password="StrongPass123!DN"
        )
        self.pro = User.objects.create_user(
            username="pi", email="pi@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.pro)

    def _index_n_documents(self, user, n):
        from apps.documents.models import Document, DocumentChunk

        for i in range(n):
            doc = Document.objects.create(owner=user, title=f"Doc {i}")
            DocumentChunk.objects.create(
                owner=user, document=doc, chunk_index=0, text="x", text_hash=f"h{i}"
            )

    def test_free_can_index_up_to_3_documents(self):
        self.assertTrue(entitlements.can_index_document_for_ai(self.free))
        self._index_n_documents(self.free, 3)
        self.assertFalse(entitlements.can_index_document_for_ai(self.free))
        block = entitlements.ai_index_gate(self.free)
        self.assertIsNotNone(block)
        self.assertEqual(block["reason"], "ai_index_limit_exceeded")

    def test_pro_can_index_well_past_the_free_cap(self):
        self._index_n_documents(self.pro, 10)  # far above Free's 3, below Pro's 300
        self.assertTrue(entitlements.can_index_document_for_ai(self.pro))
        self.assertIsNone(entitlements.ai_index_gate(self.pro))
