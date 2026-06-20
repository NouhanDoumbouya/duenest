from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from . import receipts
from .models import InvoiceRecord, Plan, ReceiptSettings, UserSubscription

User = get_user_model()


@override_settings(
    BILLING_PROVIDER="manual",
    BILLING_TEST_MODE=True,
    EMAIL_CONFIGURED=True,
    DEFAULT_FROM_EMAIL="receipts@duenest.test",
    DUENEST_APP_BASE_URL="https://app.duenest.test",
)
class ReceiptServiceTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="r", email="r@example.com", password="StrongPassword123!DN"
        )
        self.pro = Plan.objects.get(key="pro")

    def _enable(self, **kw):
        cfg = ReceiptSettings.load()
        cfg.enabled = True
        for key, value in kw.items():
            setattr(cfg, key, value)
        cfg.save()
        return cfg

    def _make_invoice(self, **kw):
        sub = UserSubscription.objects.create(
            user=self.user,
            plan=self.pro,
            status="active",
            billing_interval="year",
            currency="usd",
            amount=4900,
        )
        return InvoiceRecord.objects.create(
            user=self.user,
            subscription=sub,
            provider_invoice_id=kw.get("provider_invoice_id", "in_test_1"),
            amount_paid=4900,
            currency="usd",
            status="paid",
        )

    def test_format_money(self):
        self.assertEqual(receipts.format_money(4900, "usd"), "$49.00 USD")
        self.assertEqual(receipts.format_money(1000, "jpy"), "¥1,000 JPY")
        self.assertEqual(receipts.format_money(0, "eur"), "€0.00 EUR")
        # Unknown currency falls back to the code with no symbol.
        self.assertEqual(receipts.format_money(500, "zmw"), "5.00 ZMW")

    def test_disabled_sends_nothing(self):
        self.client.force_authenticate(self.user)
        self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "month"},
            format="json",
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_manual_checkout_sends_receipt_when_enabled(self):
        self._enable()
        self.client.force_authenticate(self.user)
        self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "month"},
            format="json",
        )
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn("receipt", msg.subject.lower())
        self.assertEqual(msg.to, ["r@example.com"])
        self.assertEqual(len(msg.attachments), 0)  # link mode → no PDF

    def test_manual_skipped_when_send_for_manual_false(self):
        self._enable(send_for_manual=False)
        self.client.force_authenticate(self.user)
        self.client.post(
            "/api/v1/billing/checkout/",
            {"plan_key": "pro", "interval": "month"},
            format="json",
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_pdf_mode_attaches_pdf(self):
        self._enable(mode=ReceiptSettings.Mode.EMAIL_PDF)
        invoice = self._make_invoice()
        self.assertTrue(receipts.send_receipt_for_invoice(invoice))
        self.assertEqual(len(mail.outbox), 1)
        attachments = mail.outbox[0].attachments
        self.assertEqual(len(attachments), 1)
        name, content, mime = attachments[0]
        self.assertTrue(name.endswith(".pdf"))
        self.assertEqual(mime, "application/pdf")
        self.assertTrue(bytes(content).startswith(b"%PDF"))

    def test_idempotent(self):
        self._enable()
        invoice = self._make_invoice()
        self.assertTrue(receipts.send_receipt_for_invoice(invoice))
        invoice.refresh_from_db()
        self.assertIsNotNone(invoice.receipt_sent_at)
        # A retried webhook must not send a second receipt.
        self.assertFalse(receipts.send_receipt_for_invoice(invoice))
        self.assertEqual(len(mail.outbox), 1)

    def test_not_configured_skips_and_keeps_unsent(self):
        self._enable()
        invoice = self._make_invoice()
        with override_settings(EMAIL_CONFIGURED=False):
            self.assertFalse(receipts.send_receipt_for_invoice(invoice))
        self.assertEqual(len(mail.outbox), 0)
        invoice.refresh_from_db()
        self.assertIsNone(invoice.receipt_sent_at)

    def test_receipt_numbers_are_sequential(self):
        self._enable()
        inv1 = self._make_invoice(provider_invoice_id="in_a")
        receipts.send_receipt_for_invoice(inv1)
        inv1.refresh_from_db()
        self.assertRegex(inv1.receipt_number, r"^DN-\d{4}-00001$")
        inv2 = self._make_invoice(provider_invoice_id="in_b")
        receipts.send_receipt_for_invoice(inv2)
        inv2.refresh_from_db()
        self.assertRegex(inv2.receipt_number, r"^DN-\d{4}-00002$")

    def test_tax_line_split_in_context(self):
        cfg = self._enable()
        invoice = self._make_invoice()
        invoice.tax_amount = 400  # $4.00 of the $49.00
        invoice.save(update_fields=["tax_amount"])
        ctx = receipts.build_receipt_context(invoice, cfg)
        self.assertEqual(ctx["tax_display"], "$4.00 USD")
        self.assertEqual(ctx["subtotal_display"], "$45.00 USD")

    def test_no_tax_line_when_zero(self):
        cfg = self._enable()
        ctx = receipts.build_receipt_context(self._make_invoice(), cfg)
        self.assertEqual(ctx["tax_display"], "")


@override_settings(
    FOUNDER_ALLOW_ALL_STAFF=True,
    EMAIL_CONFIGURED=True,
    DEFAULT_FROM_EMAIL="receipts@duenest.test",
)
class FounderReceiptApiTests(APITestCase):
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

    def test_settings_require_founder(self):
        self.client.force_authenticate(self.member)
        resp = self.client.get("/api/v1/founder/billing/receipts/settings/")
        self.assertEqual(resp.status_code, 403)

    def test_get_and_patch_settings(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.get("/api/v1/founder/billing/receipts/settings/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["enabled"])

        resp = self.client.patch(
            "/api/v1/founder/billing/receipts/settings/",
            {"enabled": True, "mode": "email_pdf"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["enabled"])
        cfg = ReceiptSettings.load()
        self.assertTrue(cfg.enabled)
        self.assertEqual(cfg.mode, "email_pdf")
        self.assertEqual(cfg.updated_by_id, self.founder.id)

    def test_test_send_emails_the_founder(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.post("/api/v1/founder/billing/receipts/test-send/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["f@example.com"])
