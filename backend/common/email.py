"""Shared branded transactional email sender.

Renders the matching ``emails/<template>.html`` + ``.txt`` (both extend
``emails/base.html`` / ``base.txt`` for consistent DueNest branding) and sends a
multipart email. Subject is injected into the template context so the layout's
``<title>``/preheader stay in sync.

Branding lives in the templates, not here — callers just pass a template name,
context, and recipients.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def send_branded_email(
    *,
    subject: str,
    template: str,
    context: dict,
    to: str | list[str],
    fail_silently: bool = True,
) -> bool:
    """Render and send a branded HTML+text email.

    Returns True if the message was handed to the email backend. With
    ``fail_silently`` (the default) any rendering/transport error is logged and
    swallowed so a transactional email never breaks the originating action.
    """
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = [r for r in recipients if r]
    if not recipients:
        return False
    try:
        ctx = {"subject": subject, **context}
        text_body = render_to_string(f"emails/{template}.txt", ctx)
        html_body = render_to_string(f"emails/{template}.html", ctx)
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=recipients,
        )
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=fail_silently)
        return True
    except Exception:  # noqa: BLE001 - a transactional email must never block its action
        logger.warning(
            "Branded email '%s' failed to send", template, exc_info=True
        )
        if not fail_silently:
            raise
        return False
