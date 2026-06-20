"""Tests for the AI drafting assistant (Feature #3).

Hermetic: the Anthropic call is mocked; feature flags are patched; endpoint
gating uses the default founder-only visibility for a normal user.
"""

from __future__ import annotations

from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.documents import ai_draft
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


class DraftingEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(ai_draft.drafting_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_draft.drafting_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_draft.drafting_enabled(object()))


@override_settings(**_CONFIGURED)
class DraftTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        cls.passport = Document.objects.create(
            owner=cls.user,
            title="UK Passport",
            document_type="passport",
            reference_number="X1234567",
            expiry_date=date(2030, 1, 1),
        )

    def test_not_configured_is_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = ai_draft.draft(self.user, instructions="write a letter")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_empty_instructions(self):
        with mock.patch.object(ai_draft, "generate") as gen:
            out = ai_draft.draft(self.user, instructions="   ")
        self.assertEqual(out["reason"], "empty_instructions")
        gen.assert_not_called()

    def test_draft_with_grounding(self):
        data = {"subject": "Passport replacement", "body": "Dear Sir/Madam, ..."}
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with mock.patch.object(ai_draft, "generate", gen):
            out = ai_draft.draft(
                self.user,
                instructions="request a replacement passport",
                document_ids=[self.passport.id],
                tone="formal",
            )
        self.assertTrue(out["available"])
        self.assertEqual(out["subject"], "Passport replacement")
        self.assertEqual(out["used_document_ids"], [self.passport.id])
        # the document's real values were put in the prompt for grounding
        _, kwargs = gen.call_args
        self.assertIn("UK Passport", kwargs["prompt"])
        self.assertIn("X1234567", kwargs["prompt"])

    def test_other_users_documents_are_not_grounded(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        secret = Document.objects.create(owner=other, title="Secret Other Doc")
        gen = mock.Mock(
            return_value=AIResult(ok=True, data={"subject": "x", "body": "y"}, reason="ok")
        )
        with mock.patch.object(ai_draft, "generate", gen):
            out = ai_draft.draft(
                self.user, instructions="write something", document_ids=[secret.id]
            )
        self.assertEqual(out["used_document_ids"], [])
        _, kwargs = gen.call_args
        self.assertNotIn("Secret Other Doc", kwargs["prompt"])

    def test_invalid_tone_falls_back(self):
        gen = mock.Mock(
            return_value=AIResult(ok=True, data={"subject": "s", "body": "b"}, reason="ok")
        )
        with mock.patch.object(ai_draft, "generate", gen):
            out = ai_draft.draft(self.user, instructions="hi", tone="sarcastic")
        self.assertTrue(out["available"])
        _, kwargs = gen.call_args
        self.assertIn("Tone: formal", kwargs["prompt"])

    def test_failed_model_call_is_reported(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with mock.patch.object(ai_draft, "generate", gen):
            out = ai_draft.draft(self.user, instructions="hi")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")


class DocumentDraftEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("document-draft")

    def test_flag_off_returns_503(self):
        resp = self.client.post(self.url, {"instructions": "hi"}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_missing_instructions_is_400(self):
        with _flags(True):
            resp = self.client.post(self.url, {"instructions": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_draft(self):
        payload = {
            "available": True,
            "reason": "ok",
            "subject": "Hello",
            "body": "Body text.",
            "used_document_ids": [],
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_draft.draft", return_value=payload
        ):
            resp = self.client.post(
                self.url, {"instructions": "write a note"}, format="json"
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
        self.assertEqual(resp.data["subject"], "Hello")
