"""
Celery tasks for notification + email delivery.

In lean mode (``ENABLE_BACKGROUND_JOBS`` False) these run inline/eagerly, so the
behaviour is identical to calling the underlying service directly. In
scale-ready mode they run on the ``email`` / ``notifications`` queues.

Idempotency: ``send_email`` re-checks ``delivered_email_at`` before sending and
consumes an attempt, so a retry never double-sends. ``process_due_notifications``
relies on the existing per-candidate ``dedupe_key`` to avoid duplicate rows.
"""

from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("duenest.notifications")


@shared_task(
    name="apps.notifications.tasks.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def send_email(self, notification_id: int) -> dict:
    """Send one notification's email, idempotently.

    Safe to retry: if the email was already delivered, or attempts are exhausted,
    it returns without sending again.
    """
    from apps.notifications.models import Notification
    from apps.notifications.services import (
        is_email_configured,
        send_notification_email,
    )

    try:
        notification = Notification.objects.select_related("user").get(pk=notification_id)
    except Notification.DoesNotExist:
        return {"sent": False, "reason": "missing"}

    if notification.delivered_email_at is not None:
        return {"sent": False, "reason": "already_delivered"}
    if notification.email_attempts >= 3:
        return {"sent": False, "reason": "attempts_exhausted"}
    if not is_email_configured():
        notification.email_last_error = "not_configured"
        notification.save(update_fields=["email_last_error", "updated_at"])
        return {"sent": False, "reason": "not_configured"}

    notification.email_attempts += 1
    try:
        send_notification_email(notification)
    except Exception as exc:  # noqa: BLE001 - status only, never log body/details
        notification.email_last_error = "send_failed"
        notification.save(
            update_fields=["email_attempts", "email_last_error", "updated_at"]
        )
        logger.warning(
            "notification_email_failed notification_id=%s user_id=%s type=%s",
            notification.id,
            notification.user_id,
            notification.type,
        )
        # Retry with backoff while attempts remain.
        raise self.retry(exc=exc)

    notification.delivered_email_at = timezone.now()
    notification.email_last_error = ""
    notification.save(
        update_fields=[
            "email_attempts",
            "delivered_email_at",
            "email_last_error",
            "updated_at",
        ]
    )
    return {"sent": True}


@shared_task(name="apps.notifications.tasks.deliver_notification", acks_late=True)
def deliver_notification(notification_id: int) -> dict:
    """Deliver a single notification (in-app + email) via the service layer."""
    from apps.notifications.models import Notification
    from apps.notifications.services import deliver_notification as _deliver

    try:
        notification = Notification.objects.select_related("user").get(pk=notification_id)
    except Notification.DoesNotExist:
        return {"delivered": False, "reason": "missing"}
    result = _deliver(notification)
    return {"delivered": bool(result.changed)}


@shared_task(name="apps.notifications.tasks.send_push", acks_late=True)
def send_push(notification_id: int) -> dict:
    """Deliver one notification as a Web Push (in-app delivery already happened).

    Safe to run on the `push` queue: ``push_notification`` self-gates on opt-in,
    quiet hours, and VAPID config, and never raises.
    """
    from apps.notifications.models import Notification
    from apps.notifications.push import push_notification

    try:
        notification = Notification.objects.select_related("user").get(pk=notification_id)
    except Notification.DoesNotExist:
        return {"sent": 0, "reason": "missing"}
    return push_notification(notification)


@shared_task(name="apps.notifications.tasks.process_due_notifications", acks_late=True)
def process_due_notifications(limit: int = 200, user_id: int | None = None) -> dict:
    """Scheduled sweep: create + deliver due notifications (idempotent)."""
    from apps.notifications.services import process_due_notifications as _process

    summary = _process(limit=limit, user_id=user_id)
    logger.info("process_due_notifications_task summary=%s", summary)
    return summary


@shared_task(name="apps.notifications.tasks.send_weekly_radar_emails", acks_late=True)
def send_weekly_radar_emails(limit: int | None = None) -> dict:
    """Scheduled weekly sweep: send the opt-in deterministic Weekly Radar email.

    No AI, no credits. No-ops gracefully unless email is configured and users have
    opted in (eligibility is enforced per-recipient). Idempotent within the dedupe
    window, so a weekly beat plus a rerun won't double-send.
    """
    from apps.notifications.weekly_radar import send_weekly_radar_batch

    summary = send_weekly_radar_batch(limit=limit)
    logger.info("send_weekly_radar_emails_task summary=%s", summary)
    return summary
