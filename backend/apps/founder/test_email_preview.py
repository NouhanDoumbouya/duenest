from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(
    FOUNDER_ALLOW_ALL_STAFF=True,
    EMAIL_CONFIGURED=True,
    DEFAULT_FROM_EMAIL="no-reply@duenest.test",
)
class EmailPreviewTests(APITestCase):
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

    def test_preview_requires_founder(self):
        self.client.force_authenticate(self.member)
        resp = self.client.post(
            "/api/v1/founder/email-preview/", {"key": "invite"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_preview_renders_draft_body(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.post(
            "/api/v1/founder/email-preview/",
            {"key": "billing_trial_ending", "body": "UNIQUE_DRAFT_LINE"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("UNIQUE_DRAFT_LINE", resp.data["html"])
        self.assertIn("<", resp.data["html"])  # rendered HTML

    def test_preview_unknown_key(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.post(
            "/api/v1/founder/email-preview/", {"key": "nope"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_test_send_emails_founder_even_if_disabled(self):
        from apps.founder.models import TransactionalEmailSetting

        TransactionalEmailSetting.objects.create(
            key="billing_refund", name="Refund", enabled=False
        )
        self.client.force_authenticate(self.founder)
        resp = self.client.post(
            "/api/v1/founder/email-settings/billing_refund/test-send/",
            {"subject": "Draft subject"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["f@example.com"])
        self.assertTrue(mail.outbox[0].subject.startswith("[Test]"))

    def test_test_send_unknown_key(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.post(
            "/api/v1/founder/email-settings/nope/test-send/", {}, format="json"
        )
        self.assertEqual(resp.status_code, 404)
