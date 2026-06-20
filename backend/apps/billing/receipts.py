"""
Branded subscription receipt emails for DueNest.

A receipt is sent for a successful subscription payment (Stripe ``invoice.paid``
or the manual/dev provider), when a founder has enabled receipts in the founder
console. The format is founder-configurable (:class:`ReceiptSettings.Mode`):

* ``email_link`` — branded email linking to the provider's hosted invoice/PDF
* ``email_pdf``  — branded email with a DueNest-generated PDF attached
* ``email_only`` — branded email, no PDF

Sending is **idempotent** (guarded by ``InvoiceRecord.receipt_sent_at``) because
payment webhooks can be retried, and never raises into billing — callers treat a
receipt failure as non-fatal.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone

from common.email import send_branded_email

from .models import InvoiceRecord, ReceiptSettings

logger = logging.getLogger(__name__)

# Currencies whose smallest unit is the whole unit (no minor digits).
_ZERO_DECIMAL = {
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
    "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
}
_SYMBOLS = {"usd": "$", "eur": "€", "gbp": "£", "jpy": "¥"}


def format_money(minor: int, currency: str) -> str:
    """Format integer minor units into a human amount, e.g. ``$49.00 USD``."""
    cur = (currency or "usd").lower()
    minor = int(minor or 0)
    if cur in _ZERO_DECIMAL:
        major = f"{minor:,}"
    else:
        major = f"{minor / 100:,.2f}"
    symbol = _SYMBOLS.get(cur, "")
    return f"{symbol}{major} {cur.upper()}".strip()


def _is_email_configured() -> bool:
    return bool(getattr(settings, "EMAIL_CONFIGURED", True))


def _app_base() -> str:
    return getattr(
        settings, "DUENEST_APP_BASE_URL", "http://localhost:3000"
    ).rstrip("/")


def _interval_label(value: str) -> str:
    return {
        "month": "Monthly",
        "year": "Yearly",
        "lifetime": "Lifetime",
    }.get((value or "").lower(), "")


def _fmt_date(value) -> str:
    if not value:
        return ""
    return timezone.localtime(value).strftime("%d %b %Y")


def build_receipt_context(invoice: InvoiceRecord, cfg: ReceiptSettings) -> dict:
    """Build the template/PDF context for a paid invoice."""
    sub = invoice.subscription
    plan_name = sub.plan.name if sub and sub.plan_id else "DueNest subscription"
    interval_label = _interval_label(sub.billing_interval) if sub else ""
    period_start = _fmt_date(invoice.period_start or (sub.current_period_start if sub else None))
    period_end = _fmt_date(invoice.period_end or (sub.current_period_end if sub else None))
    period_display = (
        f"{period_start} – {period_end}" if period_start and period_end else ""
    )
    amount = invoice.amount_paid or invoice.amount_due or (sub.amount if sub else 0)
    invoice_url = invoice.hosted_invoice_url or invoice.invoice_pdf_url or ""
    return {
        "subject": f"Your DueNest receipt — {plan_name}",
        "heading": "Thanks for your payment",
        "intro": "Here's the receipt for your DueNest subscription payment.",
        "plan_name": plan_name,
        "interval_label": interval_label,
        "amount_display": format_money(amount, invoice.currency),
        "period_display": period_display,
        "paid_date_display": _fmt_date(invoice.paid_at or timezone.now()),
        "invoice_number": invoice.provider_invoice_id or "",
        "invoice_url": invoice_url,
        "show_invoice_link": cfg.mode == ReceiptSettings.Mode.EMAIL_LINK,
        "has_pdf": cfg.mode == ReceiptSettings.Mode.EMAIL_PDF,
        "manage_billing_url": f"{_app_base()}/dashboard/settings/billing",
        "business_legal_name": cfg.business_legal_name,
        "business_address": cfg.business_address,
        "tax_id": cfg.tax_id,
        "support_email": cfg.support_email,
    }


def build_receipt_pdf(context: dict) -> bytes:
    """Render a one-page, DueNest-branded PDF receipt (pure-Python, fpdf2)."""
    from fpdf import FPDF

    def latin1(text: str) -> str:
        return (str(text) or "").encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF(unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(16, 32, 51)
    pdf.cell(0, 11, "DueNest", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(110, 122, 138)
    pdf.cell(0, 7, "Payment receipt", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    def row(label: str, value: str, *, bold: bool = False, accent: bool = False):
        if not value:
            return
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(110, 122, 138)
        pdf.cell(55, 8, latin1(label))
        pdf.set_font("Helvetica", "B" if bold else "", 12 if bold else 11)
        pdf.set_text_color(15, 118, 110) if accent else pdf.set_text_color(20, 20, 20)
        pdf.cell(0, 8, latin1(value), new_x="LMARGIN", new_y="NEXT")

    row("Plan", f"{context['plan_name']}" + (f" ({context['interval_label']})" if context["interval_label"] else ""))
    row("Billing period", context["period_display"])
    row("Date paid", context["paid_date_display"])
    row("Receipt no.", context["invoice_number"])
    pdf.ln(2)
    row("Amount paid", context["amount_display"], bold=True, accent=True)

    if context.get("business_legal_name") or context.get("business_address") or context.get("tax_id"):
        pdf.ln(10)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(110, 122, 138)
        for line in (
            context.get("business_legal_name"),
            context.get("business_address"),
            (f"Tax ID: {context['tax_id']}" if context.get("tax_id") else ""),
        ):
            if line:
                for sub_line in str(line).splitlines():
                    pdf.cell(0, 5, latin1(sub_line), new_x="LMARGIN", new_y="NEXT")

    out = pdf.output()
    return bytes(out)


def _send(to_email: str, context: dict, *, attach_pdf: bool) -> None:
    attachments = None
    if attach_pdf:
        try:
            pdf_bytes = build_receipt_pdf(context)
            attachments = [("DueNest-receipt.pdf", pdf_bytes, "application/pdf")]
        except Exception:  # noqa: BLE001 — fall back to a link/email if PDF fails
            logger.exception("receipt PDF generation failed; sending without it")
            context["has_pdf"] = False
    # Receipts are essential transactional mail and flow through the shared
    # sender so they are suppression-checked and logged like every other email.
    send_branded_email(
        subject=context["subject"],
        template="payment_receipt",
        context=context,
        to=to_email,
        email_type="payment_receipt",
        category="transactional",
        attachments=attachments,
        fail_silently=False,
    )


def send_receipt_for_invoice(invoice: InvoiceRecord) -> bool:
    """Send a branded receipt for a paid invoice. Returns True if one was sent.

    No-op (returns False) when receipts are disabled, email isn't configured, a
    receipt was already sent for this invoice, or there's no recipient. Idempotent
    via an atomic claim on ``receipt_sent_at`` so retried webhooks send once.
    """
    cfg = ReceiptSettings.load()
    if not cfg.enabled:
        return False
    if not _is_email_configured():
        logger.info("receipts enabled but email not configured; skipping")
        return False
    user = invoice.user
    if not user or not user.email:
        return False
    # Atomically claim this invoice so concurrent/duplicate events send once.
    claimed = InvoiceRecord.objects.filter(
        pk=invoice.pk, receipt_sent_at__isnull=True
    ).update(receipt_sent_at=timezone.now())
    if not claimed:
        return False
    try:
        context = build_receipt_context(invoice, cfg)
        _send(
            user.email,
            context,
            attach_pdf=cfg.mode == ReceiptSettings.Mode.EMAIL_PDF,
        )
        return True
    except Exception:  # noqa: BLE001 — release the claim so a retry can resend
        InvoiceRecord.objects.filter(pk=invoice.pk).update(receipt_sent_at=None)
        logger.exception("failed to send receipt for invoice %s", invoice.pk)
        return False


def send_test_receipt(user) -> None:
    """Send a sample receipt to ``user`` (founder preview). Ignores the enabled
    gate but honours the configured format. Does not touch any InvoiceRecord."""
    if not user or not user.email:
        raise ValueError("missing_recipient")
    cfg = ReceiptSettings.load()
    now = timezone.now()
    context = {
        "subject": "Your DueNest receipt — Sample (test)",
        "heading": "Thanks for your payment",
        "intro": "This is a sample receipt so you can preview the format. No payment was made.",
        "plan_name": "DueNest Pro",
        "interval_label": "Yearly",
        "amount_display": format_money(4900, "usd"),
        "period_display": f"{_fmt_date(now)} – {_fmt_date(now + timezone.timedelta(days=365))}",
        "paid_date_display": _fmt_date(now),
        "invoice_number": "SAMPLE-0001",
        "invoice_url": f"{_app_base()}/dashboard/settings/billing",
        "show_invoice_link": cfg.mode == ReceiptSettings.Mode.EMAIL_LINK,
        "has_pdf": cfg.mode == ReceiptSettings.Mode.EMAIL_PDF,
        "manage_billing_url": f"{_app_base()}/dashboard/settings/billing",
        "business_legal_name": cfg.business_legal_name,
        "business_address": cfg.business_address,
        "tax_id": cfg.tax_id,
        "support_email": cfg.support_email,
    }
    _send(user.email, context, attach_pdf=cfg.mode == ReceiptSettings.Mode.EMAIL_PDF)
