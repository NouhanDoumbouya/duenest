from django.conf import settings
from django.db import models
from django.utils import timezone


def default_lead_days():
    return [90, 30, 7, 1]


class NotificationPreference(models.Model):
    """Per-user delivery preferences for reminders and notifications."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    document_reminders_enabled = models.BooleanField(default=True)
    subscription_reminders_enabled = models.BooleanField(default=True)
    checklist_bundle_reminders_enabled = models.BooleanField(default=True)
    organization_reminders_enabled = models.BooleanField(default=True)
    emergency_reminders_enabled = models.BooleanField(default=True)
    security_alerts_enabled = models.BooleanField(default=True)
    activity_notifications_enabled = models.BooleanField(default=False)
    reminder_digest_enabled = models.BooleanField(default=False)
    default_reminder_lead_days = models.JSONField(default=default_lead_days, blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user_id"]

    def __str__(self):
        return f"Notification preferences for user {self.user_id}"


class Notification(models.Model):
    """A safe in-app/email notification generated from owner-scoped app events."""

    class Type(models.TextChoices):
        DOCUMENT_EXPIRY = "document_expiry", "Document expiry"
        DOCUMENT_RENEWAL = "document_renewal", "Document renewal"
        DOCUMENT_MISSING_FILE = "document_missing_file", "Document missing file"
        DOCUMENT_REVIEW_NEEDED = "document_review_needed", "Document review needed"
        SUBSCRIPTION_RENEWAL = "subscription_renewal", "Subscription renewal"
        SUBSCRIPTION_CANCELLATION = (
            "subscription_cancellation_deadline",
            "Subscription cancellation deadline",
        )
        SUBSCRIPTION_TRIAL = "subscription_trial_ending", "Subscription trial ending"
        SUBSCRIPTION_PAYMENT_DUE = "subscription_payment_due", "Subscription payment due"
        SUBSCRIPTION_PAYMENT_OVERDUE = (
            "subscription_payment_overdue",
            "Subscription payment overdue",
        )
        BUNDLE_DEADLINE = "bundle_deadline", "Bundle deadline"
        BUNDLE_INCOMPLETE = "bundle_incomplete", "Bundle incomplete"
        CHECKLIST_ITEM_DUE = "checklist_item_due", "Checklist item due"
        CHECKLIST_MISSING_FILE = "checklist_missing_file", "Checklist missing file"
        ORGANIZATION_REQUEST_DUE = "organization_request_due", "Organization request due"
        ORGANIZATION_SUBMISSION_REVIEW = (
            "organization_submission_review",
            "Organization submission review",
        )
        ORGANIZATION_CAMPAIGN_DEADLINE = (
            "organization_campaign_deadline",
            "Organization campaign deadline",
        )
        ORGANIZATION_MEMBER_MISSING_DOCUMENT = (
            "organization_member_missing_document",
            "Organization member missing document",
        )
        SHARE_EXPIRING = "share_expiring", "Share expiring"
        ROOM_EXPIRING = "room_expiring", "Secure room expiring"
        SHARE_VIEWED = "share_viewed", "Share viewed"
        EMERGENCY_REVIEW = "emergency_review", "Emergency review"
        EMERGENCY_EXPIRING = "emergency_expiring", "Emergency access expiring"
        EMERGENCY_VIEWED = "emergency_viewed", "Emergency access viewed"
        SECURITY_ALERT = "security_alert", "Security alert"
        FAILED_LOGIN_WARNING = "failed_login_warning", "Failed login warning"
        STORAGE_PLAN_WARNING = "storage_plan_warning", "Storage/plan warning"
        GENERIC_REMINDER = "generic_reminder", "Generic reminder"

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        URGENT = "urgent", "Urgent"
        SECURITY = "security", "Security"
        SUCCESS = "success", "Success"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        DELIVERED = "delivered", "Delivered"
        READ = "read", "Read"
        DISMISSED = "dismissed", "Dismissed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=64, choices=Type.choices)
    title = models.CharField(max_length=255)
    message = models.TextField()
    severity = models.CharField(
        max_length=20, choices=Severity.choices, default=Severity.INFO
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    source_type = models.CharField(max_length=80, blank=True)
    source_id = models.CharField(max_length=64, blank=True)
    action_url = models.CharField(max_length=500, blank=True)
    scheduled_for = models.DateTimeField(default=timezone.now, db_index=True)
    delivered_in_app_at = models.DateTimeField(null=True, blank=True)
    delivered_email_at = models.DateTimeField(null=True, blank=True)
    email_attempts = models.PositiveSmallIntegerField(default=0)
    email_last_error = models.CharField(max_length=120, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    dedupe_key = models.CharField(max_length=255, unique=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status", "created_at"]),
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["type", "scheduled_for"]),
            models.Index(fields=["source_type", "source_id"]),
        ]

    def __str__(self):
        return f"{self.type} for user {self.user_id}"

    @property
    def is_unread(self) -> bool:
        return self.read_at is None and self.status != self.Status.DISMISSED
