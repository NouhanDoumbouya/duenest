from django.conf import settings
from django.db import models
from django.utils import timezone


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
        WAITLIST_JOINED = "waitlist_joined", "Waitlist joined"
        INVITE_CREATED = "invite_created", "Invite created"
        INVITE_SENT_OR_COPIED = "invite_sent_or_copied", "Invite sent or copied"
        INVITE_VALIDATED = "invite_validated", "Invite validated"
        INVITE_USED = "invite_used", "Invite used"
        PRIVATE_BETA_SIGNUP_COMPLETED = (
            "private_beta_signup_completed",
            "Private beta signup completed",
        )
        ORGANIZATION_CREATED = "organization_created", "Organization created"
        # Client-recorded UI interaction events (see ClientEventCreateView).
        DASHBOARD_VIEWED = "dashboard_viewed", "Dashboard viewed"
        VAULT_VIEWED = "vault_viewed", "Vault viewed"
        VAULT_CARD_CLICKED = "vault_card_clicked", "Vault card clicked"
        QUICK_ACTION_USED = "quick_action_used", "Quick action used"
        EMPTY_STATE_CTA_USED = "empty_state_cta_used", "Empty-state CTA used"
        FORGETTING_CHECK_USED = "forgetting_check_used", "What am I forgetting used"
        DASHBOARD_LOAD_FAILED = "dashboard_load_failed", "Dashboard load failed"

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
    client_event_id = models.CharField(max_length=120, blank=True, db_index=True)
    dedupe_key = models.CharField(max_length=128, blank=True, db_index=True)
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

    class ContactPreference(models.TextChoices):
        EMAIL = "email", "Email"
        IN_APP = "in_app", "In app"
        NO_REPLY = "no_reply", "No reply needed"

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
    urgency = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    contact_preference = models.CharField(
        max_length=20,
        choices=ContactPreference.choices,
        default=ContactPreference.EMAIL,
    )
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
    founder_response = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
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


class WaitlistEntry(models.Model):
    """Public private-beta waitlist entry, visible only to founders/admins."""

    class Persona(models.TextChoices):
        INTERNATIONAL_STUDENT = "international_student", "International student"
        VISA_HOLDER = "visa_holder", "Visa holder"
        SCHOLARSHIP_APPLICANT = "scholarship_applicant", "Scholarship applicant"
        FREELANCER = "freelancer", "Freelancer"
        FAMILY_DOCUMENTS = "family_documents", "Family documents"
        TRAVELER = "traveler", "Traveler"
        STUDENT_LEADER = "student_leader", "Student leader"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        INVITED = "invited", "Invited"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    full_name = models.CharField(max_length=140)
    email = models.EmailField()
    persona = models.CharField(max_length=40, choices=Persona.choices)
    country = models.CharField(max_length=80, blank=True)
    message = models.TextField(blank=True)
    referral_source = models.CharField(max_length=160, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    founder_notes = models.TextField(blank=True)
    invite_code = models.ForeignKey(
        "InviteCode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waitlist_entries",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waitlist_invitations_sent",
    )
    accepted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_waitlist_entries",
    )
    invited_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "status"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["persona", "created_at"]),
            models.Index(fields=["country", "created_at"]),
        ]

    def __str__(self):
        return f"{self.email} ({self.status})"


class InviteCode(models.Model):
    """Founder-created private-beta invite code."""

    code = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=140)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_invite_codes",
    )
    max_uses = models.PositiveIntegerField(default=1)
    used_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    persona_target = models.CharField(
        max_length=40,
        choices=WaitlistEntry.Persona.choices,
        blank=True,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["is_active", "expires_at"]),
            models.Index(fields=["persona_target", "created_at"]),
        ]

    @property
    def is_expired(self):
        return bool(self.expires_at and self.expires_at <= timezone.now())

    @property
    def remaining_uses(self):
        return max(0, self.max_uses - self.used_count)

    @property
    def status_label(self):
        if not self.is_active:
            return "disabled"
        if self.is_expired:
            return "expired"
        if self.remaining_uses <= 0:
            return "used_up"
        return "active"

    def can_be_used(self):
        return self.status_label == "active"

    def __str__(self):
        return self.code


class InviteCodeUse(models.Model):
    """Audit trail of successful invite-code use during signup."""

    invite_code = models.ForeignKey(
        InviteCode,
        on_delete=models.CASCADE,
        related_name="uses",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invite_code_uses",
    )
    waitlist_entry = models.ForeignKey(
        WaitlistEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invite_uses",
    )
    email = models.EmailField()
    metadata = models.JSONField(default=dict, blank=True)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-used_at"]
        indexes = [
            models.Index(fields=["email", "used_at"]),
            models.Index(fields=["invite_code", "used_at"]),
        ]

    def __str__(self):
        return f"{self.email} used {self.invite_code_id}"


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


class MarketingCampaign(models.Model):
    """Founder-managed growth campaign tracked via UTM parameters + events."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    description = models.TextField(blank=True)
    channel = models.CharField(max_length=80, blank=True)
    source = models.CharField(max_length=80, blank=True)
    medium = models.CharField(max_length=80, blank=True)
    # The utm_campaign value used for attribution (defaults to slug).
    campaign = models.CharField(max_length=120, blank=True)
    content = models.CharField(max_length=120, blank=True)
    target_audience = models.CharField(max_length=120, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    budget_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=8, blank=True, default="USD")
    goal = models.CharField(max_length=200, blank=True)
    cta = models.CharField(max_length=160, blank=True)
    landing_url = models.URLField(blank=True)
    generated_url = models.URLField(blank=True, max_length=600)
    tags = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_campaigns_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_campaigns_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["campaign"]),
        ]

    def __str__(self):
        return self.name

    @property
    def attribution_key(self) -> str:
        """The utm_campaign value used to attribute events to this campaign."""
        return (self.campaign or self.slug or "").lower()


class CampaignLink(models.Model):
    """A saved UTM link belonging to a campaign. Metrics are computed live."""

    campaign = models.ForeignKey(
        MarketingCampaign,
        on_delete=models.CASCADE,
        related_name="links",
    )
    label = models.CharField(max_length=160, blank=True)
    base_url = models.URLField(max_length=600)
    full_url = models.URLField(max_length=600)
    source = models.CharField(max_length=80, blank=True)
    medium = models.CharField(max_length=80, blank=True)
    content = models.CharField(max_length=120, blank=True)
    term = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_campaign_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.label or self.full_url


class GrowthAction(models.Model):
    """A recommended or manual founder growth action (the Action Center)."""

    class Priority(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        DONE = "done", "Done"
        SNOOZED = "snoozed", "Snoozed"
        DISMISSED = "dismissed", "Dismissed"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    reason = models.TextField(blank=True)
    action_type = models.CharField(max_length=60, blank=True)
    priority = models.CharField(
        max_length=12, choices=Priority.choices, default=Priority.MEDIUM
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN
    )
    related_metric = models.CharField(max_length=120, blank=True)
    campaign = models.ForeignKey(
        MarketingCampaign,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_actions",
    )
    due_at = models.DateTimeField(null=True, blank=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_actions_owned",
    )
    action_url = models.CharField(max_length=300, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    # Stable key for auto-generated actions so we don't create duplicates.
    rule_key = models.CharField(max_length=120, blank=True, db_index=True)
    created_automatically = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_actions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "priority"]),
        ]

    def __str__(self):
        return self.title


class ContentItem(models.Model):
    """Founder marketing content calendar item."""

    class Status(models.TextChoices):
        IDEA = "idea", "Idea"
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        PUBLISHED = "published", "Published"
        MEASURING = "measuring", "Measuring"
        REPURPOSE = "repurpose", "Repurpose"
        ARCHIVED = "archived", "Archived"

    class Priority(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    title = models.CharField(max_length=200)
    channel = models.CharField(max_length=80, blank=True)
    content_type = models.CharField(max_length=80, blank=True)
    target_audience = models.CharField(max_length=120, blank=True)
    campaign = models.ForeignKey(
        "MarketingCampaign",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="content_items",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IDEA)
    priority = models.CharField(
        max_length=12, choices=Priority.choices, default=Priority.MEDIUM
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    cta = models.CharField(max_length=160, blank=True)
    utm_link = models.URLField(max_length=600, blank=True)
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    # Founder-recorded qualitative/quantitative results.
    result_metrics = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_content_items",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_at", "-created_at"]
        indexes = [models.Index(fields=["status", "scheduled_at"])]

    def __str__(self):
        return self.title


class AudienceSegment(models.Model):
    """A founder-defined audience segment evaluated against user data."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    # Simple, safe rule object, e.g. {"plan": "free", "activation": "activated",
    # "goal": "international_student", "min_documents": 1}.
    rules_json = models.JSONField(default=dict, blank=True)
    is_dynamic = models.BooleanField(default=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_segments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AmbassadorProfile(models.Model):
    """A campus/community ambassador and their tracked performance."""

    class Status(models.TextChoices):
        CANDIDATE = "candidate", "Candidate"
        INVITED = "invited", "Invited"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        REMOVED = "removed", "Removed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ambassador_profiles",
    )
    name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    community = models.CharField(max_length=160, blank=True)
    campus = models.CharField(max_length=160, blank=True)
    referral_code = models.CharField(max_length=40, blank=True, db_index=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.CANDIDATE
    )
    notes = models.TextField(blank=True)
    reward_notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_ambassadors_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ReferralProfile(models.Model):
    """A user's referral code/link. Metrics are computed from attributions."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_profile",
    )
    referral_code = models.CharField(max_length=40, unique=True, db_index=True)
    reward_status = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Referral {self.referral_code} (user {self.user_id})"


class ReferralAttribution(models.Model):
    """Logs that a referred user signed up via a referrer (anti self-referral)."""

    class Status(models.TextChoices):
        SIGNED_UP = "signed_up", "Signed up"
        ACTIVATED = "activated", "Activated"
        CONVERTED = "converted", "Converted"

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referrals_made",
    )
    referred_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_source",
    )
    referral_code = models.CharField(max_length=40, blank=True)
    campaign = models.ForeignKey(
        "MarketingCampaign",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referral_attributions",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.SIGNED_UP
    )
    reward_status = models.CharField(max_length=40, blank=True)
    signup_at = models.DateTimeField(default=timezone.now)
    activated_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-signup_at"]
        indexes = [models.Index(fields=["referrer", "status"])]

    def __str__(self):
        return f"{self.referrer_id} → {self.referred_user_id}"


class UserAttribution(models.Model):
    """First- and last-touch acquisition attribution for a user (privacy-safe)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attribution",
    )
    first_utm_source = models.CharField(max_length=120, blank=True)
    first_utm_medium = models.CharField(max_length=120, blank=True)
    first_utm_campaign = models.CharField(max_length=120, blank=True)
    first_utm_content = models.CharField(max_length=120, blank=True)
    first_utm_term = models.CharField(max_length=120, blank=True)
    first_referrer = models.CharField(max_length=300, blank=True)
    first_landing_page = models.CharField(max_length=300, blank=True)
    last_utm_source = models.CharField(max_length=120, blank=True)
    last_utm_medium = models.CharField(max_length=120, blank=True)
    last_utm_campaign = models.CharField(max_length=120, blank=True)
    last_utm_content = models.CharField(max_length=120, blank=True)
    last_utm_term = models.CharField(max_length=120, blank=True)
    last_referrer = models.CharField(max_length=300, blank=True)
    last_landing_page = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["first_utm_campaign"])]

    def __str__(self):
        return f"Attribution for user {self.user_id}"
