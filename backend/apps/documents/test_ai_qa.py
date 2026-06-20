"""Tests for "ask your documents" grounded Q&A (Feature #2).

Hermetic: the Anthropic call is mocked; feature flags are patched; only the
endpoint gating tests touch the flag registry (via the default founder-only
visibility for a normal user).
"""

from __future__ import annotations

from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.documents import ai_qa
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


class QaEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(ai_qa.qa_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_qa.qa_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_qa.qa_enabled(object()))


@override_settings(**_CONFIGURED)
class AnswerQuestionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        Document.objects.create(
            owner=cls.user,
            title="UK Passport",
            document_type="passport",
            reference_number="X1234567",
            expiry_date=date(2030, 1, 1),
        )
        Document.objects.create(
            owner=cls.user,
            title="Car Insurance",
            document_type="insurance",
            expiry_date=date(2026, 9, 1),
        )

    def test_not_configured_is_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = ai_qa.answer_question(self.user, "when does my passport expire?")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_no_documents(self):
        empty = User.objects.create_user(
            username="empty", email="e@x.com", password="StrongPassword123!DN"
        )
        with mock.patch.object(ai_qa, "generate") as gen:
            out = ai_qa.answer_question(empty, "anything?")
        self.assertEqual(out["reason"], "no_documents")
        gen.assert_not_called()  # never call the model with nothing to ground on

    def test_answer_with_citation_mapped_to_document(self):
        data = {
            "answer": "Your UK Passport expires on 1 January 2030.",
            "answered": True,
            "cited_document_indexes": [1],
        }
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with mock.patch.object(ai_qa, "generate", gen):
            out = ai_qa.answer_question(self.user, "passport expiry")

        self.assertTrue(out["available"])
        self.assertTrue(out["answered"])
        self.assertEqual(out["document_count"], 2)
        self.assertEqual(len(out["citations"]), 1)
        # the passport ranks first for "passport expiry", so index 1 maps to it
        self.assertEqual(out["citations"][0]["title"], "UK Passport")
        # only the asking user's documents were grounded on
        _, kwargs = gen.call_args
        self.assertIn("UK Passport", kwargs["prompt"])

    def test_owner_scoping_excludes_other_users(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        Document.objects.create(owner=other, title="Secret Other Doc")
        ctx = ai_qa.gather_context(self.user, "doc")
        titles = {c["title"] for c in ctx}
        self.assertNotIn("Secret Other Doc", titles)

    def test_failed_model_call_is_reported(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with mock.patch.object(ai_qa, "generate", gen):
            out = ai_qa.answer_question(self.user, "passport")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")


class DocumentQAEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("document-ask")

    def test_flag_off_returns_503(self):
        # ai_features / ai_document_qa default founder_only → off for a normal user
        resp = self.client.post(self.url, {"question": "hi"}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_missing_question_is_400(self):
        with _flags(True):
            resp = self.client.post(self.url, {"question": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_answer(self):
        payload = {
            "available": True,
            "reason": "ok",
            "answer": "Found it.",
            "answered": True,
            "citations": [],
            "document_count": 0,
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", return_value=payload
        ):
            resp = self.client.post(self.url, {"question": "x?"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["available"])
        self.assertEqual(resp.data["answer"], "Found it.")
