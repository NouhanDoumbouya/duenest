"""Branded billing lifecycle emails (dunning + retention).

Thin helpers over the founder-editable transactional registry
(``billing_*`` keys, all sharing the ``billing_lifecycle`` template). Each
builds a CTA + date context and sends to the user. Sending is best-effort and
never raises into billing — a failed email must not break webhook/cron handling.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone

from common.transactional_email import send_transactional_email

logger = logging.getLogger(__name__)


def _billing_url() -> str:
    base = getattr(
        settings, "DUENEST_APP_BASE_URL", "http://localhost:3000"
    ).rstrip("/")
    return f"{base}/dashboard/settings/billing"


def _fmt(dt) -> str:
    return timezone.localtime(dt).strftime("%d %b %Y") if dt else ""


def _billing_from() -> str | None:
    """Dedicated billing sender (BILLING_FROM_EMAIL) if configured, else None so
    the shared helper falls back to DEFAULT_FROM_EMAIL."""
    return getattr(settings, "BILLING_FROM_EMAIL", "") or None


def _send(
    key: str,
    user,
    *,
    detail_line: str = "",
    action_label: str = "Manage billing",
    action_url: str | None = None,
) -> bool:
    if not user or not getattr(user, "email", ""):
        return False
    try:
        return send_transactional_email(
            key,
            context={
                "action_url": action_url or _billing_url(),
                "action_label": action_label,
                "detail_line": detail_line,
            },
            to=user.email,
            from_email=_billing_from(),
        )
    except Exception:  # noqa: BLE001 — lifecycle email must never break billing
        logger.warning("Lifecycle email '%s' failed", key, exc_info=True)
        return False


def _send_once(
    key: str,
    user,
    *,
    dedupe_key: str,
    detail_line: str = "",
    action_label: str = "Manage billing",
    action_url: str | None = None,
) -> bool:
    """Send a lifecycle email at most once per ``(key, dedupe_key)``.

    Idempotent against Stripe retries and duplicate events (e.g. ``invoice.paid``
    AND ``invoice.payment_succeeded`` for one payment). Atomic claim on
    ``BillingEmailLog``: claim first, and on a send failure release the claim so a
    later retry can re-send. Never raises into billing.
    """
    if not user or not getattr(user, "email", ""):
        return False
    if not dedupe_key:
        return _send(
            key, user, detail_line=detail_line, action_label=action_label, action_url=action_url
        )
    from .models import BillingEmailLog

    try:
        log, created = BillingEmailLog.objects.get_or_create(
            email_key=key,
            dedupe_key=str(dedupe_key)[:180],
            defaults={"user": user if getattr(user, "pk", None) else None},
        )
    except Exception:  # noqa: BLE001 — dedup must never break billing
        logger.warning("Billing email dedup check failed for '%s'", key, exc_info=True)
        return _send(
            key, user, detail_line=detail_line, action_label=action_label, action_url=action_url
        )
    if not created:
        return False  # already sent for this key + entity
    sent = _send(
        key, user, detail_line=detail_line, action_label=action_label, action_url=action_url
    )
    if not sent:
        # Release the claim so a future retry of the event can re-send.
        BillingEmailLog.objects.filter(pk=log.pk).delete()
    return sent


def send_payment_failed_email(user, sub) -> bool:
    detail = (
        f"Your Pro features stay active until {_fmt(sub.grace_period_until)}."
        if sub and sub.grace_period_until
        else ""
    )
    return _send(
        "billing_payment_failed",
        user,
        detail_line=detail,
        action_label="Update payment method",
    )


def send_payment_failed_followup_email(user, sub) -> bool:
    detail = (
        f"Your Pro features stay active until {_fmt(sub.grace_period_until)}."
        if sub and sub.grace_period_until
        else ""
    )
    return _send(
        "billing_payment_failed_followup",
        user,
        detail_line=detail,
        action_label="Update payment method",
    )


def send_trial_ending_email(user, sub) -> bool:
    detail = f"Your trial ends {_fmt(sub.trial_end)}." if sub and sub.trial_end else ""
    return _send(
        "billing_trial_ending", user, detail_line=detail, action_label="Choose a plan"
    )


def send_renewal_upcoming_email(user, sub) -> bool:
    detail = (
        f"Your plan renews {_fmt(sub.current_period_end)}."
        if sub and sub.current_period_end
        else ""
    )
    return _send(
        "billing_renewal_upcoming",
        user,
        detail_line=detail,
        action_label="Manage subscription",
    )


def send_subscription_canceled_email(user, sub) -> bool:
    return _send(
        "billing_subscription_canceled", user, action_label="Resubscribe"
    )


def send_trial_ended_email(user, sub) -> bool:
    return _send("billing_trial_ended", user, action_label="Upgrade to Pro")


def send_refund_email(user, *, amount_minor: int, currency: str) -> bool:
    from .receipts import format_money

    detail = (
        f"Refunded: {format_money(amount_minor, currency)}." if amount_minor else ""
    )
    return _send(
        "billing_refund", user, detail_line=detail, action_label="View billing"
    )


def send_subscription_activated_email(user, sub, *, dedupe_key: str = "") -> bool:
    """Welcome / "you're on Pro" — sent once per subscription after checkout."""
    if sub and getattr(sub, "status", "") == "trialing" and getattr(sub, "trial_end", None):
        detail = f"Your free trial is active until {_fmt(sub.trial_end)}."
    elif sub and getattr(sub, "current_period_end", None):
        detail = f"Your plan renews {_fmt(sub.current_period_end)}."
    else:
        detail = ""
    key_id = dedupe_key or (getattr(sub, "provider_subscription_id", "") if sub else "")
    return _send_once(
        "billing_subscription_activated",
        user,
        dedupe_key=key_id,
        detail_line=detail,
        action_label="View your plan",
    )


def send_payment_succeeded_email(
    user, *, amount_minor: int = 0, currency: str = "usd", invoice_url: str = "", dedupe_key: str = ""
) -> bool:
    """Payment-received notification — once per invoice (dedupes paid/succeeded)."""
    from .receipts import format_money

    detail = (
        f"Payment received: {format_money(amount_minor, currency)}."
        if amount_minor
        else "Your payment was received."
    )
    # invoice_url is a Stripe-hosted invoice page when present (safe to link).
    return _send_once(
        "billing_payment_succeeded",
        user,
        dedupe_key=dedupe_key,
        detail_line=detail,
        action_label="View invoice" if invoice_url else "View billing",
        action_url=invoice_url or None,
    )


def send_payment_action_required_email(user, sub, *, dedupe_key: str = "") -> bool:
    """Payment needs extra authentication (e.g. 3-D Secure) before it completes."""
    return _send_once(
        "billing_payment_action_required",
        user,
        dedupe_key=dedupe_key,
        action_label="Confirm payment",
    )
