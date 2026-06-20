"""Apply provider delivery events (bounce / complaint / delivered / opened).

Shared by the Resend webhook. Bounces and complaints add the recipient to the
suppression list (``all`` scope — the address is dead or hostile) so we stop
mailing it; delivered/opened enrich the most recent matching :class:`EmailLog`
row. Recipient-based correlation keeps this provider-agnostic.
"""

from __future__ import annotations

import logging

from django.utils import timezone

from .models import EmailLog, SuppressedEmail

logger = logging.getLogger(__name__)


def suppress_email(email: str, *, scope: str, reason: str, detail: str = "") -> None:
    """Idempotently add (or widen) a suppression for ``email``."""
    if not email:
        return
    email = email.strip().lower()
    obj, created = SuppressedEmail.objects.get_or_create(
        email=email,
        defaults={"scope": scope, "reason": reason, "detail": detail[:255]},
    )
    # A later ``all`` event always wins over a narrower ``marketing`` one.
    if not created and obj.scope != scope and scope == SuppressedEmail.Scope.ALL:
        obj.scope = scope
        obj.reason = reason
        obj.detail = detail[:255]
        obj.save(update_fields=["scope", "reason", "detail"])


def _recent_log(recipient: str):
    return (
        EmailLog.objects.filter(recipient__iexact=recipient)
        .order_by("-created_at")
        .first()
    )


# Resend event type -> handler. Unknown events are ignored (logged at debug).
def apply_provider_event(event_type: str, recipient: str, *, detail: str = "") -> str:
    """Apply one normalized event. Returns a short status for the webhook reply."""
    if not recipient:
        return "ignored:no-recipient"
    now = timezone.now()
    etype = (event_type or "").lower()

    if etype in ("email.bounced", "bounced", "hard_bounce", "bounce"):
        suppress_email(
            recipient,
            scope=SuppressedEmail.Scope.ALL,
            reason=SuppressedEmail.Reason.BOUNCE,
            detail=detail,
        )
        EmailLog.objects.filter(pk=getattr(_recent_log(recipient), "pk", None)).update(
            status=EmailLog.Status.BOUNCED, bounced_at=now
        )
        return "bounced"

    if etype in ("email.complained", "complained", "complaint", "spam"):
        suppress_email(
            recipient,
            scope=SuppressedEmail.Scope.ALL,
            reason=SuppressedEmail.Reason.COMPLAINT,
            detail=detail,
        )
        EmailLog.objects.filter(pk=getattr(_recent_log(recipient), "pk", None)).update(
            status=EmailLog.Status.COMPLAINED, bounced_at=now
        )
        return "complained"

    if etype in ("email.delivered", "delivered"):
        log = _recent_log(recipient)
        if log and log.delivered_at is None:
            log.delivered_at = now
            if log.status == EmailLog.Status.SENT:
                log.status = EmailLog.Status.DELIVERED
            log.save(update_fields=["delivered_at", "status"])
        return "delivered"

    if etype in ("email.opened", "opened"):
        log = _recent_log(recipient)
        if log and log.opened_at is None:
            log.opened_at = now
            log.save(update_fields=["opened_at"])
        return "opened"

    logger.debug("Unhandled provider email event: %s", etype)
    return "ignored"
