"""
Endpoint-level AI plan gating (backend/ai-plan-gating).

Verifies the per-request flow on the Q&A endpoint: plan feature gate, monthly
credit gate, no-spend-on-block, and that consent still gates first. The credit
accounting and model routing are unit-tested in apps.billing.test_ai_credits and
apps.ai.test_routing; the infrastructure budget guard in apps.ai.tests.
"""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.models import AiPreference
from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription

User = get_user_model()

_CONFIGURED = dict(AI_CONFIGURED=True, ANTHROPIC_API_KEY="sk-test")


def _flags(value=True):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _ok_answer():
    return {
        "available": True,
        "reason": "ok",
        "answer": "Found it.",
        "answered": True,
        "citations": [],
        "document_count": 1,
    }


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


@override_settings(**_CONFIGURED)
class QaPlanGatingTests(APITestCase):
    def setUp(self):
        self.free = User.objects.create_user(
            username="g", email="g@x.com", password="StrongPass123!DN"
        )
        AiPreference.objects.create(user=self.free, ai_enabled=True)
        self.client.force_authenticate(self.free)
        self.url = reverse("document-ask")

    def _used(self, user):
        return entitlements.get_ai_credits_used_this_month(user)

    def test_free_blocked_from_whole_vault_multi_doc_qa(self):
        gen = mock.Mock(return_value=_ok_answer())
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", gen
        ):
            resp = self.client.post(self.url, {"question": "x?"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        gen.assert_not_called()  # blocked before any model call
        self.assertEqual(self._used(self.free), 0)  # no credit spent

    def test_free_single_document_qa_works_and_spends_one_credit(self):
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", return_value=_ok_answer()
        ):
            resp = self.client.post(
                self.url, {"question": "x?", "document_id": 123}, format="json"
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
        self.assertEqual(self._used(self.free), 1)

    def test_no_credit_spent_when_provider_is_blocked(self):
        blocked = {"available": False, "reason": "budget"}
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", return_value=blocked
        ):
            resp = self.client.post(
                self.url, {"question": "x?", "document_id": 1}, format="json"
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._used(self.free), 0)  # budget pause never costs a credit

    def test_no_credit_spent_when_consent_missing(self):
        AiPreference.objects.filter(user=self.free).update(ai_enabled=False)
        gen = mock.Mock(return_value=_ok_answer())
        with _flags(True), mock.patch("apps.documents.ai_qa.answer_question", gen):
            resp = self.client.post(
                self.url, {"question": "x?", "document_id": 1}, format="json"
            )
        self.assertEqual(resp.data["reason"], "consent_required")
        gen.assert_not_called()
        self.assertEqual(self._used(self.free), 0)

    def test_free_blocked_after_credits_exhausted(self):
        entitlements.spend_ai_credits(self.free, "document_qa", amount=10)
        gen = mock.Mock(return_value=_ok_answer())
        with _flags(True), mock.patch("apps.documents.ai_qa.answer_question", gen):
            resp = self.client.post(
                self.url, {"question": "x?", "document_id": 1}, format="json"
            )
        self.assertEqual(resp.data["reason"], "ai_credits_exhausted")
        gen.assert_not_called()
        self.assertEqual(self._used(self.free), 10)  # unchanged

    def test_pro_can_run_whole_vault_multi_doc_qa(self):
        _grant_pro(self.free)  # now Pro
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", return_value=_ok_answer()
        ):
            resp = self.client.post(self.url, {"question": "x?"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
        self.assertEqual(self._used(self.free), 5)  # multi_document_qa costs 5


@override_settings(**_CONFIGURED)
class BriefingNoModelNoSpendTests(APITestCase):
    """A deterministic, no-provider-call AI response must not spend a credit."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="b", email="b@x.com", password="StrongPass123!DN"
        )
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        _grant_pro(self.user)  # briefing is a Pro feature
        self.client.force_authenticate(self.user)
        self.url = reverse("document-ai-briefing")

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_all_clear_briefing_makes_no_model_call_and_spends_no_credit(self):
        # No documents -> nothing needs attention -> deterministic "all caught up"
        # briefing with NO Claude call. generate() must never run and 0 credits spend.
        gen = mock.Mock()
        with _flags(True), mock.patch("apps.documents.ai_briefing.generate", gen):
            resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ok")
        self.assertEqual(resp.data["attention_count"], 0)
        self.assertFalse(resp.data.get("model_called", True))
        gen.assert_not_called()  # no provider call happened
        self.assertEqual(self._used(), 0)  # ...so no credit was spent


@override_settings(**_CONFIGURED)
class AutomationAiIsProGatedTests(APITestCase):
    """Pricing (migration 0017): proactive briefing is Pro-only for free users;
    the conversational assistant deliberately stays free (covered by
    apps.documents.test_ai_chat)."""

    def setUp(self):
        self.free = User.objects.create_user(
            username="free-auto", email="fa@x.com", password="StrongPass123!DN"
        )
        AiPreference.objects.create(user=self.free, ai_enabled=True)
        self.client.force_authenticate(self.free)

    def test_free_user_blocked_from_briefing_with_no_model_call(self):
        gen = mock.Mock()
        with _flags(True), mock.patch("apps.documents.ai_briefing.build_briefing", gen):
            resp = self.client.post(reverse("document-ai-briefing"), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        gen.assert_not_called()  # blocked before any briefing work
