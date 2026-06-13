import os
import secrets
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from .constants import PREVIEWABLE_CONTENT_TYPES, PREVIEWABLE_EXTENSIONS


def generate_share_token() -> str:
    """Unguessable, URL-safe token that reveals no internal ids."""
    return secrets.token_urlsafe(32)


def document_file_upload_to(instance, filename):
    """
    Build a structured, non-guessable storage path and never trust the
    user-supplied filename for the path itself.

    media/documents/user_<user_id>/document_<document_id>/<uuid><ext>
    """
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    return (
        f"documents/user_{instance.uploaded_by_id}"
        f"/document_{instance.document_id}/{safe_name}"
    )


class DocumentCategory(models.Model):
    """
    A shared, app-wide grouping for documents (e.g. Passport, Visa, Insurance).

    Categories are not user-owned; they are a controlled vocabulary that any
    user's documents can reference. A document's category is optional.
    """

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "document categories"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Auto-derive a slug from the name when one is not supplied.
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Document(models.Model):
    """
    Metadata for a single user-owned document.

    This stores only metadata — there is intentionally no file field yet. Each
    document belongs to exactly one owner, and all access must be scoped to that
    owner (see the viewset queryset).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        RENEWAL_DUE = "renewal_due", "Renewal due"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    category = models.ForeignKey(
        DocumentCategory,
        on_delete=models.SET_NULL,
        related_name="documents",
        null=True,
        blank=True,
    )

    title = models.CharField(max_length=255)
    document_type = models.CharField(max_length=100, blank=True)
    issuer = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    reference_number = models.CharField(max_length=255, null=True, blank=True)

    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    renewal_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "expiry_date"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.owner})"

    def clean(self):
        """Cross-field date validation, enforced at the model layer too."""
        if (
            self.issue_date
            and self.expiry_date
            and self.expiry_date < self.issue_date
        ):
            raise ValidationError(
                {"expiry_date": "Expiry date cannot be earlier than the issue date."}
            )
        if (
            self.renewal_date
            and self.expiry_date
            and self.renewal_date > self.expiry_date
        ):
            raise ValidationError(
                {"renewal_date": "Renewal date cannot be later than the expiry date."}
            )


class DocumentFile(models.Model):
    """
    A file attached to a user-owned Document.

    Ownership is enforced through the parent document: a file is accessible
    only if `file.document.owner == request.user`. The stored path is internal
    and is never exposed in API responses — clients use a controlled download
    endpoint instead.
    """

    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="files",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uploaded_document_files",
    )
    file = models.FileField(upload_to=document_file_upload_to)

    # Stored for display/validation only — never used to build storage paths.
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    # SHA-256 hex digest of the uploaded bytes (integrity / dedupe aid).
    checksum = models.CharField(max_length=64, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return f"{self.original_filename} ({self.document_id})"

    @property
    def is_previewable(self) -> bool:
        """Whether this file can be previewed inline (PDF/JPEG/PNG)."""
        ext = os.path.splitext(self.original_filename)[1].lower()
        return (
            self.content_type in PREVIEWABLE_CONTENT_TYPES
            and ext in PREVIEWABLE_EXTENSIONS
        )


class DocumentFileShareLink(models.Model):
    """
    A revocable, time-limited link granting controlled access to ONE file.

    A share link never exposes the owner's vault — only the single file, with
    the permission the owner chose. Expiry and revocation are enforced on every
    request; an optional access code adds a second factor.
    """

    class Permission(models.TextChoices):
        VIEW_ONLY = "view_only", "View only"
        DOWNLOAD_ALLOWED = "download_allowed", "View and download"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_file_share_links",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="file_share_links",
    )
    file = models.ForeignKey(
        DocumentFile,
        on_delete=models.CASCADE,
        related_name="share_links",
    )
    token = models.CharField(
        max_length=128, unique=True, db_index=True, default=generate_share_token
    )
    permission = models.CharField(
        max_length=32,
        choices=Permission.choices,
        default=Permission.VIEW_ONLY,
    )
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    access_code_required = models.BooleanField(default=False)
    # Hashed access code only — never stored or returned in plain text.
    access_code_hash = models.CharField(max_length=255, blank=True)

    # Owner-facing only — never exposed through public share endpoints.
    label = models.CharField(max_length=120, blank=True)
    recipient_email = models.EmailField(blank=True)
    purpose = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["file", "created_at"]),
        ]

    def __str__(self):
        return f"ShareLink({self.token[:8]}… for file {self.file_id})"

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_active(self) -> bool:
        return not self.is_revoked and not self.is_expired

    @property
    def download_allowed(self) -> bool:
        return self.permission == self.Permission.DOWNLOAD_ALLOWED


class DocumentFileActivity(models.Model):
    """
    Owner-only activity trail for a file (preview, download, share, etc.).

    Visible only to the owning user. Public share viewers never see it. Logging
    must never break the main flow, and access codes are never logged.
    """

    class Action(models.TextChoices):
        FILE_UPLOADED = "file_uploaded", "File uploaded"
        FILE_PREVIEWED = "file_previewed", "File previewed"
        FILE_DOWNLOADED = "file_downloaded", "File downloaded"
        SHARE_CREATED = "share_created", "Share link created"
        SHARE_OPENED = "share_opened", "Share link opened"
        SHARE_PREVIEWED = "share_previewed", "Shared file previewed"
        SHARE_DOWNLOADED = "share_downloaded", "Shared file downloaded"
        SHARE_REVOKED = "share_revoked", "Share link revoked"
        SHARE_CODE_VERIFIED = "share_access_code_verified", "Access code verified"
        SHARE_CODE_FAILED = "share_access_code_failed", "Access code failed"
        FILE_DELETED = "file_deleted", "File deleted"

    class ActorType(models.TextChoices):
        OWNER = "owner", "Owner"
        SHARED_VIEWER = "shared_viewer", "Shared viewer"
        SYSTEM = "system", "System"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_file_activities",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="file_activities",
    )
    file = models.ForeignKey(
        DocumentFile,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    share_link = models.ForeignKey(
        DocumentFileShareLink,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    action = models.CharField(max_length=64, choices=Action.choices)
    actor_type = models.CharField(max_length=32, choices=ActorType.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["file", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action} on file {self.file_id}"


class DocumentBundle(models.Model):
    """
    An owner-owned grouping of documents and requirements for a renewal,
    application, travel prep, or proof pack.

    A bundle is the user's "what do I need to prepare" workspace. Its readiness
    score is derived from its required requirements (see ``services``). Bundles
    are useful even before OCR exists — they simply track what is needed and
    whether each item is attached yet.
    """

    class BundleType(models.TextChoices):
        RENEWAL = "renewal", "Renewal"
        APPLICATION = "application", "Application"
        TRAVEL = "travel", "Travel"
        EMERGENCY = "emergency", "Emergency"
        SCHOLARSHIP = "scholarship", "Scholarship"
        INSURANCE = "insurance", "Insurance"
        CUSTOM = "custom", "Custom"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        IN_PROGRESS = "in_progress", "In progress"
        READY = "ready", "Ready"
        SUBMITTED = "submitted", "Submitted"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_bundles",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    bundle_type = models.CharField(
        max_length=20,
        choices=BundleType.choices,
        default=BundleType.RENEWAL,
    )
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    country = models.CharField(max_length=100, blank=True)
    authority_or_provider = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    # Cached 0–100 readiness, recomputed from required requirements whenever a
    # requirement changes. Always recalculated through ``recalculate_readiness``
    # so it never drifts from the underlying requirements within the API flow.
    readiness_score = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "target_date"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.owner})"

    def recalculate_readiness(self, *, save=True):
        """Recompute the cached readiness score from current requirements."""
        from .services import bundle_readiness

        readiness = bundle_readiness(self)
        self.readiness_score = readiness.score
        if save:
            self.save(update_fields=["readiness_score", "updated_at"])
        return readiness


class DocumentBundleRequirement(models.Model):
    """
    A single thing a bundle needs (a document, file, proof, payment, or form).

    A requirement can be linked to an existing owner-owned document and/or file.
    Required requirements drive the parent bundle's readiness score.
    """

    class RequirementType(models.TextChoices):
        DOCUMENT = "document", "Document"
        FILE = "file", "File"
        PROOF = "proof", "Proof"
        PAYMENT = "payment", "Payment"
        FORM = "form", "Form"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        MISSING = "missing", "Missing"
        ATTACHED = "attached", "Attached"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_bundle_requirements",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(default=True)
    requirement_type = models.CharField(
        max_length=20,
        choices=RequirementType.choices,
        default=RequirementType.DOCUMENT,
    )
    expected_document_type = models.CharField(max_length=100, blank=True)
    linked_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bundle_requirements",
    )
    linked_file = models.ForeignKey(
        DocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bundle_requirements",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.MISSING,
    )
    due_date = models.DateField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["bundle", "sort_order"]),
            models.Index(fields=["owner", "status"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.bundle_id})"

    @property
    def is_satisfied(self) -> bool:
        """A requirement counts as done when attached or completed."""
        return self.status in {self.Status.ATTACHED, self.Status.COMPLETED}


class DocumentChecklistTemplate(models.Model):
    """
    A reusable, system- or owner-provided checklist blueprint.

    System templates (``is_system_template=True``) are shared across all users
    and are seeded via the ``seed_checklist_templates`` management command. They
    are never user-owned and are read-only through the API.
    """

    class ChecklistType(models.TextChoices):
        RENEWAL = "renewal", "Renewal"
        APPLICATION = "application", "Application"
        TRAVEL = "travel", "Travel"
        INSURANCE = "insurance", "Insurance"
        CUSTOM = "custom", "Custom"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    document_type = models.CharField(max_length=100, blank=True)
    use_case = models.CharField(max_length=100, blank=True)
    checklist_type = models.CharField(
        max_length=20,
        choices=ChecklistType.choices,
        default=ChecklistType.RENEWAL,
    )
    country = models.CharField(max_length=100, blank=True)
    is_system_template = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Stable key for system templates so re-seeding updates rather than dupes.
    slug = models.SlugField(max_length=140, unique=True, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "title"]
        indexes = [
            models.Index(fields=["is_active", "sort_order"]),
        ]

    def __str__(self):
        return self.title


class DocumentChecklistItemTemplate(models.Model):
    """A single item belonging to a checklist template."""

    template = models.ForeignKey(
        DocumentChecklistTemplate,
        on_delete=models.CASCADE,
        related_name="item_templates",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Days from the checklist due date when this item should be done (optional).
    suggested_due_offset_days = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.title} ({self.template_id})"


class DocumentChecklist(models.Model):
    """
    An owner-owned preparation checklist, optionally tied to a document and/or
    bundle and optionally created from a template.

    Progress is derived from its items (see ``services.checklist_progress``) and
    cached on ``progress_percent`` / ``status`` via ``recalculate_progress``.
    """

    class ChecklistType(models.TextChoices):
        RENEWAL = "renewal", "Renewal"
        APPLICATION = "application", "Application"
        TRAVEL = "travel", "Travel"
        INSURANCE = "insurance", "Insurance"
        CUSTOM = "custom", "Custom"

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_checklists",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="checklists",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checklists",
    )
    template = models.ForeignKey(
        DocumentChecklistTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checklists",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    checklist_type = models.CharField(
        max_length=20,
        choices=ChecklistType.choices,
        default=ChecklistType.RENEWAL,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    progress_percent = models.PositiveSmallIntegerField(default=0)
    due_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.owner})"

    def recalculate_progress(self, *, save=True):
        """Recompute cached progress + status from the checklist's items."""
        from .services import checklist_progress

        progress = checklist_progress(self)
        self.progress_percent = progress.percent
        self.status = progress.status
        if save:
            self.save(update_fields=["progress_percent", "status", "updated_at"])
        return progress


class DocumentChecklistItem(models.Model):
    """A single actionable item within an owner-owned checklist."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_checklist_items",
    )
    checklist = models.ForeignKey(
        DocumentChecklist,
        on_delete=models.CASCADE,
        related_name="items",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    due_date = models.DateField(null=True, blank=True)
    linked_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checklist_items",
    )
    linked_file = models.ForeignKey(
        DocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checklist_items",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["checklist", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.checklist_id})"

    @property
    def is_done(self) -> bool:
        """Completed or skipped items both count as resolved for progress."""
        return self.status in {self.Status.COMPLETED, self.Status.SKIPPED}


class DocumentExtraction(models.Model):
    """
    An OCR-assisted detail extraction attempt for one file.

    This is a safe foundation, not an automatic pipeline: extracted fields are
    always staged for the owner to review and must be explicitly applied. Files
    are never sent to a third-party service here — see ``services`` for the
    pluggable provider abstraction (currently manual / local PDF text only).
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        NEEDS_REVIEW = "needs_review", "Needs review"

    class Provider(models.TextChoices):
        MANUAL = "manual", "Manual"
        LOCAL_TEXT = "local_text", "Local text"
        FUTURE_OCR = "future_ocr", "Future OCR"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_extractions",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="extractions",
    )
    file = models.ForeignKey(
        DocumentFile,
        on_delete=models.CASCADE,
        related_name="extractions",
    )
    extraction_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    # Raw text is owner-only and never exposed through public endpoints.
    raw_text = models.TextField(blank=True)
    extracted_fields = models.JSONField(default=dict, blank=True)
    confidence_score = models.FloatField(null=True, blank=True)
    provider = models.CharField(
        max_length=20,
        choices=Provider.choices,
        default=Provider.LOCAL_TEXT,
    )
    error_message = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["file", "created_at"]),
        ]

    def __str__(self):
        return f"Extraction({self.extraction_status}) for file {self.file_id}"


class DocumentReminderRule(models.Model):
    """
    Owner-scoped rule for calculating reminder dates.

    This stores user intent only. It does not send notifications; later
    notification workers can evaluate enabled rules and create/send reminders.
    """

    class TriggerType(models.TextChoices):
        BEFORE_EXPIRY = "before_expiry", "Before expiry"
        BEFORE_RENEWAL_DATE = "before_renewal_date", "Before renewal date"
        ON_EXPIRY = "on_expiry", "On expiry"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_reminder_rules",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="reminder_rules",
    )
    trigger_type = models.CharField(
        max_length=32,
        choices=TriggerType.choices,
        default=TriggerType.BEFORE_EXPIRY,
    )
    days_before = models.PositiveIntegerField(default=30)
    is_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["days_before", "-created_at"]
        indexes = [
            models.Index(fields=["owner", "is_enabled"]),
            models.Index(fields=["document", "trigger_type"]),
        ]

    def __str__(self):
        return f"{self.get_trigger_type_display()} for {self.document_id}"
