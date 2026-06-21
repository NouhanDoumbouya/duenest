"""Tests for the opt-in weekly AI briefing digest command."""

from __future__ import annotations

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.notifications.models import EmailLog, NotificationPreference

User = get_user_model()

_CONFIGURED = dict(AI_CONFIGURED=True, EMAIL_CONFIGURED=True)

_BRIEFING = {
    "available": True,
    "reason": "ok",
    "summary": "One thing to do.",
    "items": [
        {
            "title": "Renew passport",
            "detail": "Expires in 20 days.",
            "urgency": "high",
            "action_label": "Renew now",
            "document_id": 1,
            "document_title": "UK Passport",
        }
    ],
    "attention_count": 1,
}


def _run(**kw):
    out = StringIO()
    call_command("send_ai_digests", stdout=out, **kw)
    return out.getvalue()


def _patches(briefing=_BRIEFING, flag=True, send=True):
    return (
        mock.patch("apps.documents.ai_briefing.build_briefing", return_value=briefing),
        mock.patch("apps.features.flags.is_feature_enabled", return_value=flag),
        mock.patch("common.email.send_branded_email", return_value=send),
    )


class SendAiDigestsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )
        NotificationPreference.objects.create(
            user=self.user, ai_briefing_digest_enabled=True, email_enabled=True
        )

    @override_settings(AI_CONFIGURED=False, EMAIL_CONFIGURED=True)
    def test_noop_when_ai_unconfigured(self):
        with mock.patch("apps.documents.ai_briefing.build_briefing") as b:
            out = _run()
        self.assertIn("AI not configured", out)
        b.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_sends_to_opted_in_user_with_items(self):
        b, f, send = _patches()
        with b, f, send as send_mock:
            out = _run()
        send_mock.assert_called_once()
        _, kwargs = send_mock.call_args
        self.assertEqual(kwargs["email_type"], "ai_briefing_digest")
        self.assertEqual(kwargs["category"], "lifecycle")
        self.assertEqual(kwargs["to"], "u@x.com")
        self.assertIn("sent=1", out)

    @override_settings(**_CONFIGURED)
    def test_not_opted_in_is_skipped(self):
        NotificationPreference.objects.filter(user=self.user).update(
            ai_briefing_digest_enabled=False
        )
        b, f, send = _patches()
        with b, f, send as send_mock:
            _run()
        send_mock.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_flag_off_is_skipped(self):
        b, f, send = _patches(flag=False)
        with b, f, send as send_mock:
            _run()
        send_mock.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_no_items_is_skipped(self):
        b, f, send = _patches(briefing={**_BRIEFING, "items": []})
        with b, f, send as send_mock:
            _run()
        send_mock.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_dedupe_skips_recent_recipient(self):
        EmailLog.objects.create(
            email_type="ai_briefing_digest",
            category="lifecycle",
            recipient="u@x.com",
            subject="Your DueNest weekly briefing",
            status="sent",
        )
        b, f, send = _patches()
        with b, f, send as send_mock:
            _run()
        send_mock.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_old_log_does_not_dedupe(self):
        log = EmailLog.objects.create(
            email_type="ai_briefing_digest",
            category="lifecycle",
            recipient="u@x.com",
            subject="old",
            status="sent",
        )
        EmailLog.objects.filter(pk=log.pk).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        b, f, send = _patches()
        with b, f, send as send_mock:
            _run()
        send_mock.assert_called_once()

    @override_settings(**_CONFIGURED)
    def test_dry_run_does_not_send(self):
        b, f, send = _patches()
        with b, f, send as send_mock:
            out = _run(dry_run=True)
        send_mock.assert_not_called()
        self.assertIn("dry-run", out)
