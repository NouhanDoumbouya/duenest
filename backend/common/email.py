"""Shared branded transactional email sender.

Renders the matching ``emails/<template>.html`` + ``.txt`` (both extend
``emails/base.html`` / ``base.txt`` for consistent CertaNest branding) and sends a
multipart email. Subject is injected into the template context so the layout's
``<title>``/preheader stay in sync.

Every send flows through here so it is, in one place:

* **suppression-aware** — an address on the :class:`SuppressedEmail` list is
  skipped (``all`` scope always; ``marketing`` scope for non-essential mail);
* **logged** — each attempt is recorded in :class:`EmailLog` for support and the
  founder email analytics, storing only routing metadata (never contents).

Branding lives in the templates, not here — callers pass a template name,
context, recipients, plus an ``email_type``/``category`` for logging.
"""

from __future__ import annotations

import logging

from django.apps import apps
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

# Categories that an "unsubscribe" (marketing-scope) suppression blocks.
_NON_ESSENTIAL = {"marketing", "lifecycle"}


def is_suppressed(email: str, category: str) -> bool:
    """Whether ``email`` should be skipped for a message of ``category``.

    Fails open (returns False) if the suppression table can't be read, so a
    lookup hiccup never silently drops essential mail.
    """
    try:
        Model = apps.get_model("notifications", "SuppressedEmail")
        row = Model.objects.filter(email__iexact=email).first()
        if row is None:
            return False
        if row.scope == "all":
            return True
        return category in _NON_ESSENTIAL
    except Exception:  # noqa: BLE001 — suppression must never break sending
        logger.warning("Suppression lookup failed for a recipient", exc_info=True)
        return False


def _log(
    email_type: str,
    category: str,
    recipient: str,
    subject: str,
    status: str,
    error: str = "",
) -> None:
    try:
        Model = apps.get_model("notifications", "EmailLog")
        Model.objects.create(
            email_type=email_type or "unknown",
            category=category,
            recipient=recipient,
            subject=subject[:255],
            status=status,
            error=error[:255],
        )
    except Exception:  # noqa: BLE001 — logging must never break sending
        logger.warning("EmailLog write failed", exc_info=True)


def send_branded_email(
    *,
    subject: str,
    template: str,
    context: dict,
    to: str | list[str],
    email_type: str = "",
    category: str = "transactional",
    attachments: list[tuple[str, bytes, str]] | None = None,
    headers: dict | None = None,
    fail_silently: bool = True,
) -> bool:
    """Render and send a branded HTML+text email.

    ``email_type`` is a stable key for analytics (e.g. ``payment_receipt``);
    ``category`` is one of ``transactional`` / ``lifecycle`` / ``marketing`` and
    governs suppression. ``attachments`` is a list of ``(filename, bytes, mime)``.

    Returns True if the message was handed to the email backend for at least one
    recipient. Suppressed recipients are skipped and logged; with
    ``fail_silently`` (default) any transport error is logged and swallowed so a
    transactional email never breaks the originating action.
    """
    requested = [to] if isinstance(to, str) else list(to)
    requested = [r for r in requested if r]
    if not requested:
        return False

    recipients: list[str] = []
    for r in requested:
        if is_suppressed(r, category):
            _log(email_type, category, r, subject, "suppressed")
        else:
            recipients.append(r)
    if not recipients:
        return False

    # One-click unsubscribe for non-essential mail (Gmail/Yahoo bulk-sender
    # rules). Per-recipient, so only when a single recipient is addressed.
    final_headers = dict(headers or {})
    if category in _NON_ESSENTIAL and len(recipients) == 1:
        try:
            from apps.notifications.unsubscribe import build_unsubscribe_url

            url = build_unsubscribe_url(recipients[0])
            final_headers.setdefault("List-Unsubscribe", f"<{url}>")
            final_headers.setdefault(
                "List-Unsubscribe-Post", "List-Unsubscribe=One-Click"
            )
        except Exception:  # noqa: BLE001 — never block a send on header building
            logger.warning("Unsubscribe header build failed", exc_info=True)

    try:
        ctx = {"subject": subject, **context}
        text_body = render_to_string(f"emails/{template}.txt", ctx)
        html_body = render_to_string(f"emails/{template}.html", ctx)
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=recipients,
            headers=final_headers or None,
        )
        message.attach_alternative(html_body, "text/html")
        for name, content, mime in attachments or []:
            message.attach(name, content, mime)
        message.send(fail_silently=fail_silently)
    except Exception:  # noqa: BLE001 - a transactional email must never block its action
        logger.warning("Branded email '%s' failed to send", template, exc_info=True)
        for r in recipients:
            _log(email_type, category, r, subject, "failed", error="send failed")
        if not fail_silently:
            raise
        return False

    for r in recipients:
        _log(email_type, category, r, subject, "sent")
    return True
