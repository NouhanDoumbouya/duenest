"""Branded billing email tests.

Exercise the webhook-triggered billing emails through the real handler
(`/billing/webhook/stripe/` with the manual provider, which feeds plain-dict
events into the same provider-agnostic processing). Assertions use the locmem
outbox. Idempotency, email-failure isolation, and the dedicated sender are
covered. No secrets, payloads, or card data appear in these emails.
"""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Plan, UserSubscription

User = get_user_model()


@override_settings(
    BILLING_PROVIDER="manual",
    BILLING_TEST_MODE=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class BillingEmailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="b", email="b@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")
        self.sub = UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            provider="manual",
            provider_subscription_id="sub_E",
            provider_customer_id="cus_E",
            status="active",
        )

    def _post(self, event):
        return self.client.post(
            "/api/v1/billing/webhook/stripe/",
            data=json.dumps(event),
            content_type="application/json",
        )

    def _invoice_event(self, event_id, type_, invoice_id="in_E"):
        return {
            "id": event_id,
            "type": type_,
            "data": {
                "object": {
                    "id": invoice_id,
                    "subscription": "sub_E",
                    "customer": "cus_E",
                    "amount_paid": 3000,
                    "currency": "myr",
                    "status": "paid",
                    "hosted_invoice_url": "https://invoice.stripe.test/i/in_E",
                }
            },
        }

    def _subjects(self):
        return [m.subject for m in mail.outbox]

    def _count(self, needle):
        return len([s for s in self._subjects() if needle in s])

    # 1. payment success email is sent once (and dedupes paid/payment_succeeded)
    def test_payment_success_email_sent_once(self):
        resp = self._post(self._invoice_event("evt_p1", "invoice.payment_succeeded"))
        self.assertEqual(resp.data["status"], "processed")
        self.assertEqual(self._count("payment was received"), 1)
        # invoice.paid for the SAME invoice is a different event — must not duplicate.
        self._post(self._invoice_event("evt_p2", "invoice.paid"))
        self.assertEqual(self._count("payment was received"), 1)

    # 2. duplicate webhook (same event id) does not duplicate the email
    def test_duplicate_webhook_does_not_duplicate_email(self):
        self._post(self._invoice_event("evt_dup", "invoice.payment_succeeded"))
        before = len(mail.outbox)
        r2 = self._post(self._invoice_event("evt_dup", "invoice.payment_succeeded"))
        self.assertEqual(r2.data["status"], "ignored")
        self.assertEqual(len(mail.outbox), before)

    # 3. email failure does NOT make the webhook return 500
    def test_email_failure_does_not_500(self):
        with patch(
            "apps.billing.lifecycle_email.send_transactional_email",
            side_effect=Exception("smtp down"),
        ):
            resp = self._post(
                self._invoice_event("evt_fail_email", "invoice.payment_succeeded")
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "processed")

    # 4. failed payment email is triggered
    def test_failed_payment_email_triggered(self):
        self._post(
            {
                "id": "evt_f",
                "type": "invoice.payment_failed",
                "data": {"object": {"id": "in_F", "subscription": "sub_E", "customer": "cus_E"}},
            }
        )
        self.assertEqual(self._count("your CertaNest payment failed"), 1)

    def test_payment_action_required_email_triggered(self):
        self._post(
            {
                "id": "evt_a",
                "type": "invoice.payment_action_required",
                "data": {"object": {"id": "in_A", "subscription": "sub_E", "customer": "cus_E"}},
            }
        )
        self.assertEqual(self._count("confirm your CertaNest payment"), 1)

    # 5. checkout.session.completed sends the activation email
    def test_checkout_completed_sends_activation_email(self):
        self._post(
            {
                "id": "evt_c",
                "type": "checkout.session.completed",
                "data": {
                    "object": {
                        "id": "cs_test_1",
                        "customer": "cus_E",
                        "subscription": "sub_E",
                        "client_reference_id": str(self.user.id),
                    }
                },
            }
        )
        self.assertEqual(self._count("Welcome to CertaNest Pro"), 1)

    # 6. BILLING_FROM_EMAIL overrides the sender when configured
    def test_billing_from_email_used(self):
        with override_settings(
            BILLING_FROM_EMAIL="CertaNest Billing <billing@mail.certanest.com>"
        ):
            self._post(self._invoice_event("evt_from", "invoice.payment_succeeded"))
        msg = next(m for m in mail.outbox if "payment was received" in m.subject)
        self.assertEqual(
            msg.from_email, "CertaNest Billing <billing@mail.certanest.com>"
        )
