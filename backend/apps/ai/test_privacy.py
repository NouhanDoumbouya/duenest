"""Tests for AI consent + privacy (redaction) controls."""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai import privacy
from apps.ai.models import AiPreference

User = get_user_model()


class RedactPiiTests(SimpleTestCase):
    def test_masks_email_and_long_numbers(self):
        out = privacy.redact_pii("Email a@b.com passport 123456789 ok")
        self.assertNotIn("a@b.com", out)
        self.assertNotIn("123456789", out)
        self.assertIn("[redacted-email]", out)
        self.assertIn("[redacted-number]", out)

    def test_keeps_short_numbers_and_plain_text(self):
        out = privacy.redact_pii("Expires in 20 days; type passport")
        self.assertIn("20", out)
        self.assertIn("passport", out)

    def test_handles_empty(self):
        self.assertEqual(privacy.redact_pii(""), "")


class ConsentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )

    def test_not_consented_without_preference(self):
        self.assertFalse(privacy.ai_consented(self.user))

    def test_consent_reflects_preference(self):
        pref = AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.assertTrue(privacy.ai_consented(self.user))
        pref.ai_enabled = False
        pref.save()
        self.assertFalse(privacy.ai_consented(self.user))

    def test_maybe_redact_respects_privacy_mode(self):
        AiPreference.objects.create(
            user=self.user, ai_enabled=True, redact_sensitive=False
        )
        self.assertEqual(privacy.maybe_redact(self.user, "id 123456789"), "id 123456789")
        AiPreference.objects.filter(user=self.user).update(redact_sensitive=True)
        self.assertIn("[redacted-number]", privacy.maybe_redact(self.user, "id 123456789"))

    def test_anonymous_never_consented(self):
        self.assertFalse(privacy.ai_consented(None))


class AiPreferenceEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("ai-preferences")

    @override_settings(AI_CONFIGURED=True)
    def test_get_defaults_off_with_disclosure(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["ai_enabled"])
        self.assertTrue(resp.data["ai_available"])
        self.assertIn("disclosure", resp.data)
        self.assertFalse(resp.data["disclosure"]["used_for_training"])

    def test_put_enables_and_stamps_consent(self):
        resp = self.client.put(self.url, {"ai_enabled": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["ai_enabled"])
        pref = AiPreference.objects.get(user=self.user)
        self.assertTrue(pref.ai_enabled)
        self.assertIsNotNone(pref.consented_at)

    def test_put_toggles_privacy_mode(self):
        self.client.put(self.url, {"ai_enabled": True}, format="json")
        resp = self.client.put(self.url, {"redact_sensitive": True}, format="json")
        self.assertTrue(resp.data["redact_sensitive"])


@override_settings(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
)
class ConsentGateOnEndpointTests(APITestCase):
    """An AI endpoint returns consent_required until the user opts in."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="c", email="c@x.com", password="StrongPassword123!DN"
        )
        # Briefing is a Pro feature (migration 0017); this suite isolates the
        # consent gate, so entitle the user to reach past the plan gate.
        from apps.billing.models import Plan, UserSubscription

        UserSubscription.objects.create(
            user=self.user, plan=Plan.objects.get(key="pro"),
            provider="manual", status="active", billing_interval="month",
        )
        self.client.force_authenticate(self.user)

    def test_briefing_requires_consent(self):
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=True):
            resp = self.client.post(reverse("document-ai-briefing"), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "consent_required")

    def test_briefing_proceeds_after_consent(self):
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        payload = {"available": True, "reason": "ok", "summary": "ok", "items": [], "attention_count": 0}
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=True), \
            mock.patch("apps.documents.ai_briefing.build_briefing", return_value=payload):
            resp = self.client.post(reverse("document-ai-briefing"), {}, format="json")
        self.assertTrue(resp.data["available"])
