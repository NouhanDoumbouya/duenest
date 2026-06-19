"""Tests for the transactional founder email hooks (invite + waitlist)."""

from django.core import mail
from django.test import TestCase, override_settings

from apps.founder.models import InviteCode, WaitlistEntry
from apps.founder.services import (
    send_invite_email,
    send_waitlist_confirmation_email,
)


def _entry(email="recruit@example.com"):
    return WaitlistEntry.objects.create(
        full_name="Recruit Example",
        email=email,
        persona=WaitlistEntry.Persona.FREELANCER,
    )


@override_settings(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="DueNest <noreply@duenest.app>",
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
