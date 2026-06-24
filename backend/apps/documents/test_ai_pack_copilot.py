"""Tests for the Application Pack Copilot (flagship AI feature).

Hermetic: the Anthropic call is mocked; flags are patched; expiry-vs-deadline
math is verified against real stored dates (computed in Python, not the model).
"""

from __future__ import annotations

from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.documents import ai_pack_copilot as copilot
from apps.documents.models import Document

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
)


def _flags(value: bool):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


class CopilotEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(copilot.pack_copilot_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(copilot.pack_copilot_enabled(object()))
        with _flags(False):
            self.assertFalse(copilot.pack_copilot_enabled(object()))


@override_settings(**_CONFIGURED)
class AnalyzeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        cls.passport = Document.objects.create(
            owner=cls.user,
            title="UK Passport",
            document_type="passport",
            expiry_date=date(2026, 3, 1),  # expires before the deadline below
        )

    def _model(self, requirements, summary="You're close."):
        data = {"summary": summary, "requirements": requirements}
        return mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))

    def test_not_configured_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = copilot.analyze(self.user, goal="UK visa")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_empty_goal(self):
        with mock.patch.object(copilot, "generate") as gen:
            out = copilot.analyze(self.user, goal="   ")
        self.assertEqual(out["reason"], "empty_goal")
        gen.assert_not_called()

    def test_requirements_and_match_mapping(self):
        reqs = [
            {
                "name": "Valid passport",
                "description": "A current passport.",
                "status": "have",
                "matched_document_indexes": [1],
            },
            {
                "name": "Bank statements",
                "description": "Recent statements.",
                "status": "missing",
                "matched_document_indexes": [],
            },
        ]
        with mock.patch.object(copilot, "generate", self._model(reqs)):
            out = copilot.analyze(
                self.user, goal="UK Skilled Worker visa", deadline="2026-09-01"
            )

        self.assertTrue(out["available"])
        self.assertEqual(out["have_count"], 1)
        self.assertEqual(out["missing_count"], 1)
        passport_req = out["requirements"][0]
        self.assertEqual(passport_req["status"], "have")
        self.assertEqual(passport_req["documents"][0]["title"], "UK Passport")
        # real expiry (2026-03-01) is before the deadline (2026-09-01)
        self.assertTrue(passport_req["documents"][0]["expires_before_deadline"])

    def test_no_expiry_flag_without_deadline(self):
        reqs = [
            {
                "name": "Valid passport",
                "description": "x",
                "status": "have",
                "matched_document_indexes": [1],
            }
        ]
        with mock.patch.object(copilot, "generate", self._model(reqs)):
            out = copilot.analyze(self.user, goal="UK visa")  # no deadline
        self.assertFalse(out["requirements"][0]["documents"][0]["expires_before_deadline"])

    def test_have_without_owned_document_downgrades_to_unclear(self):
        # The model claims 'have' but cites an index that isn't the user's doc.
        reqs = [
            {
                "name": "Mystery doc",
                "description": "x",
                "status": "have",
                "matched_document_indexes": [999],
            }
        ]
        with mock.patch.object(copilot, "generate", self._model(reqs)):
            out = copilot.analyze(self.user, goal="UK visa")
        self.assertEqual(out["requirements"][0]["status"], "unclear")
        self.assertEqual(out["requirements"][0]["documents"], [])

    def test_failed_model_call_is_reported(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with mock.patch.object(copilot, "generate", gen):
            out = copilot.analyze(self.user, goal="UK visa")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")

    def test_owner_scoping(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        Document.objects.create(owner=other, title="Secret Other Doc")
        reqs = [{"name": "x", "description": "y", "status": "missing", "matched_document_indexes": []}]
        gen = self._model(reqs)
        with mock.patch.object(copilot, "generate", gen):
            copilot.analyze(self.user, goal="UK visa")
        _, kwargs = gen.call_args
        self.assertNotIn("Secret Other Doc", kwargs["prompt"])
        self.assertIn("UK Passport", kwargs["prompt"])


class PackCopilotEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        # Pack Copilot is a Pro AI feature. Grant Pro so the endpoint path under
        # test isn't blocked by the AI plan gate.
        from apps.billing.models import Plan, UserSubscription

        UserSubscription.objects.create(
            user=self.user, plan=Plan.objects.get(key="pro"),
            provider="manual", status="active", billing_interval="month",
        )
        self.client.force_authenticate(self.user)
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.url = reverse("document-pack-copilot")

    def test_flag_off_returns_503(self):
        resp = self.client.post(self.url, {"goal": "UK visa"}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_missing_goal_is_400(self):
        with _flags(True):
            resp = self.client.post(self.url, {"goal": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_analysis(self):
        payload = {
            "available": True,
            "reason": "ok",
            "goal": "UK visa",
            "deadline": None,
            "summary": "ok",
            "requirements": [],
            "document_count": 0,
            "have_count": 0,
            "missing_count": 0,
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_pack_copilot.analyze", return_value=payload
        ):
            resp = self.client.post(self.url, {"goal": "UK visa"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
