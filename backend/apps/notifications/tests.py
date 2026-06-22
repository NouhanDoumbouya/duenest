import shutil
import tempfile
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentFile,
    DocumentReminderRule,
    EmergencyAccessPack,
)
from apps.notifications.models import Notification, NotificationPreference
from apps.notifications.services import (
    _candidate,
    create_notification,
    deliver_notification,
    process_due_notifications,
)
from apps.organizations.models import (
    DocumentRequest,
    Organization,
    OrganizationMembership,
)
from apps.subscriptions.models import Subscription

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-notifications-test-media-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


@override_settings(
    MEDIA_ROOT=_TEMP_MEDIA,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <noreply@example.com>",
    DUENEST_APP_BASE_URL="http://localhost:3000",
)
class NotificationDeliveryTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="StrongPassword123!DueNest",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="StrongPassword123!DueNest",
        )
        self.today = timezone.localdate()

    def make_document(self, owner=None, *, with_file=True, **kwargs):
        owner = owner or self.alice
        data = {"title": "Passport", "expiry_date": self.today + timedelta(days=7)}
        data.update(kwargs)
        document = Document.objects.create(owner=owner, **data)
        if with_file:
            DocumentFile.objects.create(
                document=document,
                uploaded_by=owner,
                file=make_pdf(),
                original_filename="passport.pdf",
                content_type="application/pdf",
                file_size=24,
            )
        return document

    def make_subscription(self, owner=None, **kwargs):
        owner = owner or self.alice
        data = {
            "name": "Streaming",
            "amount": Decimal("12.00"),
            "currency": "USD",
            "billing_cycle": Subscription.BillingCycle.MONTHLY,
            "next_billing_date": self.today + timedelta(days=7),
            "status": Subscription.Status.ACTIVE,
            "reminder_days_before": 7,
        }
        data.update(kwargs)
        return Subscription.objects.create(owner=owner, **data)

    def process(self, **kwargs):
        options = {"limit": 50}
        options.update(kwargs)
        return process_due_notifications(**options)

    def test_due_document_expiry_creates_notification_and_email(self):
        document = self.make_document()

        summary = self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        self.assertEqual(summary["created"], 1)
        notification = Notification.objects.get(
            user=self.alice,
            type=Notification.Type.DOCUMENT_EXPIRY,
            source_id=str(document.id),
        )
        self.assertEqual(notification.status, Notification.Status.DELIVERED)
        self.assertIsNotNone(notification.delivered_in_app_at)
        self.assertIsNotNone(notification.delivered_email_at)
        self.assertEqual(len(mail.outbox), 1)

    def test_due_subscription_renewal_creates_notification(self):
        subscription = self.make_subscription()

        self.process(type_filter=Notification.Type.SUBSCRIPTION_RENEWAL)

        self.assertTrue(
            Notification.objects.filter(
                user=self.alice,
                type=Notification.Type.SUBSCRIPTION_RENEWAL,
                source_id=str(subscription.id),
            ).exists()
        )

    def test_cancellation_deadline_creates_notification(self):
        subscription = self.make_subscription(
            cancellation_deadline=self.today + timedelta(days=1)
        )

        self.process(type_filter=Notification.Type.SUBSCRIPTION_CANCELLATION)

        self.assertTrue(
            Notification.objects.filter(
                user=self.alice,
                type=Notification.Type.SUBSCRIPTION_CANCELLATION,
                source_id=str(subscription.id),
            ).exists()
        )

    def test_trashed_document_does_not_create_expiry_notification(self):
        document = self.make_document(is_trashed=True, trashed_at=timezone.now())

        self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        self.assertFalse(
            Notification.objects.filter(source_id=str(document.id)).exists()
        )

    def test_cancelled_subscription_does_not_create_renewal_notification(self):
        subscription = self.make_subscription(status=Subscription.Status.CANCELLED)

        self.process(type_filter=Notification.Type.SUBSCRIPTION_RENEWAL)

        self.assertFalse(
            Notification.objects.filter(source_id=str(subscription.id)).exists()
        )

    def test_duplicate_command_run_does_not_duplicate_notification_or_email(self):
        self.make_document()

        self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)
        self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        self.assertEqual(
            Notification.objects.filter(type=Notification.Type.DOCUMENT_EXPIRY).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)

    def test_email_disabled_keeps_in_app_notification(self):
        NotificationPreference.objects.create(
            user=self.alice,
            email_enabled=False,
            in_app_enabled=True,
        )
        self.make_document()

        self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        notification = Notification.objects.get(type=Notification.Type.DOCUMENT_EXPIRY)
        self.assertIsNotNone(notification.delivered_in_app_at)
        self.assertIsNone(notification.delivered_email_at)
        self.assertEqual(notification.status, Notification.Status.DELIVERED)
        self.assertEqual(len(mail.outbox), 0)

    def test_notification_can_be_marked_read(self):
        notification = Notification.objects.create(
            user=self.alice,
            type=Notification.Type.GENERIC_REMINDER,
            title="Review",
            message="Open CertaNest.",
            severity=Notification.Severity.INFO,
            status=Notification.Status.DELIVERED,
            dedupe_key="generic:read",
        )
        self.client.force_authenticate(self.alice)

        response = self.client.post(
            f"/api/v1/notifications/{notification.id}/mark-read/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertEqual(notification.status, Notification.Status.READ)
        self.assertIsNotNone(notification.read_at)

    def test_notification_can_be_dismissed(self):
        notification = Notification.objects.create(
            user=self.alice,
            type=Notification.Type.GENERIC_REMINDER,
            title="Review",
            message="Open CertaNest.",
            severity=Notification.Severity.INFO,
            status=Notification.Status.DELIVERED,
            dedupe_key="generic:dismiss",
        )
        self.client.force_authenticate(self.alice)

        response = self.client.post(f"/api/v1/notifications/{notification.id}/dismiss/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertEqual(notification.status, Notification.Status.DISMISSED)
        self.assertIsNotNone(notification.dismissed_at)
        self.assertIsNotNone(notification.read_at)

    def test_notification_action_url_is_sanitized(self):
        candidate = _candidate(
            user=self.alice,
            notification_type=Notification.Type.GENERIC_REMINDER,
            title="Unsafe link",
            message="Open CertaNest.",
            severity=Notification.Severity.INFO,
            source_type="test",
            source_id="1",
            action_url="https://example.test/?token=secret",
            scheduled_for=timezone.now(),
            dedupe_key="generic:unsafe",
        )

        self.assertEqual(candidate.action_url, "/dashboard")

    def test_security_alert_stays_in_app_when_security_email_disabled(self):
        NotificationPreference.objects.create(
            user=self.alice,
            email_enabled=True,
            in_app_enabled=True,
            security_alerts_enabled=False,
        )
        notification, _ = create_notification(
            _candidate(
                user=self.alice,
                notification_type=Notification.Type.SECURITY_ALERT,
                title="Security alert",
                message="Open CertaNest.",
                severity=Notification.Severity.SECURITY,
                source_type="account",
                source_id=str(self.alice.id),
                action_url="/dashboard/trust",
                scheduled_for=timezone.now(),
                dedupe_key="security:in-app",
            )
        )

        deliver_notification(notification)

        notification.refresh_from_db()
        self.assertIsNotNone(notification.delivered_in_app_at)
        self.assertIsNone(notification.delivered_email_at)
        self.assertEqual(notification.status, Notification.Status.DELIVERED)
        self.assertEqual(len(mail.outbox), 0)

    def test_organization_request_notification_respects_role(self):
        organization = Organization.objects.create(
            name="Student Association",
            organization_type=Organization.OrganizationType.STUDENT_ASSOCIATION,
            created_by=self.alice,
        )
        owner_membership = OrganizationMembership.objects.create(
            organization=organization,
            user=self.alice,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        viewer_membership = OrganizationMembership.objects.create(
            organization=organization,
            user=self.bob,
            role=OrganizationMembership.Role.VIEWER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        request = DocumentRequest.objects.create(
            organization=organization,
            requested_by=self.alice,
            assigned_to_member=owner_membership,
            title="Upload passport",
            deadline=self.today + timedelta(days=1),
            status=DocumentRequest.Status.OPEN,
        )
        self.process(
            user_id=self.alice.id,
            type_filter=Notification.Type.ORGANIZATION_REQUEST_DUE,
        )
        self.process(
            user_id=self.bob.id,
            type_filter=Notification.Type.ORGANIZATION_REQUEST_DUE,
        )

        self.assertTrue(
            Notification.objects.filter(
                user=self.alice,
                type=Notification.Type.ORGANIZATION_REQUEST_DUE,
                source_id=str(request.id),
            ).exists()
        )
        self.assertFalse(
            Notification.objects.filter(
                user=self.bob,
                type=Notification.Type.ORGANIZATION_REQUEST_DUE,
                source_id=str(request.id),
            ).exists()
        )
        self.assertEqual(viewer_membership.role, OrganizationMembership.Role.VIEWER)

    def test_emergency_email_does_not_expose_tokens_or_vault_details(self):
        pack = EmergencyAccessPack.objects.create(
            owner=self.alice,
            title="Family vault secret",
            status=EmergencyAccessPack.Status.ACTIVE,
            access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
            expires_at=timezone.now() + timedelta(days=1),
            token="public-secret-token",
            access_code_hash="hashed-secret-code",
            metadata={"private_notes": "doctor contact", "raw_text": "vault text"},
        )

        self.process(type_filter=Notification.Type.EMERGENCY_EXPIRING)

        notification = Notification.objects.get(
            type=Notification.Type.EMERGENCY_EXPIRING,
            source_id=str(pack.id),
        )
        self.assertNotIn("token", notification.metadata)
        email_text = mail.outbox[0].body
        email_html = mail.outbox[0].alternatives[0][0]
        combined = email_text + email_html
        self.assertNotIn("public-secret-token", combined)
        self.assertNotIn("hashed-secret-code", combined)
        self.assertNotIn("doctor contact", combined)
        self.assertNotIn("vault text", combined)
        self.assertNotIn("Family vault secret", combined)

    def test_failed_email_marks_delivery_failed(self):
        self.make_document()

        with patch(
            "apps.notifications.services.send_notification_email",
            side_effect=RuntimeError("smtp down"),
        ):
            self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        notification = Notification.objects.get(type=Notification.Type.DOCUMENT_EXPIRY)
        self.assertEqual(notification.status, Notification.Status.FAILED)
        self.assertEqual(notification.email_attempts, 1)
        self.assertEqual(notification.email_last_error, "send_failed")
        self.assertIsNotNone(notification.delivered_in_app_at)

    def test_dry_run_does_not_create_or_send(self):
        self.make_document()

        call_command(
            "process_due_notifications",
            dry_run=True,
            type_filter=Notification.Type.DOCUMENT_EXPIRY,
            limit=10,
        )

        self.assertEqual(Notification.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_timezone_aware_generation_uses_user_local_date(self):
        NotificationPreference.objects.create(
            user=self.alice,
            timezone="Asia/Kuala_Lumpur",
            default_reminder_lead_days=[0],
        )
        document = self.make_document(expiry_date=datetime(2026, 6, 15).date())
        now = datetime(2026, 6, 14, 16, 30, tzinfo=dt_timezone.utc)

        self.process(
            now=now,
            type_filter=Notification.Type.DOCUMENT_EXPIRY,
        )

        notification = Notification.objects.get(
            type=Notification.Type.DOCUMENT_EXPIRY,
            source_id=str(document.id),
        )
        self.assertEqual(notification.metadata["target_date"], "2026-06-15")

    def test_document_reminder_rule_is_used_for_custom_lead_day(self):
        document = self.make_document(expiry_date=self.today + timedelta(days=14))
        DocumentReminderRule.objects.create(
            owner=self.alice,
            document=document,
            trigger_type=DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
            days_before=14,
            is_enabled=True,
        )

        self.process(type_filter=Notification.Type.DOCUMENT_EXPIRY)

        notification = Notification.objects.get(
            type=Notification.Type.DOCUMENT_EXPIRY,
            source_id=str(document.id),
        )
        self.assertEqual(notification.metadata["lead_days"], 14)
