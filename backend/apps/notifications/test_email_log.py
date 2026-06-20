from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from common.email import is_suppressed, send_branded_email

from .models import EmailLog, SuppressedEmail

User = get_user_model()


@override_settings(EMAIL_CONFIGURED=True, DEFAULT_FROM_EMAIL="no-reply@duenest.test")
class EmailSuppressionLogTests(APITestCase):
    def test_is_suppressed_scopes(self):
        SuppressedEmail.objects.create(email="all@x.com", scope="all")
        SuppressedEmail.objects.create(email="mk@x.com", scope="marketing")
        # all-scope blocks every category (case-insensitive)
        self.assertTrue(is_suppressed("all@x.com", "transactional"))
        self.assertTrue(is_suppressed("ALL@x.com", "lifecycle"))
        # marketing-scope blocks only non-essential mail
        self.assertFalse(is_suppressed("mk@x.com", "transactional"))
        self.assertTrue(is_suppressed("mk@x.com", "marketing"))
        self.assertTrue(is_suppressed("mk@x.com", "lifecycle"))
        self.assertFalse(is_suppressed("none@x.com", "marketing"))

    def test_send_logs_sent(self):
        ok = send_branded_email(
            subject="Hi",
            template="waitlist_confirmation",
            context={"email_body": "hello"},
            to="a@b.com",
            email_type="waitlist_confirmation",
        )
        self.assertTrue(ok)
        self.assertEqual(len(mail.outbox), 1)
        log = EmailLog.objects.get()
        self.assertEqual(log.status, "sent")
        self.assertEqual(log.email_type, "waitlist_confirmation")
        self.assertEqual(log.recipient, "a@b.com")

    def test_all_suppression_skips_and_logs(self):
        SuppressedEmail.objects.create(email="dead@x.com", scope="all")
        ok = send_branded_email(
            subject="Hi",
            template="waitlist_confirmation",
            context={"email_body": "x"},
            to="dead@x.com",
            email_type="waitlist_confirmation",
        )
        self.assertFalse(ok)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(EmailLog.objects.get().status, "suppressed")

    def test_marketing_suppression_still_allows_transactional(self):
        SuppressedEmail.objects.create(email="u@x.com", scope="marketing")
        ok = send_branded_email(
            subject="Receipt",
            template="waitlist_confirmation",
            context={"email_body": "x"},
            to="u@x.com",
            email_type="payment_receipt",
            category="transactional",
        )
        self.assertTrue(ok)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(EmailLog.objects.get().status, "sent")

    def test_attachment_is_sent(self):
        ok = send_branded_email(
            subject="With PDF",
            template="waitlist_confirmation",
            context={"email_body": "x"},
            to="a@b.com",
            email_type="payment_receipt",
            attachments=[("r.pdf", b"%PDF-1.4 test", "application/pdf")],
        )
        self.assertTrue(ok)
        self.assertEqual(len(mail.outbox[0].attachments), 1)


@override_settings(FOUNDER_ALLOW_ALL_STAFF=True)
class FounderEmailAnalyticsTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            username="f",
            email="f@example.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )
        self.member = User.objects.create_user(
            username="m", email="m@example.com", password="StrongPassword123!DN"
        )

    def test_requires_founder(self):
        self.client.force_authenticate(self.member)
        resp = self.client.get("/api/v1/founder/email-analytics/")
        self.assertEqual(resp.status_code, 403)

    def test_returns_counts_with_masked_recipients(self):
        EmailLog.objects.create(
            email_type="payment_receipt", recipient="alice@b.com", status="sent"
        )
        EmailLog.objects.create(
            email_type="invite", recipient="bob@d.com", status="failed"
        )
        SuppressedEmail.objects.create(email="dead@x.com", scope="all")
        self.client.force_authenticate(self.founder)
        resp = self.client.get("/api/v1/founder/email-analytics/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 2)
        self.assertEqual(resp.data["by_status"].get("sent"), 1)
        self.assertEqual(resp.data["by_status"].get("failed"), 1)
        self.assertEqual(resp.data["suppressed_total"], 1)
        for entry in resp.data["recent"]:
            self.assertIn("***@", entry["recipient"])
