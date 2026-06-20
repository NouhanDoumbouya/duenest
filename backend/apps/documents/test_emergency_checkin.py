"""
Tests for the emergency safety check-in ("dead man's switch").

Covers the server-side escalation service (`process_emergency_checkins` /
`fire_checkin_escalation`) — which runs even with the owner's phone off — and the
owner arm / extend / cancel endpoints behind the `emergency_checkin` flag.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.features.models import FeatureFlag, Visibility

from .models import (
    EmergencyAccessPack,
    EmergencyActivityEvent,
    EmergencyTrustedContact,
)
from .services import process_emergency_checkins

User = get_user_model()


class EmergencyCheckinServiceTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="ci-owner", email="owner@example.com", password="StrongPassword123!DN"
        )
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner, title="Pack", status=EmergencyAccessPack.Status.ACTIVE
        )
        self.contact = EmergencyTrustedContact.objects.create(
            owner=self.owner,
            pack=self.pack,
            name="Mum",
            email="mum@example.com",
        )

    def _arm(self, *, due_in_minutes, message="Please check on me.", reveal=False, **extra):
        self.pack.checkin_armed = True
        self.pack.checkin_interval_minutes = 60
        self.pack.checkin_due_at = timezone.now() + timedelta(minutes=due_in_minutes)
        self.pack.checkin_message = message
        self.pack.checkin_reveal_location = reveal
        self.pack.checkin_nudge_sent = False
        for k, v in extra.items():
            setattr(self.pack, k, v)
        self.pack.save()

    def test_overdue_fires_escalation_and_emails_contact(self):
        self._arm(due_in_minutes=-1)
        summary = process_emergency_checkins(now=timezone.now())
        self.assertEqual(summary["fired"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("mum@example.com", mail.outbox[0].to)
        self.assertIn("Please check on me.", mail.outbox[0].body)
        self.pack.refresh_from_db()
        self.assertFalse(self.pack.checkin_armed)  # one-shot — disarmed
        self.assertIsNotNone(self.pack.checkin_triggered_at)
        self.assertTrue(
            self.pack.activity_events.filter(
                event_type=EmergencyActivityEvent.EventType.CHECKIN_TRIGGERED
            ).exists()
        )

    def test_overdue_reveals_precise_location_when_enabled(self):
        self._arm(
            due_in_minutes=-1,
            reveal=True,
            location_enabled=True,
            location_precision=EmergencyAccessPack.LocationPrecision.PRECISE,
            last_known_location={"label": "Berlin", "lat": 52.52, "lng": 13.40},
        )
        process_emergency_checkins(now=timezone.now())
        self.assertIn("openstreetmap.org", mail.outbox[0].body)

    def test_approximate_location_withholds_coordinates(self):
        self._arm(
            due_in_minutes=-1,
            reveal=True,
            location_enabled=True,
            location_precision=EmergencyAccessPack.LocationPrecision.APPROXIMATE,
            last_known_location={"label": "Berlin", "lat": 52.52, "lng": 13.40},
        )
        process_emergency_checkins(now=timezone.now())
        body = mail.outbox[0].body
        self.assertIn("Berlin", body)
        self.assertNotIn("openstreetmap.org", body)

    def test_nudge_before_deadline_notifies_owner_once(self):
        self._arm(due_in_minutes=10)  # within the 15-min nudge lead
        summary = process_emergency_checkins(now=timezone.now())
        self.assertEqual(summary["nudged"], 1)
        self.assertEqual(summary["fired"], 0)
        self.assertEqual(len(mail.outbox), 0)  # nudge is in-app, not an alert email
        self.pack.refresh_from_db()
        self.assertTrue(self.pack.checkin_nudge_sent)
        self.assertTrue(self.pack.checkin_armed)  # still armed
        # Second pass does not nudge again.
        summary2 = process_emergency_checkins(now=timezone.now())
        self.assertEqual(summary2["nudged"], 0)

    def test_not_yet_due_does_nothing(self):
        self._arm(due_in_minutes=120)
        summary = process_emergency_checkins(now=timezone.now())
        self.assertEqual(summary, {**summary, "fired": 0, "nudged": 0})
        self.assertEqual(len(mail.outbox), 0)

    def test_dry_run_does_not_send_or_disarm(self):
        self._arm(due_in_minutes=-1)
        process_emergency_checkins(now=timezone.now(), dry_run=True)
        self.assertEqual(len(mail.outbox), 0)
        self.pack.refresh_from_db()
        self.assertTrue(self.pack.checkin_armed)


class EmergencyCheckinEndpointTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="ci-owner2", email="owner2@example.com", password="StrongPassword123!DN"
        )
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner, title="Pack", status=EmergencyAccessPack.Status.ACTIVE
        )
        self.client.force_authenticate(self.owner)

    def _enable_flag(self):
        FeatureFlag.objects.update_or_create(
            key="emergency_checkin", defaults={"visibility": Visibility.ENABLED}
        )

    def _add_contact(self, email="mum@example.com"):
        return EmergencyTrustedContact.objects.create(
            owner=self.owner, pack=self.pack, name="Mum", email=email
        )

    def test_arm_is_gated_by_feature_flag(self):
        # Default (founder_only) → unavailable for a normal owner.
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 60},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_arm_requires_a_contact_with_email(self):
        self._enable_flag()
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 60},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_arm_then_cancel(self):
        self._enable_flag()
        self._add_contact()
        armed = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 90, "message": "Call me", "reveal_location": False},
            format="json",
        )
        self.assertEqual(armed.status_code, status.HTTP_200_OK)
        self.assertTrue(armed.data["checkin_armed"])
        self.assertEqual(armed.data["checkin_interval_minutes"], 90)

        canceled = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/cancel/", {}, format="json"
        )
        self.assertEqual(canceled.status_code, status.HTTP_200_OK)
        self.assertFalse(canceled.data["checkin_armed"])
        self.pack.refresh_from_db()
        self.assertTrue(
            self.pack.activity_events.filter(
                event_type=EmergencyActivityEvent.EventType.CHECKIN_CANCELED
            ).exists()
        )

    def test_arm_rejects_out_of_range_interval(self):
        self._enable_flag()
        self._add_contact()
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extend_pushes_deadline(self):
        self._enable_flag()
        self._add_contact()
        self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 60},
            format="json",
        )
        self.pack.refresh_from_db()
        before = self.pack.checkin_due_at
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/extend/",
            {"interval_minutes": 120},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.pack.refresh_from_db()
        self.assertGreater(self.pack.checkin_due_at, before)

    def test_other_user_cannot_arm(self):
        self._enable_flag()
        self._add_contact()
        intruder = User.objects.create_user(
            username="intruder2", email="x2@example.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(intruder)
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/checkin/arm/",
            {"interval_minutes": 60},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
