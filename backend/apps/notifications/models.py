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
    push_enabled = models.BooleanField(default=False)
    # Quiet hours suppress *push* nudges during a daily window (in the user's
    # notification timezone). In-app notifications are never suppressed — only
    # the device/lock-screen push is held back. Hours are 0–23; a window that
    # wraps midnight (e.g. 22 → 7) is supported.
    push_quiet_hours_enabled = models.BooleanField(default=False)
    push_quiet_start_hour = models.PositiveSmallIntegerField(default=22)
    push_quiet_end_hour = models.PositiveSmallIntegerField(default=7)
    document_reminders_enabled = models.BooleanField(default=True)
    subscription_reminders_enabled = models.BooleanField(default=True)
    checklist_bundle_reminders_enabled = models.BooleanField(default=True)
    organization_reminders_enabled = models.BooleanField(default=True)
    emergency_reminders_enabled = models.BooleanField(default=True)
    security_alerts_enabled = models.BooleanField(default=True)
    activity_notifications_enabled = models.BooleanField(default=False)
    reminder_digest_enabled = models.BooleanField(default=False)
    # Opt-in weekly AI briefing email ("what to do now"). Default off — strictly
    # opt-in, and only delivered when AI + email are configured and the user can
    # see the ai_briefing feature.
    ai_briefing_digest_enabled = models.BooleanField(default=False)
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
        EMERGENCY_REQUEST = "emergency_request", "Emergency access requested"
        EMERGENCY_UNLOCK = "emergency_unlock", "Emergency access unlocked"
        SECURITY_ALERT = "security_alert", "Security alert"
        FAILED_LOGIN_WARNING = "failed_login_warning", "Failed login warning"
        STORAGE_PLAN_WARNING = "storage_plan_warning", "Storage/plan warning"
        BILLING_PAYMENT_FAILED = "billing_payment_failed", "Billing payment failed"
        BILLING_CANCELED = "billing_canceled", "Billing canceled"
        BILLING_TRIAL_ENDING = "billing_trial_ending", "Billing trial ending"
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


class NotificationDeliveryRun(models.Model):
    """
    A record of one `process_due_notifications` execution, for founder/admin
    delivery-health visibility (last successful run, failure rate, recent runs).
    Stores aggregate counts only — never user data or notification contents.
    """

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial (some failures)"
        FAILED = "failed", "Failed"

    class Trigger(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        MANUAL = "manual", "Manual"

    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    duration_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.SUCCESS
    )
    trigger = models.CharField(
        max_length=12, choices=Trigger.choices, default=Trigger.SCHEDULED
    )
    evaluated = models.PositiveIntegerField(default=0)
    created = models.PositiveIntegerField(default=0)
    existing = models.PositiveIntegerField(default=0)
    in_app_delivered = models.PositiveIntegerField(default=0)
    emails_sent = models.PositiveIntegerField(default=0)
    emails_skipped = models.PositiveIntegerField(default=0)
    emails_failed = models.PositiveIntegerField(default=0)
    skipped_preferences = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["-started_at"]),
            models.Index(fields=["status", "-started_at"]),
        ]

    def __str__(self):
        return f"DeliveryRun {self.started_at:%Y-%m-%d %H:%M} ({self.status})"


class PushWebSubscription(models.Model):
    """
    A browser/PWA Web Push subscription owned by one user.

    Stores only the standard Web Push endpoint + public keys needed to deliver a
    push to that device. No document content, notification body, OS account, or
    precise device identity is stored. A user may have several (one per device).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    # Coarse, non-identifying client label (e.g. "Chrome on Android"), for the
    # user's own "your devices" list — never a raw user agent.
    device_label = models.CharField(max_length=120, blank=True)
    failure_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"PushSubscription for user {self.user_id}"


class SuppressedEmail(models.Model):
    """An email address we must not (or should not) send to.

    ``scope=all`` (hard bounce / spam complaint) suppresses *every* category —
    the address is dead or hostile. ``scope=marketing`` (unsubscribe) suppresses
    only non-essential mail; essential transactional mail (password reset, email
    verification, receipts) still sends. The send path checks this before every
    branded email.
    """

    class Scope(models.TextChoices):
        ALL = "all", "All mail"
        MARKETING = "marketing", "Marketing / lifecycle only"

    class Reason(models.TextChoices):
        BOUNCE = "bounce", "Hard bounce"
        COMPLAINT = "complaint", "Spam complaint"
        UNSUBSCRIBE = "unsubscribe", "Unsubscribed"
        MANUAL = "manual", "Manually suppressed"

    email = models.EmailField(unique=True)
    scope = models.CharField(max_length=12, choices=Scope.choices, default=Scope.ALL)
    reason = models.CharField(
        max_length=16, choices=Reason.choices, default=Reason.BOUNCE
    )
    detail = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return f"Suppressed<{self.email}:{self.scope}>"


class EmailLog(models.Model):
    """A record of one branded email send attempt (for support + analytics).

    Stores only routing metadata — email type, recipient, subject, outcome —
    never document contents or secrets. ``provider_message_id`` and the
    delivered/opened/bounced timestamps are filled in later from ESP webhooks.
    """

    class Status(models.TextChoices):
        SENT = "sent", "Sent to provider"
        FAILED = "failed", "Failed"
        SUPPRESSED = "suppressed", "Suppressed"
        DELIVERED = "delivered", "Delivered"
        BOUNCED = "bounced", "Bounced"
        COMPLAINED = "complained", "Spam complaint"

    class Category(models.TextChoices):
        TRANSACTIONAL = "transactional", "Transactional"
        LIFECYCLE = "lifecycle", "Lifecycle"
        MARKETING = "marketing", "Marketing"

    email_type = models.CharField(max_length=64, db_index=True)
    category = models.CharField(
        max_length=16, choices=Category.choices, default=Category.TRANSACTIONAL
    )
    recipient = models.EmailField()
    subject = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.SENT
    )
    error = models.CharField(max_length=255, blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    bounced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email_type", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"EmailLog<{self.email_type}:{self.status}>"
