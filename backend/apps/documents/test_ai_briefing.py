"""Tests for the Proactive Autopilot AI briefing."""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.documents import ai_briefing
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


class BriefingEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(ai_briefing.briefing_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_briefing.briefing_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_briefing.briefing_enabled(object()))


@override_settings(**_CONFIGURED)
class BuildBriefingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        today = timezone.localdate()
        # Expiring soon -> needs attention.
        cls.passport = Document.objects.create(
            owner=cls.user,
            title="UK Passport",
            document_type="passport",
            expiry_date=today + timedelta(days=20),
        )

    def test_not_configured_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = ai_briefing.build_briefing(self.user)
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_no_attention_returns_positive_without_model_call(self):
        empty = User.objects.create_user(
            username="caughtup", email="c@x.com", password="StrongPassword123!DN"
        )
        with mock.patch.object(ai_briefing, "generate") as gen:
            out = ai_briefing.build_briefing(empty)
        self.assertTrue(out["available"])
        self.assertEqual(out["items"], [])
        self.assertEqual(out["attention_count"], 0)
        gen.assert_not_called()

    def test_briefing_maps_items_to_documents(self):
        data = {
            "summary": "One thing to handle.",
            "items": [
                {
                    "index": 1,
                    "title": "Renew your passport",
                    "detail": "It expires in 20 days.",
                    "urgency": "high",
                    "action_label": "Renew now",
                }
            ],
        }
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with mock.patch.object(ai_briefing, "generate", gen):
            out = ai_briefing.build_briefing(self.user)

        self.assertTrue(out["available"])
        self.assertEqual(out["attention_count"], 1)
        item = out["items"][0]
        self.assertEqual(item["document_id"], self.passport.id)
        self.assertEqual(item["document_title"], "UK Passport")
        self.assertEqual(item["urgency"], "high")
        # the real computed signal was sent to the model
        _, kwargs = gen.call_args
        self.assertIn("days_until_expiry=20", kwargs["prompt"])

    def test_invalid_urgency_clamped(self):
        data = {
            "summary": "x",
            "items": [{"index": 1, "title": "T", "detail": "d", "urgency": "nuclear", "action_label": "a"}],
        }
        with mock.patch.object(
            ai_briefing, "generate", mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        ):
            out = ai_briefing.build_briefing(self.user)
        self.assertEqual(out["items"][0]["urgency"], "medium")

    def test_failed_model_call_reported(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with mock.patch.object(ai_briefing, "generate", gen):
            out = ai_briefing.build_briefing(self.user)
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")

    def test_other_users_documents_not_included(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        Document.objects.create(
            owner=other,
            title="Other Passport",
            expiry_date=timezone.localdate() + timedelta(days=5),
        )
        gen = mock.Mock(
            return_value=AIResult(ok=True, data={"summary": "x", "items": []}, reason="ok")
        )
        with mock.patch.object(ai_briefing, "generate", gen):
            ai_briefing.build_briefing(self.user)
        _, kwargs = gen.call_args
        self.assertNotIn("Other Passport", kwargs["prompt"])
        self.assertIn("UK Passport", kwargs["prompt"])


class AiBriefingEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.url = reverse("document-ai-briefing")

    def test_flag_off_returns_503(self):
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 503)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_briefing(self):
        payload = {
            "available": True,
            "reason": "ok",
            "summary": "All caught up.",
            "items": [],
            "attention_count": 0,
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_briefing.build_briefing", return_value=payload
        ):
            resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
