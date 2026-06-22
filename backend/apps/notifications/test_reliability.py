"""
Beta-reliability tests for the notification pipeline: honest email-skip when no
provider is configured, run-history recording, richer run summary, and
founder-only delivery-health metrics.
"""

import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document, DocumentFile
from apps.notifications.models import Notification, NotificationDeliveryRun
from apps.notifications.services import process_due_notifications

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-notif-reliability-media-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


@override_settings(
    MEDIA_ROOT=_TEMP_MEDIA,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <noreply@example.com>",
    DUENEST_APP_BASE_URL="http://localhost:3000",
)
class NotificationReliabilityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="StrongPassword123!DueNest",
        )
        self.today = timezone.localdate()

    def _due_document(self):
        document = Document.objects.create(
            owner=self.user, title="Passport", expiry_date=self.today + timedelta(days=7)
        )
        DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file=make_pdf(),
            original_filename="passport.pdf",
            content_type="application/pdf",
            file_size=24,
        )
        return document

    @override_settings(EMAIL_CONFIGURED=True)
    def test_run_records_history_and_rich_summary(self):
        self._due_document()
        summary = process_due_notifications(limit=50)

        for key in (
            "emails_sent",
            "emails_skipped",
            "emails_failed",
            "in_app_delivered",
            "duration_ms",
            "status",
            "started_at",
            "finished_at",
        ):
            self.assertIn(key, summary)

        run = NotificationDeliveryRun.objects.latest("started_at")
        self.assertEqual(run.status, NotificationDeliveryRun.Status.SUCCESS)
        self.assertGreaterEqual(run.evaluated, 1)

    def test_dry_run_records_no_history_and_sends_nothing(self):
        self._due_document()
        process_due_notifications(limit=50, dry_run=True)
        self.assertEqual(NotificationDeliveryRun.objects.count(), 0)
        self.assertEqual(Notification.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_CONFIGURED=False)
    def test_email_not_configured_is_skipped_not_failed_or_faked(self):
        self._due_document()
        summary = process_due_notifications(limit=50)

        # In-app still delivered; email honestly recorded as skipped.
        self.assertEqual(len(mail.outbox), 0)
        self.assertGreaterEqual(summary["emails_skipped"], 1)
        self.assertEqual(summary["emails_failed"], 0)

        note = Notification.objects.filter(type=Notification.Type.DOCUMENT_EXPIRY).first()
        self.assertIsNotNone(note)
        self.assertIsNotNone(note.delivered_in_app_at)
        self.assertIsNone(note.delivered_email_at)
        self.assertEqual(note.email_last_error, "not_configured")
        self.assertEqual(note.email_attempts, 0)  # not consumed
        # Not marked failed — it will deliver once a provider is configured.
        self.assertEqual(note.status, Notification.Status.DELIVERED)

    @override_settings(EMAIL_CONFIGURED=True)
    def test_idempotent_no_duplicate_notifications_or_emails(self):
        self._due_document()
        process_due_notifications(limit=50)
        process_due_notifications(limit=50)
        self.assertEqual(
            Notification.objects.filter(type=Notification.Type.DOCUMENT_EXPIRY).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)


class FounderNotificationHealthAuthTests(APITestCase):
    def setUp(self):
        self.normal = User.objects.create_user(
            username="normal",
            email="normal@example.com",
            password="StrongPassword123!DueNest",
        )
        self.founder = User.objects.create_user(
            username="founder",
            email="founder@example.com",
            password="StrongPassword123!DueNest",
            is_staff=True,
        )
        self.url = reverse("founder-notification-health")

    def test_anonymous_denied(self):
        response = self.client.get(self.url)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_normal_user_forbidden(self):
        self.client.force_authenticate(self.normal)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_founder_allowed_and_shape_is_safe(self):
        self.client.force_authenticate(self.founder)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertIn("email", body)
        self.assertIn("today", body)
        self.assertIn("recent_runs", body)
        self.assertIn("email_failure_rate_7d", body)
        # No notification contents / PII leaked in failure samples.
        for failure in body.get("recent_failures", []):
            self.assertNotIn("title", failure)
            self.assertNotIn("message", failure)
