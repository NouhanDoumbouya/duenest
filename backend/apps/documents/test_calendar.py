"""
Tests for CertaNest Calendar V1: owner-scoped aggregation across documents,
reminders, bundles, shares, and rooms; filtering; summary; and safe .ics export.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Document,
    DocumentBundle,
    DocumentFile,
    DocumentFileShareLink,
    DocumentReminderRule,
    ShareRoom,
)

User = get_user_model()

EVENTS = "/api/v1/calendar/events/"
SUMMARY = "/api/v1/calendar/summary/"
ICS = "/api/v1/calendar/export.ics"


class CalendarBaseTest(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@x.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@x.com", password="StrongPassword123!DN"
        )
        self.today = timezone.localdate()

    def event_types(self, data):
        return {e["event_type"] for e in data["events"]}

    def event_ids(self, data):
        return {e["id"] for e in data["events"]}


class CalendarAccessTests(CalendarBaseTest):
    def test_unauthenticated_blocked(self):
        self.assertEqual(self.client.get(EVENTS).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_only_sees_own_events(self):
        Document.objects.create(
            owner=self.bob,
            title="Bob Passport",
            expiry_date=self.today + timedelta(days=10),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(EVENTS).data
        self.assertEqual(data["summary"]["total_events"], 0)


class CalendarEventTests(CalendarBaseTest):
    def test_document_expiry_and_renewal_events(self):
        Document.objects.create(
            owner=self.alice,
            title="Passport",
            expiry_date=self.today + timedelta(days=10),
            renewal_date=self.today + timedelta(days=5),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(EVENTS).data
        self.assertIn("document_expiry", self.event_types(data))
        self.assertIn("renewal_due", self.event_types(data))

    def test_reminder_event_appears(self):
        doc = Document.objects.create(
            owner=self.alice,
            title="Passport",
            expiry_date=self.today + timedelta(days=30),
        )
        DocumentReminderRule.objects.create(
            owner=self.alice,
            document=doc,
            trigger_type=DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
            days_before=7,
            is_enabled=True,
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(EVENTS).data
        self.assertIn("reminder", self.event_types(data))

    def test_bundle_deadline_event(self):
        DocumentBundle.objects.create(
            owner=self.alice,
            title="Visa pack",
            target_date=self.today + timedelta(days=12),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(EVENTS).data
        self.assertIn("bundle_deadline", self.event_types(data))

    def test_share_and_room_expiry_events(self):
        doc = Document.objects.create(owner=self.alice, title="Doc")
        f = DocumentFile.objects.create(
            document=doc,
            uploaded_by=self.alice,
            original_filename="a.pdf",
            content_type="application/pdf",
            file_size=1,
        )
        DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=doc,
            file=f,
            expires_at=timezone.now() + timedelta(days=6),
        )
        ShareRoom.objects.create(
            owner=self.alice,
            title="Room",
            expires_at=timezone.now() + timedelta(days=8),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(EVENTS).data
        self.assertIn("share_expiry", self.event_types(data))
        self.assertIn("room_expiry", self.event_types(data))

    def test_date_range_filter(self):
        Document.objects.create(
            owner=self.alice,
            title="Near",
            expiry_date=self.today + timedelta(days=3),
        )
        Document.objects.create(
            owner=self.alice,
            title="Far",
            expiry_date=self.today + timedelta(days=200),
        )
        self.client.force_authenticate(self.alice)
        start = self.today.isoformat()
        end = (self.today + timedelta(days=30)).isoformat()
        data = self.client.get(f"{EVENTS}?start={start}&end={end}").data
        titles = {e["title"] for e in data["events"]}
        self.assertIn("Near expires", titles)
        self.assertNotIn("Far expires", titles)

    def test_type_filter(self):
        Document.objects.create(
            owner=self.alice,
            title="Doc",
            expiry_date=self.today + timedelta(days=5),
        )
        DocumentBundle.objects.create(
            owner=self.alice,
            title="Bundle",
            target_date=self.today + timedelta(days=5),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(f"{EVENTS}?type=bundles").data
        self.assertEqual(self.event_types(data), {"bundle_deadline"})

    def test_summary_endpoint(self):
        Document.objects.create(
            owner=self.alice,
            title="Overdue",
            expiry_date=self.today - timedelta(days=2),
        )
        self.client.force_authenticate(self.alice)
        data = self.client.get(SUMMARY).data
        self.assertEqual(data["overdue"], 1)
        self.assertIn("next_30_days", data)


class CalendarIcsTests(CalendarBaseTest):
    def test_ics_export_has_no_secrets(self):
        doc = Document.objects.create(owner=self.alice, title="Doc")
        f = DocumentFile.objects.create(
            document=doc,
            uploaded_by=self.alice,
            original_filename="a.pdf",
            content_type="application/pdf",
            file_size=1,
        )
        link = DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=doc,
            file=f,
            expires_at=timezone.now() + timedelta(days=6),
            access_code_required=True,
            access_code_hash="hash-secret",
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get(ICS)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("text/calendar", resp["Content-Type"])
        body = resp.content.decode("utf-8")
        self.assertIn("BEGIN:VCALENDAR", body)
        self.assertNotIn(link.token, body)
        self.assertNotIn("hash-secret", body)
