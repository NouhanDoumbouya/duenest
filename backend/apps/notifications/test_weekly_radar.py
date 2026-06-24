"""
Weekly Radar Email V1 — deterministic weekly summary.

Hermetic: email uses Django's in-memory backend; no real mail is sent and no AI
is ever called. Covers context building (empty + populated: expiring docs,
deadlines, incomplete packs, applications, Magic Inbox), sensitive-data safety
(no file URLs / ID numbers), eligibility (opt-in / inactive / no-email / dedupe),
HTML + text rendering, the send path + subject/body, dry-run, batch resilience,
and the no-AI / no-credit guarantees.
"""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentReminderRule,
    MagicInboxItem,
    TrackedApplication,
)
from apps.notifications import weekly_radar as wr
from apps.notifications.models import EmailLog, NotificationPreference

User = get_user_model()

_EMAIL = dict(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <no-reply@certanest.test>",
    DUENEST_APP_BASE_URL="https://app.certanest.test",
)


def _today():
    return timezone.now().date()


def _opt_in(user, **extra):
    return NotificationPreference.objects.create(
        user=user, weekly_radar_email_enabled=True, email_enabled=True, **extra
    )


class ContextTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="c", email="c@x.com", password="StrongPass123!DN",
            first_name="Jane",
        )

    def test_context_builds_for_empty_user(self):
        ctx = wr.build_weekly_radar_context(self.user)
        self.assertIn("subject", ctx)
        self.assertFalse(ctx["has_attention"])
        self.assertEqual(ctx["top_priorities"], [])
        self.assertEqual(ctx["subject"], "Your CertaNest Weekly Radar")
        self.assertIn("/dashboard", ctx["next_action"]["url"])

    def test_context_includes_expiring_documents(self):
        Document.objects.create(
            owner=self.user, title="Passport", document_type="passport",
            expiry_date=_today() + timedelta(days=5),
        )
        ctx = wr.build_weekly_radar_context(self.user)
        self.assertTrue(ctx["has_attention"])
        titles = [p["title"] for p in ctx["top_priorities"]]
        self.assertIn("Passport", titles)

    def test_context_includes_upcoming_deadlines(self):
        doc = Document.objects.create(
            owner=self.user, title="Visa", expiry_date=_today() + timedelta(days=6),
        )
        DocumentReminderRule.objects.create(
            owner=self.user, document=doc,
            trigger_type=DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
            days_before=3, is_enabled=True,
        )
        ctx = wr.build_weekly_radar_context(self.user)
        self.assertTrue(ctx["has_attention"])
        # A deadline within the urgent window contributes to the urgent subject.
        self.assertGreaterEqual(ctx["urgent_count"], 1)

    def test_context_includes_incomplete_packs(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        DocumentBundleRequirement.objects.create(
            owner=self.user, bundle=bundle, title="Transcript", is_required=True,
            status=DocumentBundleRequirement.Status.MISSING,
        )
        ctx = wr.build_weekly_radar_context(self.user)
        joined = " ".join(p["title"] + p["detail"] for p in ctx["top_priorities"])
        self.assertIn("Scholarship Pack", joined)

    def test_context_includes_applications_needing_attention(self):
        TrackedApplication.objects.create(
            owner=self.user, title="PhD Application",
            status=TrackedApplication.Status.READY_TO_SUBMIT,
            deadline_date=_today() + timedelta(days=2),
        )
        ctx = wr.build_weekly_radar_context(self.user)
        joined = " ".join(p["title"] for p in ctx["top_priorities"])
        self.assertIn("Applications need attention", joined)

    def test_context_includes_magic_inbox_needs_review(self):
        MagicInboxItem.objects.create(
            owner=self.user, item_type="text", title="Scholarship email",
            pasted_text="x", status=MagicInboxItem.Status.ANALYZED,
        )
        ctx = wr.build_weekly_radar_context(self.user)
        joined = " ".join(p["title"] for p in ctx["top_priorities"])
        self.assertIn("Magic Inbox", joined)

    def test_context_excludes_sensitive_data(self):
        # A document whose number-bearing fields must never reach the email.
        Document.objects.create(
            owner=self.user, title="Passport", document_type="passport",
            reference_number="SECRET-PASSPORT-999",
            expiry_date=_today() + timedelta(days=5),
        )
        rendered = wr.render_weekly_radar_email(self.user)
        blob = (rendered["html"] + rendered["text"]).lower()
        self.assertNotIn("secret-passport-999", blob)
        for marker in ("/media/", "x-amz", "r2.cloudflarestorage", "amazonaws"):
            self.assertNotIn(marker, blob)


class RenderTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="r", email="r@x.com", password="StrongPass123!DN",
        )
        Document.objects.create(
            owner=self.user, title="Passport", expiry_date=_today() + timedelta(days=4),
        )

    def test_html_email_renders(self):
        rendered = wr.render_weekly_radar_email(self.user)
        self.assertIn("Weekly Radar", rendered["html"])
        self.assertIn("Passport", rendered["html"])
        self.assertIn("</html>", rendered["html"].lower())

    def test_plain_text_email_renders(self):
        rendered = wr.render_weekly_radar_email(self.user)
        self.assertIn("Weekly Radar", rendered["text"])
        self.assertIn("Passport", rendered["text"])
        self.assertIn("Manage notification preferences", rendered["text"])


@override_settings(**_EMAIL)
class EligibilityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="e", email="e@x.com", password="StrongPass123!DN",
        )

    def test_opted_in_user_is_eligible(self):
        _opt_in(self.user)
        self.assertTrue(wr.should_send_weekly_radar(self.user))

    def test_disabled_preference_not_eligible(self):
        _opt_in(self.user)
        NotificationPreference.objects.filter(user=self.user).update(
            weekly_radar_email_enabled=False
        )
        self.assertFalse(wr.should_send_weekly_radar(self.user))

    def test_no_preference_row_not_eligible(self):
        self.assertFalse(wr.should_send_weekly_radar(self.user))

    def test_inactive_user_not_eligible(self):
        _opt_in(self.user)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertFalse(wr.should_send_weekly_radar(self.user))

    def test_user_without_email_not_eligible(self):
        self.user.email = ""
        self.user.save(update_fields=["email"])
        _opt_in(self.user)
        self.assertFalse(wr.should_send_weekly_radar(self.user))

    def test_duplicate_send_prevented_by_recent_emaillog(self):
        _opt_in(self.user)
        EmailLog.objects.create(
            email_type=wr.EMAIL_TYPE, category="lifecycle",
            recipient=self.user.email, subject="Your CertaNest Weekly Radar",
            status="sent",
        )
        self.assertFalse(wr.should_send_weekly_radar(self.user))


@override_settings(**_EMAIL)
class SendTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="s", email="s@x.com", password="StrongPass123!DN",
        )
        _opt_in(self.user)
        Document.objects.create(
            owner=self.user, title="Passport", expiry_date=_today() + timedelta(days=3),
        )

    def test_send_calls_provider_with_subject_and_body(self):
        with mock.patch("apps.ai.client.generate") as g:
            result = wr.send_weekly_radar_email(self.user)
        self.assertEqual(result["status"], "sent")
        g.assert_not_called()                       # deterministic — no AI
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["s@x.com"])
        self.assertIn("CertaNest", msg.subject)
        self.assertIn("Passport", msg.body)         # plain-text body
        # An EmailLog "sent" row was recorded (enables dedupe).
        self.assertTrue(EmailLog.objects.filter(
            email_type=wr.EMAIL_TYPE, status="sent", recipient__iexact="s@x.com"
        ).exists())

    def test_dry_run_does_not_send(self):
        result = wr.send_weekly_radar_email(self.user, dry_run=True)
        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(len(mail.outbox), 0)

    def test_ineligible_user_is_skipped(self):
        NotificationPreference.objects.filter(user=self.user).update(
            weekly_radar_email_enabled=False
        )
        result = wr.send_weekly_radar_email(self.user)
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(len(mail.outbox), 0)


@override_settings(**_EMAIL)
class BatchTests(APITestCase):
    def setUp(self):
        self.a = User.objects.create_user(username="a", email="a@x.com", password="P!12345678a")
        self.b = User.objects.create_user(username="b", email="b@x.com", password="P!12345678b")
        _opt_in(self.a)
        _opt_in(self.b)

    def test_batch_sends_to_all_eligible(self):
        summary = wr.send_weekly_radar_batch()
        self.assertEqual(summary["sent"], 2)
        self.assertEqual(len(mail.outbox), 2)

    def test_batch_dry_run_sends_nothing(self):
        summary = wr.send_weekly_radar_batch(dry_run=True)
        self.assertEqual(summary["sent"], 2)         # would-send count
        self.assertEqual(len(mail.outbox), 0)

    def test_batch_continues_after_one_failure(self):
        # First recipient's send raises; the batch must isolate it and continue.
        calls = {"n": 0}

        def _flaky(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("provider boom")
            return True

        with mock.patch("common.email.send_branded_email", side_effect=_flaky):
            summary = wr.send_weekly_radar_batch()
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["sent"], 1)

    def test_batch_makes_no_ai_call(self):
        with mock.patch("apps.ai.client.generate") as g:
            wr.send_weekly_radar_batch()
        g.assert_not_called()

    def test_batch_respects_limit(self):
        summary = wr.send_weekly_radar_batch(limit=1)
        self.assertEqual(summary["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
