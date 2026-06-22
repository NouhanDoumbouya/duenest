"""Tests for the transactional founder email hooks (invite + waitlist)."""

from django.core import mail
from django.test import TestCase, override_settings

from apps.founder.models import (
    InviteCode,
    TransactionalEmailSetting,
    WaitlistEntry,
)
from apps.founder.services import (
    send_invite_email,
    send_waitlist_confirmation_email,
)
from common.transactional_email import send_transactional_email


def _entry(email="recruit@example.com"):
    return WaitlistEntry.objects.create(
        full_name="Recruit Example",
        email=email,
        persona=WaitlistEntry.Persona.FREELANCER,
    )


@override_settings(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <noreply@duenest.app>",
    FRONTEND_APP_URL="https://app.duenest.test",
)
class FounderEmailSendingTests(TestCase):
    def test_invite_email_includes_code_and_link(self):
        invite = InviteCode.objects.create(code="DN-INVITE-1", label="Test")
        send_invite_email(invite, _entry())
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["recruit@example.com"])
        self.assertIn("DN-INVITE-1", message.body)
        self.assertIn("https://app.duenest.test/invite/DN-INVITE-1", message.body)

    def test_waitlist_confirmation_email_sends(self):
        send_waitlist_confirmation_email(_entry("hi@example.com"))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["hi@example.com"])


@override_settings(EMAIL_CONFIGURED=False)
class FounderEmailDeferredTests(TestCase):
    """When no provider is configured the hooks log and skip — never send."""

    def test_invite_email_deferred_when_not_configured(self):
        invite = InviteCode.objects.create(code="DN-INVITE-2", label="Test")
        send_invite_email(invite, _entry())
        self.assertEqual(len(mail.outbox), 0)

    def test_waitlist_email_deferred_when_not_configured(self):
        send_waitlist_confirmation_email(_entry())
        self.assertEqual(len(mail.outbox), 0)


@override_settings(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <noreply@duenest.app>",
)
class TransactionalEmailConfigTests(TestCase):
    """Founder-console overrides: subject/body edits + enabled toggle."""

    def test_subject_and_body_override_applied(self):
        TransactionalEmailSetting.objects.create(
            key="invite",
            name="Private-beta invite",
            subject="Custom invite subject",
            body="Custom invite body line.",
        )
        sent = send_transactional_email(
            "invite",
            context={"invite_url": "https://x.test/invite/AB", "invite_code": "AB"},
            to="a@example.com",
        )
        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Custom invite subject")
        self.assertIn("Custom invite body line.", mail.outbox[0].body)
        # Fixed structural parts (link/code) still render.
        self.assertIn("https://x.test/invite/AB", mail.outbox[0].body)

    def test_disabled_email_is_skipped(self):
        TransactionalEmailSetting.objects.create(
            key="invite", name="Private-beta invite", enabled=False
        )
        sent = send_transactional_email(
            "invite",
            context={"invite_url": "https://x.test/invite/AB", "invite_code": "AB"},
            to="a@example.com",
        )
        self.assertFalse(sent)
        self.assertEqual(len(mail.outbox), 0)

    def test_blank_override_falls_back_to_default(self):
        sent = send_transactional_email(
            "password_reset",
            context={"reset_url": "https://x.test/reset"},
            to="a@example.com",
        )
        self.assertTrue(sent)
        self.assertIn("reset your CertaNest password", mail.outbox[0].body)
