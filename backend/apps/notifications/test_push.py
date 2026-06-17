"""
Tests for the PWA Web Push foundation: subscription API, opt-in gating, and the
privacy-safe payload. Web Push network sending is mocked, so these run without
the optional `pywebpush` dependency installed.
"""

from datetime import datetime, timezone as dt_timezone
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Notification, NotificationPreference, PushWebSubscription
from .push import _in_quiet_hours, _safe_payload, push_notification

User = get_user_model()

_VAPID = {
    "VAPID_PUBLIC_KEY": "test-public",
    "VAPID_PRIVATE_KEY": "test-private",
    "VAPID_SUBJECT": "mailto:test@duenest.com",
}


class PushApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ampara", email="amara@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)

    def _subscribe_payload(self, endpoint="https://push.example.com/abc"):
        return {
            "endpoint": endpoint,
            "p256dh": "BPublicKeyBytesBase64Url",
            "auth": "AuthSecretBase64Url",
            "device_label": "Chrome on Android",
        }

    @override_settings(**_VAPID)
    def test_public_key_reports_enabled_when_configured(self):
        resp = self.client.get(reverse("notifications-push-public-key"))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["enabled"])
        self.assertEqual(resp.data["public_key"], "test-public")

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_public_key_hidden_when_unconfigured(self):
        resp = self.client.get(reverse("notifications-push-public-key"))
        self.assertFalse(resp.data["enabled"])
        self.assertEqual(resp.data["public_key"], "")

    def test_subscribe_creates_and_is_idempotent(self):
        url = reverse("notifications-push-subscribe")
        resp = self.client.post(url, self._subscribe_payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(PushWebSubscription.objects.filter(user=self.user).count(), 1)

        # Re-subscribing the same endpoint updates, never duplicates.
        resp2 = self.client.post(
            url,
            {**self._subscribe_payload(), "device_label": "Chrome on Mac"},
            format="json",
        )
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(PushWebSubscription.objects.filter(user=self.user).count(), 1)
        self.assertEqual(
            PushWebSubscription.objects.get(user=self.user).device_label,
            "Chrome on Mac",
        )

    def test_unsubscribe_removes_only_own_endpoint(self):
        self.client.post(
            reverse("notifications-push-subscribe"),
            self._subscribe_payload(),
            format="json",
        )
        resp = self.client.post(
            reverse("notifications-push-unsubscribe"),
            {"endpoint": "https://push.example.com/abc"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PushWebSubscription.objects.filter(user=self.user).count(), 0)

    def test_subscribe_requires_auth(self):
        self.client.force_authenticate(None)
        resp = self.client.post(
            reverse("notifications-push-subscribe"),
            self._subscribe_payload(),
            format="json",
        )
        self.assertIn(resp.status_code, (401, 403))


class PushDeliveryTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bana", email="bana@x.com", password="StrongPassword123!DN"
        )

    def _make_notification(self):
        return Notification.objects.create(
            user=self.user,
            type=Notification.Type.GENERIC_REMINDER,
            title="Sensitive Passport Title",
            message="Your passport expires on July 18.",
            action_url="/dashboard/documents/42",
            dedupe_key="t:1",
        )

    def test_payload_is_privacy_safe(self):
        note = self._make_notification()
        payload = _safe_payload(note)
        blob = (payload["title"] + payload["body"]).lower()
        # Generic copy only — no document title or expiry detail leaks to the
        # lock screen.
        self.assertNotIn("passport", blob)
        self.assertNotIn("july", blob)
        self.assertEqual(payload["url"], "/dashboard/documents/42")

    @override_settings(**_VAPID)
    def test_push_skipped_when_pref_disabled(self):
        note = self._make_notification()
        # Default preference leaves push_enabled False.
        NotificationPreference.objects.create(user=self.user)
        with mock.patch("apps.notifications.push._send_one") as send:
            summary = push_notification(note)
        send.assert_not_called()
        self.assertEqual(summary["skipped"], 1)

    @override_settings(**_VAPID)
    def test_push_sent_to_enabled_user_devices(self):
        note = self._make_notification()
        NotificationPreference.objects.create(user=self.user, push_enabled=True)
        PushWebSubscription.objects.create(
            user=self.user,
            endpoint="https://push.example.com/x",
            p256dh="k",
            auth="a",
        )
        with mock.patch(
            "apps.notifications.push._send_one", return_value="sent"
        ) as send:
            summary = push_notification(note)
        send.assert_called_once()
        self.assertEqual(summary["sent"], 1)

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_push_skipped_when_unconfigured(self):
        note = self._make_notification()
        NotificationPreference.objects.create(user=self.user, push_enabled=True)
        PushWebSubscription.objects.create(
            user=self.user, endpoint="https://p/x", p256dh="k", auth="a"
        )
        with mock.patch("apps.notifications.push._send_one") as send:
            summary = push_notification(note)
        send.assert_not_called()
        self.assertEqual(summary["skipped"], 1)

    @override_settings(**_VAPID)
    def test_quiet_hours_suppress_push_but_not_in_app(self):
        note = self._make_notification()
        NotificationPreference.objects.create(user=self.user, push_enabled=True)
        PushWebSubscription.objects.create(
            user=self.user, endpoint="https://p/x", p256dh="k", auth="a"
        )
        # Force "now" inside quiet hours regardless of the test clock.
        with mock.patch("apps.notifications.push._in_quiet_hours", return_value=True):
            with mock.patch("apps.notifications.push._send_one") as send:
                summary = push_notification(note)
        send.assert_not_called()
        self.assertEqual(summary["quiet"], 1)
        # The in-app record is untouched — push quiet hours never hide it.
        self.assertTrue(Notification.objects.filter(pk=note.pk).exists())


class QuietHoursWindowTests(TestCase):
    """Pure logic for the quiet-hours window, including midnight wrap."""

    def _prefs(self, *, enabled=True, start=22, end=7, tz="UTC"):
        return NotificationPreference(
            push_quiet_hours_enabled=enabled,
            push_quiet_start_hour=start,
            push_quiet_end_hour=end,
            timezone=tz,
        )

    def _at(self, hour, tz=dt_timezone.utc):
        return datetime(2026, 6, 17, hour, 30, tzinfo=tz)

    def test_disabled_is_never_quiet(self):
        self.assertFalse(_in_quiet_hours(self._prefs(enabled=False), self._at(3)))

    def test_wrap_midnight_window(self):
        prefs = self._prefs(start=22, end=7)
        self.assertTrue(_in_quiet_hours(prefs, self._at(23)))  # late night
        self.assertTrue(_in_quiet_hours(prefs, self._at(3)))  # early morning
        self.assertFalse(_in_quiet_hours(prefs, self._at(12)))  # midday

    def test_same_day_window(self):
        prefs = self._prefs(start=9, end=17)
        self.assertTrue(_in_quiet_hours(prefs, self._at(10)))
        self.assertFalse(_in_quiet_hours(prefs, self._at(20)))

    def test_zero_length_window_is_off(self):
        self.assertFalse(_in_quiet_hours(self._prefs(start=8, end=8), self._at(8)))

    def test_evaluated_in_user_timezone(self):
        # 02:00 UTC is 10:00 in Kuala Lumpur (UTC+8) — outside a 22→7 window.
        prefs = self._prefs(start=22, end=7, tz="Asia/Kuala_Lumpur")
        self.assertFalse(_in_quiet_hours(prefs, self._at(2)))


class PushDispatchTests(TestCase):
    """deliver_notification routes push inline (lean) vs to the queue (scale)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="cisse", email="cisse@x.com", password="StrongPassword123!DN"
        )
        NotificationPreference.objects.create(user=self.user, push_enabled=True)

    def _note(self):
        return Notification.objects.create(
            user=self.user,
            type=Notification.Type.GENERIC_REMINDER,
            title="t",
            message="m",
            dedupe_key="dispatch:1",
        )

    @override_settings(ENABLE_BACKGROUND_JOBS=True, **_VAPID)
    def test_scale_ready_queues_push_task(self):
        from .services import deliver_notification

        with mock.patch("apps.notifications.tasks.send_push.delay") as delay:
            result = deliver_notification(self._note())
        delay.assert_called_once()
        self.assertTrue(result.push_queued)

    @override_settings(ENABLE_BACKGROUND_JOBS=False, **_VAPID)
    def test_lean_sends_push_inline(self):
        from .services import deliver_notification

        with mock.patch(
            "apps.notifications.push.push_notification",
            return_value={"sent": 1},
        ) as inline:
            deliver_notification(self._note())
        inline.assert_called_once()
