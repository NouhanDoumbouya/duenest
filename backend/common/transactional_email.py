"""Founder-configurable transactional emails.

Each entry here is a transactional email whose **subject** and **message body**
can be overridden, and which can be toggled on/off, from the Founder Console
(see ``apps.founder.models.TransactionalEmailSetting``). The branded layout,
buttons, and any dynamic bits (invite code, links) stay in code/templates — the
console only edits the prose, so branding and structure can never break.

Resolution order for subject/body: DB override (if set) → the defaults below.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.apps import apps

from common.email import send_branded_email

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TransactionalEmail:
    key: str
    name: str
    template: str  # base name under templates/emails/ (no extension)
    subject: str  # default subject
    body: str  # default message body (plain text; rendered with line breaks)


# The founder-editable transactional emails. Reminders are intentionally not
# here — their subject/body are generated per-notification by the notification
# service, so there is nothing static to edit.
TRANSACTIONAL_EMAILS: dict[str, TransactionalEmail] = {
    "invite": TransactionalEmail(
        key="invite",
        name="Private-beta invite",
        template="invite",
        subject="Your DueNest invite is ready",
        body=(
            "You've been invited to the DueNest private beta — the calm place to "
            "keep your important documents, renewals, and deadlines, and share "
            "them securely when life asks for proof."
        ),
    ),
    "waitlist_confirmation": TransactionalEmail(
        key="waitlist_confirmation",
        name="Waitlist confirmation",
        template="waitlist_confirmation",
        subject="You're on the DueNest waitlist",
        body=(
            "Thanks for joining the DueNest private-beta waitlist. DueNest keeps "
            "your important documents, renewals, and deadlines in one calm place "
            "— and quietly watches them so nothing slips. We'll email you an "
            "invite as spots open up."
        ),
    ),
    "password_reset": TransactionalEmail(
        key="password_reset",
        name="Password reset",
        template="password_reset",
        subject="Reset your DueNest password",
        body=(
            "We received a request to reset your DueNest password. Use the button "
            "below to choose a new one. This link is single-use and expires soon."
        ),
    ),
    "email_verification": TransactionalEmail(
        key="email_verification",
        name="Email verification",
        template="email_verification",
        subject="Verify your DueNest email",
        body=(
            "Confirm your email to finish setting up DueNest and keep your account "
            "secure."
        ),
    ),
}


def resolve_transactional_email(key: str):
    """Return (enabled, subject, body, definition) applying any DB override.

    Falls back to the registry defaults (and enabled=True) if the DB row is
    missing or the lookup fails, so email never breaks on a config hiccup.
    """
    definition = TRANSACTIONAL_EMAILS[key]
    enabled, subject, body = True, definition.subject, definition.body
    try:
        Model = apps.get_model("founder", "TransactionalEmailSetting")
        row = Model.objects.filter(key=key).first()
        if row is not None:
            enabled = row.enabled
            subject = (row.subject or "").strip() or definition.subject
            body = (row.body or "").strip() or definition.body
    except Exception:  # noqa: BLE001 - config lookup must never break sending
        logger.warning("Transactional email config lookup failed for %s", key, exc_info=True)
    return enabled, subject, body, definition


def send_transactional_email(key: str, *, context: dict, to) -> bool:
    """Send a founder-configurable transactional email by key.

    Applies the console subject/body override + enabled toggle, injects the
    (editable) body as ``email_body`` into the branded template, and sends. A
    disabled email is skipped (returns False).
    """
    if key not in TRANSACTIONAL_EMAILS:
        raise KeyError(f"Unknown transactional email key: {key}")
    enabled, subject, body, definition = resolve_transactional_email(key)
    if not enabled:
        logger.info("Transactional email '%s' is disabled — skipped", key)
        return False
    return send_branded_email(
        subject=subject,
        template=definition.template,
        context={"email_body": body, **context},
        to=to,
    )
