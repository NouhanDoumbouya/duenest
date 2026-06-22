"""
Web Push (PWA) delivery for notifications.

Design goals:
- **Opt-in only.** Nothing is sent unless the user enabled push AND registered a
  subscription AND VAPID keys are configured.
- **Privacy-safe.** The push payload carries a generic title/body and an internal
  URL only — never a document name, recipient identity, token, or exact private
  detail. Lock-screen previews must stay safe.
- **Graceful degradation.** The `pywebpush` dependency is imported lazily; if it
  is absent or VAPID is unconfigured, delivery is a no-op (callers never break).
- **Self-healing.** Subscriptions that the push service reports as gone
  (HTTP 404/410) are deleted so we stop trying.
"""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("duenest.notifications")

# How long the push service should hold a message if the device is offline or
# dozing, before discarding it (seconds). Default pywebpush TTL is 0 = drop if
# not immediately deliverable, which loses pushes while a phone is asleep.
_PUSH_TTL_SECONDS = 60 * 60 * 24  # 1 day

# Lock-screen copy. The title stays a constant brand string and the body is
# category-level only — enough to know whether to open CertaNest now, but never a
# document name, date, amount, recipient, or any other private specific. The
# real detail is shown only inside the authenticated app.
_GENERIC_TITLE = "CertaNest"
_GENERIC_BODY = "You have a new update in CertaNest."


def _push_body(notification_type: str) -> str:
    """Safe, category-level lock-screen body for a notification type."""
    t = notification_type or ""
    if t.startswith("document_"):
        return "A document needs your attention soon."
    if t.startswith("subscription_"):
        return "A subscription renewal is coming up."
    if t.startswith(("bundle_", "checklist_")):
        return "Your bundle needs attention."
    if t.startswith("organization_"):
        return "An organization task needs your attention."
    if t.startswith("emergency_"):
        return "Emergency access needs your review."
    if t in {"security_alert", "failed_login_warning"}:
        return "A security alert needs your review."
    if t.startswith("billing_") or t == "storage_plan_warning":
        return "There's a billing update on your account."
    if t.endswith("_viewed") or t.startswith(("share_", "room_")):
        return "There's new activity on something you shared."
    return _GENERIC_BODY


def is_push_configured() -> bool:
    """True only when both VAPID keys are present."""
    return bool(
        getattr(settings, "VAPID_PUBLIC_KEY", "")
        and getattr(settings, "VAPID_PRIVATE_KEY", "")
    )


def public_key() -> str:
    return getattr(settings, "VAPID_PUBLIC_KEY", "") or ""


def _in_quiet_hours(prefs, now=None) -> bool:
    """
    True when `now` falls inside the user's push quiet-hours window, evaluated in
    their notification timezone. Supports windows that wrap midnight (start > end).
    Only affects push — in-app delivery is never suppressed.
    """
    if not getattr(prefs, "push_quiet_hours_enabled", False):
        return False
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    now = now or timezone.now()
    try:
        tz = ZoneInfo(prefs.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        tz = ZoneInfo("UTC")
    if timezone.is_naive(now):
        now = timezone.make_aware(now, datetime.now().astimezone().tzinfo)
    hour = now.astimezone(tz).hour
    start = int(prefs.push_quiet_start_hour)
    end = int(prefs.push_quiet_end_hour)
    if start == end:
        return False  # zero-length window = effectively off
    if start < end:
        return start <= hour < end
    # Wraps midnight, e.g. 22 → 7.
    return hour >= start or hour < end


def _safe_payload(notification) -> dict:
    """
    Build a privacy-safe push payload.

    We deliberately do NOT forward the notification's own title/message to the
    lock screen, because some notification copy can reference user context. The
    push only nudges the user to open CertaNest, where the authenticated UI shows
    the real (sensitive) detail. Only the internal action URL is included so the
    click lands on the right page.
    """
    url = notification.action_url or "/dashboard/notifications"
    if not url.startswith("/"):
        url = "/dashboard/notifications"
    return {
        "title": _GENERIC_TITLE,
        "body": _push_body(notification.type),
        "url": url,
        "tag": "duenest-notification",
    }


def _send_one(subscription, payload: dict) -> str:
    """
    Attempt one push. Returns "sent", "skipped", "expired", or "failed".

    `expired` means the subscription is gone (404/410) and was deleted.
    """
    try:
        from pywebpush import WebPushException, webpush
    except Exception:  # noqa: BLE001 — dependency optional in lean installs
        return "skipped"

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            # TTL: keep the message queued for up to a day if the device is
            # briefly offline/dozing (default 0 = "deliver now or drop").
            ttl=_PUSH_TTL_SECONDS,
            # Urgency "high" tells the push service to wake the device and deliver
            # promptly even under Android Doze, instead of holding it until the
            # user next opens the app. CertaNest pushes are deadline reminders, so
            # prompt background delivery is the whole point.
            headers={"Urgency": "high"},
            timeout=10,
        )
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            subscription.delete()
            return "expired"
        subscription.failure_count = (subscription.failure_count or 0) + 1
        subscription.save(update_fields=["failure_count"])
        # Log only safe identifiers and the status code — never the payload.
        logger.warning(
            "web_push_failed user_id=%s status=%s",
            subscription.user_id,
            status_code,
        )
        return "failed"
    except Exception:  # noqa: BLE001 — never break the caller
        logger.warning("web_push_error user_id=%s", subscription.user_id)
        return "failed"

    subscription.last_used_at = timezone.now()
    subscription.failure_count = 0
    subscription.save(update_fields=["last_used_at", "failure_count"])
    return "sent"


def push_notification(notification) -> dict:
    """
    Deliver `notification` as a Web Push to all of the owner's devices, if the
    user opted in and push is configured. Idempotency is the caller's concern
    (we always attempt for live subscriptions); safe to skip silently.

    Returns a small counts dict for observability. Never raises.
    """
    summary = {"sent": 0, "expired": 0, "failed": 0, "skipped": 0, "quiet": 0}
    try:
        if not is_push_configured():
            summary["skipped"] = 1
            return summary

        from .models import NotificationPreference, PushWebSubscription

        prefs = NotificationPreference.objects.filter(user=notification.user).first()
        if prefs is None or not prefs.push_enabled:
            summary["skipped"] = 1
            return summary

        # Quiet hours hold back the device nudge only; the notification is still
        # delivered in-app and will be seen next time CertaNest is opened.
        if _in_quiet_hours(prefs):
            summary["quiet"] = 1
            return summary

        subs = list(PushWebSubscription.objects.filter(user=notification.user))
        if not subs:
            summary["skipped"] = 1
            return summary

        payload = _safe_payload(notification)
        for sub in subs:
            result = _send_one(sub, payload)
            summary[result] = summary.get(result, 0) + 1
    except Exception:  # noqa: BLE001 — push must never break notification flow
        logger.warning("push_notification_error notification_id=%s", notification.id)
    return summary
