from django.conf import settings
from django.db import models


class ProductEvent(models.Model):
    """First-party, privacy-minimized product analytics event."""

    class EventType(models.TextChoices):
        USER_SIGNED_UP = "user_signed_up", "User signed up"
        USER_LOGGED_IN = "user_logged_in", "User logged in"
        ONBOARDING_STARTED = "onboarding_started", "Onboarding started"
        ONBOARDING_COMPLETED = "onboarding_completed", "Onboarding completed"
        DOCUMENT_CREATED = "document_created", "Document created"
        DOCUMENT_UPDATED = "document_updated", "Document updated"
        DOCUMENT_TRASHED = "document_trashed", "Document trashed"
        DOCUMENT_RESTORED = "document_restored", "Document restored"
        FILE_UPLOADED = "file_uploaded", "File uploaded"
        FILE_PREVIEWED = "file_previewed", "File previewed"
        FILE_DOWNLOADED = "file_downloaded", "File downloaded"
        EXPIRY_DATE_ADDED = "expiry_date_added", "Expiry date added"
        REMINDER_CREATED = "reminder_created", "Reminder created"
        ATTENTION_NEEDED_VIEWED = "attention_needed_viewed", "Attention needed viewed"
        CHECKLIST_CREATED = "checklist_created", "Checklist created"
        CHECKLIST_ITEM_COMPLETED = (
            "checklist_item_completed",
            "Checklist item completed",
        )
        BUNDLE_CREATED = "bundle_created", "Bundle created"
        SHARE_LINK_CREATED = "share_link_created", "Share link created"
        SHARE_LINK_OPENED = "share_link_opened", "Share link opened"
        SHARE_LINK_REVOKED = "share_link_revoked", "Share link revoked"
        ACCESS_CODE_FAILED = "access_code_failed", "Access code failed"
        ACCESS_CODE_VERIFIED = "access_code_verified", "Access code verified"
        EXPORT_REQUESTED = "export_requested", "Export requested"
        EXPORT_CREATED = "export_created", "Export created"
        BUNDLE_EXPORTED = "bundle_exported", "Bundle exported"
        EMERGENCY_PACK_CREATED = "emergency_pack_created", "Emergency pack created"
        PROOF_CREATED = "proof_created", "Proof created"
        PROOF_RECORD_CREATED = "proof_record_created", "Proof record created"
        ACCOUNT_DELETION_REQUESTED = (
            "account_deletion_requested",
            "Account deletion requested",
        )
        FEEDBACK_SUBMITTED = "feedback_submitted", "Feedback submitted"
        ERROR_RECORDED = "error_recorded", "Error recorded"
        SECURITY_EVENT_RECORDED = "security_event_recorded", "Security event recorded"
        TIMELINE_VIEWED = "timeline_viewed", "Timeline viewed"
        TRASH_RESTORE_USED = "trash_restore_used", "Trash restore used"
        EXTRACTION_REQUESTED = "extraction_requested", "Extraction requested"

    class Source(models.TextChoices):
        BACKEND = "backend", "Backend"
        FRONTEND = "frontend", "Frontend"
        SYSTEM = "system", "System"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_events",
    )
    event_type = models.CharField(max_length=64, choices=EventType.choices)
    event_source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.BACKEND,
    )
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=80, blank=True)
    session_id = models.CharField(max_length=120, blank=True)
    path = models.CharField(max_length=255, blank=True)
    method = models.CharField(max_length=12, blank=True)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    country = models.CharField(max_length=80, blank=True)
    region = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["event_source", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} at {self.created_at:%Y-%m-%d %H:%M}"


class FeedbackItem(models.Model):
    """User-submitted or founder-created product feedback."""

    class Category(models.TextChoices):
        BUG = "bug", "Bug"
        FEATURE_REQUEST = "feature_request", "Feature request"
        CONFUSION = "confusion", "Confusion"
        COMPLAINT = "complaint", "Complaint"
        PRAISE = "praise", "Praise"
        SECURITY_CONCERN = "security_concern", "Security concern"
        PRICING = "pricing", "Pricing"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        NEW = "new", "New"
        REVIEWED = "reviewed", "Reviewed"
        PLANNED = "planned", "Planned"
        IN_PROGRESS = "in_progress", "In progress"
        SHIPPED = "shipped", "Shipped"
        REJECTED = "rejected", "Rejected"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    class Source(models.TextChoices):
        IN_APP = "in_app", "In app"
        BETA_FORM = "beta_form", "Beta form"
        FOUNDER_NOTE = "founder_note", "Founder note"
        OTHER = "other", "Other"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feedback_items",
    )
    email = models.EmailField(blank=True)
    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        default=Category.OTHER,
    )
    title = models.CharField(max_length=160)
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    source = models.CharField(
        max_length=24,
        choices=Source.choices,
        default=Source.IN_APP,
    )
    related_path = models.CharField(max_length=255, blank=True)
    related_feature = models.CharField(max_length=120, blank=True)
    founder_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["priority", "created_at"]),
            models.Index(fields=["category", "created_at"]),
        ]

    def __str__(self):
        return self.title


class AppErrorLog(models.Model):
    """Lightweight application error log for founder monitoring."""

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        ERROR = "error", "Error"
        CRITICAL = "critical", "Critical"

    class Source(models.TextChoices):
        BACKEND = "backend", "Backend"
        FRONTEND = "frontend", "Frontend"
        WORKER = "worker", "Worker"
        SYSTEM = "system", "System"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="app_error_logs",
    )
    severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.ERROR,
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.FRONTEND,
    )
    error_type = models.CharField(max_length=120)
    message = models.TextField()
    path = models.CharField(max_length=255, blank=True)
    method = models.CharField(max_length=12, blank=True)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    traceback = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["severity", "created_at"]),
            models.Index(fields=["source", "created_at"]),
            models.Index(fields=["resolved", "created_at"]),
        ]

    def __str__(self):
        return f"{self.severity}: {self.error_type}"


class FeatureCompletionItem(models.Model):
    """Internal founder-maintained checklist for feature maturity."""

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        PARTIAL = "partial", "Partial"
        READY = "ready", "Ready"
        NEEDS_POLISH = "needs_polish", "Needs polish"
        DEFERRED = "deferred", "Deferred"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    key = models.SlugField(max_length=80, unique=True)
    feature_name = models.CharField(max_length=120)
    module = models.CharField(max_length=80)
    backend_done = models.BooleanField(default=False)
    frontend_done = models.BooleanField(default=False)
    tests_done = models.BooleanField(default=False)
    docs_done = models.BooleanField(default=False)
    polished = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    notes = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "feature_name"]
        indexes = [
            models.Index(fields=["module", "status"]),
            models.Index(fields=["priority", "status"]),
        ]

    def __str__(self):
        return self.feature_name


class LaunchChecklistItem(models.Model):
    """Founder-editable launch readiness checklist item."""

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    key = models.SlugField(max_length=80, unique=True)
    label = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    is_complete = models.BooleanField(default=False)
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    notes = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=100)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "label"]
        indexes = [
            models.Index(fields=["is_complete", "priority"]),
        ]

    def __str__(self):
        return self.label


class BetaUserProfile(models.Model):
    """Founder-only beta metadata attached to a user account."""

    class InviteStatus(models.TextChoices):
        NOT_INVITED = "not_invited", "Not invited"
        INVITED = "invited", "Invited"
        ACCEPTED = "accepted", "Accepted"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CHURNED = "churned", "Churned"

    class Persona(models.TextChoices):
        INTERNATIONAL_STUDENT = "international_student", "International student"
        VISA_HOLDER = "visa_holder", "Visa holder"
        SCHOLARSHIP_APPLICANT = "scholarship_applicant", "Scholarship applicant"
        FREELANCER = "freelancer", "Freelancer"
        FAMILY_USER = "family_user", "Family user"
        STUDENT_LEADER = "student_leader", "Student leader"
        TRAVELER = "traveler", "Traveler"
        OTHER = "other", "Other"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="beta_profile",
    )
    invite_status = models.CharField(
        max_length=24,
        choices=InviteStatus.choices,
        default=InviteStatus.NOT_INVITED,
    )
    persona = models.CharField(
        max_length=40,
        choices=Persona.choices,
        default=Persona.OTHER,
    )
    tags = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    invited_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    last_contacted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__email"]
        indexes = [
            models.Index(fields=["invite_status", "persona"]),
        ]

    def __str__(self):
        return f"Beta profile for user {self.user_id}"


class FounderAuditLog(models.Model):
    """Privacy-safe audit trail for founder/admin console actions."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="founder_audit_logs",
    )
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=80, blank=True)
    path = models.CharField(max_length=255, blank=True)
    method = models.CharField(max_length=12, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action} at {self.created_at:%Y-%m-%d %H:%M}"
