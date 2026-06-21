"""Tests for the conversational assistant (confirm-gated actions)."""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.documents import ai_chat
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


class ChatEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(ai_chat.chat_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_chat.chat_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_chat.chat_enabled(object()))


@override_settings(**_CONFIGURED)
class ChatTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        cls.passport = Document.objects.create(
            owner=cls.user, title="UK Passport", document_type="passport"
        )

    def test_empty_message(self):
        with mock.patch.object(ai_chat, "generate") as gen:
            out = ai_chat.chat(self.user, message="  ")
        self.assertEqual(out["reason"], "empty_message")
        gen.assert_not_called()

    def test_not_configured_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = ai_chat.chat(self.user, message="hi")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_reply_and_actions(self):
        data = {
            "reply": "Your passport is here. Want to renew it?",
            "actions": [
                {"type": "draft", "label": "Draft renewal letter", "goal": "passport renewal"},
                {"type": "open_document", "label": "Open passport", "document_index": 1},
                {"type": "briefing", "label": "What needs attention"},
                {"type": "bogus", "label": "nope"},
            ],
        }
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with mock.patch.object(ai_chat, "generate", gen):
            out = ai_chat.chat(self.user, message="renew my passport")

        self.assertTrue(out["available"])
        types = [a["type"] for a in out["actions"]]
        self.assertEqual(types, ["draft", "open_document", "briefing"])  # bogus dropped
        draft = out["actions"][0]
        self.assertEqual(draft["goal"], "passport renewal")
        open_doc = out["actions"][1]
        self.assertEqual(open_doc["document_id"], self.passport.id)
        self.assertEqual(open_doc["document_title"], "UK Passport")

    def test_open_document_with_unresolvable_index_dropped(self):
        data = {
            "reply": "x",
            "actions": [{"type": "open_document", "label": "Open", "document_index": 999}],
        }
        with mock.patch.object(
            ai_chat, "generate", mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        ):
            out = ai_chat.chat(self.user, message="x")
        self.assertEqual(out["actions"], [])

    def test_history_included_in_prompt(self):
        gen = mock.Mock(
            return_value=AIResult(ok=True, data={"reply": "ok", "actions": []}, reason="ok")
        )
        with mock.patch.object(ai_chat, "generate", gen):
            ai_chat.chat(
                self.user,
                message="and the expiry?",
                history=[{"role": "user", "content": "tell me about my passport"}],
            )
        _, kwargs = gen.call_args
        self.assertIn("tell me about my passport", kwargs["prompt"])

    def test_failed_model_call_reported(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with mock.patch.object(ai_chat, "generate", gen):
            out = ai_chat.chat(self.user, message="hi")
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")


class AiChatEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("document-ai-chat")

    def test_flag_off_returns_503(self):
        resp = self.client.post(self.url, {"message": "hi"}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_missing_message_is_400(self):
        with _flags(True):
            resp = self.client.post(self.url, {"message": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_reply(self):
        payload = {"available": True, "reason": "ok", "reply": "Hi!", "actions": []}
        with _flags(True), mock.patch(
            "apps.documents.ai_chat.chat", return_value=payload
        ):
            resp = self.client.post(self.url, {"message": "hello"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["reply"], "Hi!")
