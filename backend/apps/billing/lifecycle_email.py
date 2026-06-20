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


def _send(key: str, user, *, detail_line: str = "", action_label: str = "Manage billing") -> bool:
    if not user or not getattr(user, "email", ""):
        return False
    try:
        return send_transactional_email(
            key,
            context={
                "action_url": _billing_url(),
                "action_label": action_label,
                "detail_line": detail_line,
            },
            to=user.email,
        )
    except Exception:  # noqa: BLE001 — lifecycle email must never break billing
        logger.warning("Lifecycle email '%s' failed", key, exc_info=True)
        return False


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


def send_refund_email(user, *, amount_minor: int, currency: str) -> bool:
    from .receipts import format_money

    detail = (
        f"Refunded: {format_money(amount_minor, currency)}." if amount_minor else ""
    )
    return _send(
        "billing_refund", user, detail_line=detail, action_label="View billing"
    )
