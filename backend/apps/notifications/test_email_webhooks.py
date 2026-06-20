import base64
import hashlib
import hmac
import json
import time

from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from common.email import send_branded_email

from .email_webhook_views import verify_svix_signature
from .models import EmailLog, SuppressedEmail
from .unsubscribe import make_unsubscribe_token

_SECRET = "whsec_" + base64.b64encode(b"a-test-signing-secret").decode()


def _sign(body: str) -> dict:
    msg_id = "msg_test_1"
    ts = str(int(time.time()))
    signed = f"{msg_id}.{ts}.{body}".encode()
    sig = base64.b64encode(
        hmac.new(base64.b64decode(_SECRET[6:]), signed, hashlib.sha256).digest()
    ).decode()
    return {
        "HTTP_SVIX_ID": msg_id,
        "HTTP_SVIX_TIMESTAMP": ts,
        "HTTP_SVIX_SIGNATURE": f"v1,{sig}",
    }


@override_settings(RESEND_WEBHOOK_SECRET=_SECRET)
class ResendWebhookTests(APITestCase):
    URL = "/api/v1/email/webhook/resend/"

    def test_signature_helper_accepts_valid_rejects_tampered(self):
        body = '{"type":"email.delivered"}'
        h = _sign(body)
        headers = {
            "svix-id": h["HTTP_SVIX_ID"],
            "svix-timestamp": h["HTTP_SVIX_TIMESTAMP"],
            "svix-signature": h["HTTP_SVIX_SIGNATURE"],
        }
        self.assertTrue(verify_svix_signature(_SECRET, headers, body.encode()))
        self.assertFalse(
            verify_svix_signature(_SECRET, headers, b'{"type":"tampered"}')
        )

    def test_bounce_suppresses_and_marks_log(self):
        EmailLog.objects.create(
            email_type="payment_receipt", recipient="dead@x.com", status="sent"
        )
        body = json.dumps(
            {"type": "email.bounced", "data": {"to": ["dead@x.com"]}}
        )
        resp = self.client.post(
            self.URL, data=body, content_type="application/json", **_sign(body)
        )
        self.assertEqual(resp.status_code, 200)
        s = SuppressedEmail.objects.get(email="dead@x.com")
        self.assertEqual(s.scope, "all")
        self.assertEqual(s.reason, "bounce")
        self.assertEqual(EmailLog.objects.get().status, "bounced")

    def test_complaint_suppresses(self):
        body = json.dumps(
            {"type": "email.complained", "data": {"to": ["angry@x.com"]}}
        )
        resp = self.client.post(
            self.URL, data=body, content_type="application/json", **_sign(body)
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            SuppressedEmail.objects.get(email="angry@x.com").reason, "complaint"
        )

    def test_delivered_enriches_log(self):
        log = EmailLog.objects.create(
            email_type="invite", recipient="ok@x.com", status="sent"
        )
        body = json.dumps({"type": "email.delivered", "data": {"to": ["ok@x.com"]}})
        self.client.post(
            self.URL, data=body, content_type="application/json", **_sign(body)
        )
        log.refresh_from_db()
        self.assertEqual(log.status, "delivered")
        self.assertIsNotNone(log.delivered_at)

    def test_bad_signature_rejected(self):
        body = json.dumps({"type": "email.bounced", "data": {"to": ["x@x.com"]}})
        resp = self.client.post(
            self.URL,
            data=body,
            content_type="application/json",
            HTTP_SVIX_ID="x",
            HTTP_SVIX_TIMESTAMP=str(int(time.time())),
            HTTP_SVIX_SIGNATURE="v1,deadbeef",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(SuppressedEmail.objects.exists())

    @override_settings(RESEND_WEBHOOK_SECRET="")
    def test_missing_secret_returns_503(self):
        resp = self.client.post(self.URL, data="{}", content_type="application/json")
        self.assertEqual(resp.status_code, 503)


@override_settings(EMAIL_CONFIGURED=True, DEFAULT_FROM_EMAIL="no-reply@duenest.test")
class UnsubscribeTests(APITestCase):
    def test_valid_token_unsubscribes_marketing_scope(self):
        token = make_unsubscribe_token("u@x.com")
        resp = self.client.post(f"/api/v1/email/unsubscribe/?token={token}")
        self.assertEqual(resp.status_code, 200)
        s = SuppressedEmail.objects.get(email="u@x.com")
        self.assertEqual(s.scope, "marketing")
        self.assertEqual(s.reason, "unsubscribe")

    def test_invalid_token_rejected(self):
        resp = self.client.post("/api/v1/email/unsubscribe/?token=garbage")
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(SuppressedEmail.objects.exists())

    def test_list_unsubscribe_header_on_lifecycle_only(self):
        send_branded_email(
            subject="Lifecycle",
            template="waitlist_confirmation",
            context={"email_body": "x"},
            to="a@b.com",
            email_type="trial_ending",
            category="lifecycle",
        )
        self.assertIn("List-Unsubscribe", mail.outbox[0].extra_headers)

        send_branded_email(
            subject="Receipt",
            template="waitlist_confirmation",
            context={"email_body": "x"},
            to="a@b.com",
            email_type="payment_receipt",
            category="transactional",
        )
        self.assertNotIn("List-Unsubscribe", mail.outbox[1].extra_headers)
