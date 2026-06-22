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
    # Suppression category. Essential account mail stays "transactional" (only
    # hard bounce / complaint suppresses it); retention nudges are "lifecycle"
    # (also honour marketing unsubscribe + carry List-Unsubscribe).
    category: str = "transactional"
    # Human-readable description of what fires this email, shown read-only in the
    # founder console so triggers are documented rather than guessed. These are
    # code-driven events, so the trigger is informational (not configurable here).
    trigger: str = ""


# The founder-editable transactional emails. Reminders are intentionally not
# here — their subject/body are generated per-notification by the notification
# service, so there is nothing static to edit.
TRANSACTIONAL_EMAILS: dict[str, TransactionalEmail] = {
    "invite": TransactionalEmail(
        key="invite",
        name="Private-beta invite",
        trigger="Sent when you send a private-beta invite to someone on the waitlist.",
        template="invite",
        subject="Your CertaNest invite is ready",
        body=(
            "You've been invited to the CertaNest private beta — the calm place to "
            "keep your important documents, renewals, and deadlines, and share "
            "them securely when life asks for proof."
        ),
    ),
    "waitlist_confirmation": TransactionalEmail(
        key="waitlist_confirmation",
        name="Waitlist confirmation",
        trigger="Sent automatically the moment someone joins the waitlist.",
        template="waitlist_confirmation",
        subject="You're on the CertaNest waitlist",
        body=(
            "Thanks for joining the CertaNest private-beta waitlist. CertaNest keeps "
            "your important documents, renewals, and deadlines in one calm place "
            "— and quietly watches them so nothing slips. We'll email you an "
            "invite as spots open up."
        ),
    ),
    "password_reset": TransactionalEmail(
        key="password_reset",
        name="Password reset",
        trigger="Sent when a user requests a password reset.",
        template="password_reset",
        subject="Reset your CertaNest password",
        body=(
            "We received a request to reset your CertaNest password. Use the button "
            "below to choose a new one. This link is single-use and expires soon."
        ),
    ),
    "email_verification": TransactionalEmail(
        key="email_verification",
        name="Email verification",
        trigger="Sent when a user registers or changes their email address.",
        template="email_verification",
        subject="Verify your CertaNest email",
        body=(
            "Confirm your email to finish setting up CertaNest and keep your account "
            "secure."
        ),
    ),
    # ---- Billing lifecycle (share one template; context supplies CTA + dates) --
    "billing_payment_failed": TransactionalEmail(
        key="billing_payment_failed",
        name="Payment failed (dunning)",
        trigger="Sent when a subscription payment fails (first dunning notice).",
        template="billing_lifecycle",
        subject="Action needed: your CertaNest payment failed",
        body=(
            "We couldn't process your latest CertaNest payment. Your Pro features "
            "stay active during a short grace period — please update your payment "
            "method to avoid losing access."
        ),
        # Essential: the user must know their billing is failing.
        category="transactional",
    ),
    "billing_payment_failed_followup": TransactionalEmail(
        key="billing_payment_failed_followup",
        name="Payment failed — follow-up reminder",
        trigger="Sent a few days later if a failed payment is still unresolved.",
        template="billing_lifecycle",
        subject="Reminder: update your CertaNest payment method",
        body=(
            "We still haven't been able to process your CertaNest payment. Please "
            "update your payment method soon to avoid losing Pro access when the "
            "grace period ends."
        ),
        category="transactional",
    ),
    "billing_trial_ending": TransactionalEmail(
        key="billing_trial_ending",
        name="Trial ending soon",
        trigger="Sent a few days before a free trial ends.",
        template="billing_lifecycle",
        subject="Your CertaNest trial ends soon",
        body=(
            "Your CertaNest free trial is ending soon. Keep your documents, "
            "renewals, and deadlines watched without interruption by choosing a "
            "plan before it ends."
        ),
        category="lifecycle",
    ),
    "billing_renewal_upcoming": TransactionalEmail(
        key="billing_renewal_upcoming",
        name="Renewal upcoming",
        trigger="Sent shortly before a paid plan renews.",
        template="billing_lifecycle",
        subject="Your CertaNest plan renews soon",
        body=(
            "This is a friendly heads-up that your CertaNest subscription will "
            "renew soon. No action is needed to stay subscribed — manage or "
            "cancel any time from your billing settings."
        ),
        category="lifecycle",
    ),
    "billing_subscription_canceled": TransactionalEmail(
        key="billing_subscription_canceled",
        name="Subscription canceled (win-back)",
        trigger="Sent when a subscription is canceled.",
        template="billing_lifecycle",
        subject="Your CertaNest subscription was canceled",
        body=(
            "Your CertaNest subscription has been canceled. We'd love to keep "
            "watching your important documents and deadlines — you can resubscribe "
            "any time and pick up right where you left off."
        ),
        category="lifecycle",
    ),
    "billing_refund": TransactionalEmail(
        key="billing_refund",
        name="Refund issued",
        trigger="Sent when a refund is issued.",
        template="billing_lifecycle",
        subject="Your CertaNest refund has been issued",
        body=(
            "We've issued a refund to your original payment method. Depending on "
            "your bank, it may take a few business days to appear on your statement."
        ),
        # Essential financial confirmation.
        category="transactional",
    ),
    "billing_trial_ended": TransactionalEmail(
        key="billing_trial_ended",
        name="Trial ended",
        trigger="Sent when a free trial ends without upgrading.",
        template="billing_lifecycle",
        subject="Your CertaNest trial has ended",
        body=(
            "Your free trial has ended, so your account is now on the Free plan. "
            "Your documents and data are exactly where you left them — upgrade any "
            "time to bring back Pro features."
        ),
        category="lifecycle",
    ),
    # ---- Organization document collection (sent to external recipients) -------
    "org_document_request_invite": TransactionalEmail(
        key="org_document_request_invite",
        name="Document request — invite",
        trigger="Sent to a recipient when an organization creates a document request addressed to their email.",
        template="document_request",
        subject="You've been asked to provide documents",
        body=(
            "An organization is requesting documents from you through CertaNest. "
            "Use the secure link below to upload them — no account needed. The "
            "link expires for your security."
        ),
        category="transactional",
    ),
    "org_document_request_reminder": TransactionalEmail(
        key="org_document_request_reminder",
        name="Document request — reminder",
        trigger="Sent when an organization admin sends a reminder for an open document request.",
        template="document_request",
        subject="Reminder: documents are still needed",
        body=(
            "This is a friendly reminder that an organization is still waiting on "
            "documents from you. Use the secure link below to upload them — no "
            "account needed."
        ),
        category="transactional",
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
        email_type=key,
        category=definition.category,
    )
