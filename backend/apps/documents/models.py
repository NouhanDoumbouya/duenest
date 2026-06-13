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

    class Availability(models.TextChoices):
        YES = "yes", "Yes"
        NO = "no", "No"
        UNKNOWN = "unknown", "Unknown"

    class Lifecycle(models.TextChoices):
        """
        Where a document is in the user's real-world process. This is owner-set
        and deliberately separate from the date-derived ``computed_status`` so
        the two never fight each other.
        """

        DRAFT = "draft", "Draft"
        COLLECTED = "collected", "Collected"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        RENEWED = "renewed", "Renewed"
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

    # Physical document location — sensitive owner-only data describing where the
    # original/copies live. Never exposed through public share or emergency-pack
    # endpoints.
    physical_location_label = models.CharField(max_length=255, blank=True)
    physical_location_details = models.TextField(blank=True)
    original_available = models.CharField(
        max_length=10, choices=Availability.choices, default=Availability.UNKNOWN
    )
    certified_copy_available = models.CharField(
        max_length=10, choices=Availability.choices, default=Availability.UNKNOWN
    )
    translation_available = models.CharField(
        max_length=10, choices=Availability.choices, default=Availability.UNKNOWN
    )
    notes_about_original = models.TextField(blank=True)

    # Lifecycle status — owner-managed, separate from the computed expiry status.
    lifecycle_status = models.CharField(
        max_length=20,
        choices=Lifecycle.choices,
        default=Lifecycle.COLLECTED,
    )

    # Optional manual override for the "last safe action" date. When blank, the
    # date is computed from renewal/expiry (see services.compute_last_safe_action).
    last_safe_action_date = models.DateField(null=True, blank=True)

    # Type-specific extra fields (e.g. passport number, policy number). Stored as
    # a flat JSON object of string keys/values — kept owner-only like all metadata.
    custom_fields = models.JSONField(default=dict, blank=True)

    # User-owned tags for organisation and filtering.
    tags = models.ManyToManyField(
        "DocumentTag",
        related_name="documents",
        blank=True,
    )

    # Soft delete (trash). Trashed documents are hidden from active lists,
    # intelligence, timeline, reminders, and share access until restored.
    is_trashed = models.BooleanField(default=False)
    trashed_at = models.DateTimeField(null=True, blank=True)
    deletion_reason = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "expiry_date"]),
            models.Index(fields=["owner", "is_trashed"]),
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

    # Soft delete (trash). Trashed files are hidden from active lists and can no
    # longer be reached through existing share links until restored.
    is_trashed = models.BooleanField(default=False)
    trashed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["document", "created_at"]),
            models.Index(fields=["document", "is_trashed"]),
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

    class AccessLimitType(models.TextChoices):
        UNLIMITED = "unlimited", "Unlimited access"
        ONE_TIME = "one_time", "One-time view"
        LIMITED_COUNT = "limited_count", "Limited number of views"

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

    # Access limits. Enforced server-side on every preview/download. A one-time
    # link is consumed by the first preview; a limited link counts each view
    # (and download). max_downloads caps downloads independently.
    access_limit_type = models.CharField(
        max_length=20,
        choices=AccessLimitType.choices,
        default=AccessLimitType.UNLIMITED,
    )
    max_views = models.PositiveIntegerField(null=True, blank=True)
    view_count = models.PositiveIntegerField(default=0)
    max_downloads = models.PositiveIntegerField(null=True, blank=True)
    download_count = models.PositiveIntegerField(default=0)
    limit_reached_at = models.DateTimeField(null=True, blank=True)

    # Screenshot deterrence (not prevention — browsers cannot block OS-level
    # screenshots). When enabled, the public preview shows a dynamic watermark
    # and/or blurs when the viewer leaves the tab.
    watermark_enabled = models.BooleanField(default=False)
    privacy_screen_enabled = models.BooleanField(default=False)

    # Owner-facing only — never exposed through public share endpoints, EXCEPT
    # recipient_email may appear inside the watermark when watermarking is on
    # (it marks the copy for the intended recipient, who already knows it).
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
    def download_allowed(self) -> bool:
        return self.permission == self.Permission.DOWNLOAD_ALLOWED

    @property
    def view_cap(self):
        """Maximum allowed previews, or None when unlimited."""
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            return 1
        if self.access_limit_type == self.AccessLimitType.LIMITED_COUNT:
            return self.max_views
        return None

    @property
    def download_cap(self):
        """Maximum allowed downloads, or None when uncapped."""
        caps = []
        if self.max_downloads:
            caps.append(self.max_downloads)
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            caps.append(1)
        return min(caps) if caps else None

    @property
    def is_view_limit_reached(self) -> bool:
        cap = self.view_cap
        return cap is not None and self.view_count >= cap

    @property
    def is_download_limit_reached(self) -> bool:
        cap = self.download_cap
        return cap is not None and self.download_count >= cap

    @property
    def is_limit_reached(self) -> bool:
        """Whether the link can no longer be opened/previewed at all."""
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            return (self.view_count + self.download_count) >= 1
        return self.is_view_limit_reached

    @property
    def is_active(self) -> bool:
        return (
            not self.is_revoked
            and not self.is_expired
            and not self.is_limit_reached
        )

    @property
    def watermark_text(self) -> str:
        """Recipient marker for the watermark (only used when enabled)."""
        return self.recipient_email or self.label or ""

    @property
    def short_id(self) -> str:
        """A short, non-secret share identifier (token is already in the URL)."""
        return self.token[:8]


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
        SHARE_LIMIT_REACHED = "share_limit_reached", "Share access limit reached"
        SHARE_BLOCKED_LIMIT_REACHED = (
            "share_blocked_limit_reached",
            "Share access blocked (limit reached)",
        )
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
        LOCAL_OCR = "local_ocr", "Local OCR (Tesseract)"
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


def export_upload_to(instance, filename):
    """Private storage path for generated export files."""
    ext = os.path.splitext(filename)[1].lower() or ".json"
    return f"exports/user_{instance.owner_id}/{uuid.uuid4().hex}{ext}"


class DocumentVersion(models.Model):
    """
    A point-in-time snapshot of a document's important metadata (and, when a
    file is involved, that file's display info).

    Versions are owner-owned history. They store *snapshots* of metadata only —
    never internal file paths — so a user can see what changed and safely
    restore previous metadata. File blobs are not duplicated here: a version may
    reference an existing ``DocumentFile`` (see the file-versioning limitation in
    the docs).
    """

    class VersionType(models.TextChoices):
        FILE_UPLOAD = "file_upload", "File uploaded"
        FILE_REPLACEMENT = "file_replacement", "File replaced"
        METADATA_SNAPSHOT = "metadata_snapshot", "Metadata snapshot"
        EXTRACTION_APPLIED = "extraction_applied", "Extraction applied"
        MANUAL_UPDATE = "manual_update", "Manual update"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_versions",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    file = models.ForeignKey(
        DocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    version_type = models.CharField(
        max_length=32,
        choices=VersionType.choices,
        default=VersionType.METADATA_SNAPSHOT,
    )

    # Metadata snapshots (state at the time the version was recorded).
    title_snapshot = models.CharField(max_length=255, blank=True)
    document_type_snapshot = models.CharField(max_length=100, blank=True)
    issuer_snapshot = models.CharField(max_length=255, blank=True)
    country_snapshot = models.CharField(max_length=100, blank=True)
    reference_number_snapshot = models.CharField(max_length=255, blank=True)
    issue_date_snapshot = models.DateField(null=True, blank=True)
    expiry_date_snapshot = models.DateField(null=True, blank=True)
    renewal_date_snapshot = models.DateField(null=True, blank=True)
    notes_snapshot = models.TextField(blank=True)

    # File display snapshots (never the storage path).
    file_name_snapshot = models.CharField(max_length=255, blank=True)
    file_size_snapshot = models.PositiveIntegerField(null=True, blank=True)
    file_content_type_snapshot = models.CharField(max_length=120, blank=True)

    change_summary = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_document_versions",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "version_number"],
                name="unique_document_version_number",
            )
        ]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["document", "version_number"]),
        ]

    def __str__(self):
        return f"v{self.version_number} of document {self.document_id}"


class DocumentExportRequest(models.Model):
    """
    A user-requested export of their structured document data.

    Exports contain metadata only (no raw files in this branch). The generated
    file is stored privately and served through an owner-only, expiring download
    endpoint. Secrets (share tokens, access codes) and internal paths are never
    included.
    """

    class ExportType(models.TextChoices):
        DOCUMENTS_JSON = "documents_json", "Documents (JSON)"
        DOCUMENTS_CSV = "documents_csv", "Documents (CSV)"
        FULL_VAULT_METADATA = "full_vault_metadata", "Full vault metadata (JSON)"
        BUNDLE_METADATA_JSON = "bundle_metadata_json", "Bundle metadata (JSON)"
        BUNDLE_REQUIREMENTS_CSV = "bundle_requirements_csv", "Bundle requirements (CSV)"
        FUTURE_FULL_ARCHIVE = "future_full_archive", "Full archive (future)"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_exports",
    )
    export_type = models.CharField(
        max_length=32,
        choices=ExportType.choices,
        default=ExportType.DOCUMENTS_JSON,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    file = models.FileField(upload_to=export_upload_to, null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["owner", "requested_at"]),
        ]

    def __str__(self):
        return f"{self.export_type} export for {self.owner_id}"

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and timezone.now() >= self.expires_at


class EmergencyAccessPack(models.Model):
    """
    A controlled pack of selected documents/files prepared for emergency use.

    A pack grants access ONLY to the items the owner explicitly adds — never the
    whole vault. When shared, access is token-gated with optional expiry and an
    optional access code, and can be disabled at any time.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"
        EXPIRED = "expired", "Expired"

    class AccessMode(models.TextChoices):
        OWNER_ONLY_PREVIEW = "owner_only_preview", "Owner only (preview)"
        SHARE_LINK = "share_link", "Shareable link"
        FUTURE_TRUSTED_CONTACT = "future_trusted_contact", "Trusted contact (future)"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_packs",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    access_mode = models.CharField(
        max_length=32,
        choices=AccessMode.choices,
        default=AccessMode.OWNER_ONLY_PREVIEW,
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    access_code_required = models.BooleanField(default=False)
    access_code_hash = models.CharField(max_length=255, blank=True)
    token = models.CharField(
        max_length=128, unique=True, null=True, blank=True, db_index=True
    )
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    disabled_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.owner})"

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and timezone.now() >= self.expires_at

    @property
    def is_shareable_now(self) -> bool:
        """Whether a public token currently grants access."""
        return (
            self.access_mode == self.AccessMode.SHARE_LINK
            and self.status == self.Status.ACTIVE
            and bool(self.token)
            and not self.is_expired
        )


class EmergencyAccessPackItem(models.Model):
    """One selected document (and optional specific file) inside a pack."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_pack_items",
    )
    pack = models.ForeignKey(
        EmergencyAccessPack,
        on_delete=models.CASCADE,
        related_name="items",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="emergency_pack_items",
    )
    file = models.ForeignKey(
        DocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emergency_pack_items",
    )
    notes = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["pack", "sort_order"]),
        ]

    def __str__(self):
        return f"Item doc {self.document_id} in pack {self.pack_id}"


class ProofRecord(models.Model):
    """
    Proof of submission/payment/outcome connected to a document, bundle,
    checklist, or file (e.g. a submission confirmation, receipt, tracking
    number, or approval letter).

    Owner-owned; any linked object must belong to the same owner. Never exposed
    through public endpoints.
    """

    class ProofType(models.TextChoices):
        SUBMISSION_CONFIRMATION = "submission_confirmation", "Submission confirmation"
        PAYMENT_RECEIPT = "payment_receipt", "Payment receipt"
        TRACKING_NUMBER = "tracking_number", "Tracking number"
        APPROVAL_LETTER = "approval_letter", "Approval letter"
        REJECTION_NOTICE = "rejection_notice", "Rejection notice"
        EMAIL_CONFIRMATION = "email_confirmation", "Email confirmation"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        SAVED = "saved", "Saved"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        NEEDS_FOLLOW_UP = "needs_follow_up", "Needs follow-up"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="proof_records",
    )
    title = models.CharField(max_length=255)
    proof_type = models.CharField(
        max_length=32,
        choices=ProofType.choices,
        default=ProofType.SUBMISSION_CONFIRMATION,
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="proof_records",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proof_records",
    )
    checklist = models.ForeignKey(
        DocumentChecklist,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proof_records",
    )
    linked_file = models.ForeignKey(
        DocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proof_records",
    )
    reference_number = models.CharField(max_length=255, blank=True)
    submitted_to = models.CharField(max_length=255, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SAVED
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_proof_type_display()})"


class DocumentActivity(models.Model):
    """
    Document-scoped, user-facing activity events (created, updated, trashed,
    checklist/proof/export/emergency actions, etc.).

    This complements the lower-level ``DocumentFileActivity`` (file/share
    events). The user-facing activity timeline merges both. Owner-only; logging
    must never break the main flow.
    """

    class Action(models.TextChoices):
        DOCUMENT_CREATED = "document_created", "Document created"
        DOCUMENT_UPDATED = "document_updated", "Document updated"
        DOCUMENT_TRASHED = "document_trashed", "Document moved to trash"
        DOCUMENT_RESTORED = "document_restored", "Document restored"
        DOCUMENT_VERSION_RESTORED = "document_version_restored", "Version restored"
        FILE_TRASHED = "file_trashed", "File moved to trash"
        FILE_RESTORED = "file_restored", "File restored"
        CHECKLIST_CREATED = "checklist_created", "Checklist created"
        CHECKLIST_ITEM_COMPLETED = "checklist_item_completed", "Checklist item completed"
        EXTRACTION_REQUESTED = "extraction_requested", "Detail extraction requested"
        EXTRACTION_APPLIED = "extraction_applied", "Extracted details applied"
        PROOF_SAVED = "proof_saved", "Proof saved"
        EXPORT_REQUESTED = "export_requested", "Export requested"
        EMERGENCY_PACK_CREATED = "emergency_pack_created", "Emergency pack created"
        EMERGENCY_PACK_OPENED = "emergency_pack_opened", "Emergency pack opened"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_activities",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="activities",
    )
    action = models.CharField(max_length=48, choices=Action.choices)
    actor_type = models.CharField(max_length=32, default="owner")
    title = models.CharField(max_length=255, blank=True)
    description = models.CharField(max_length=500, blank=True)

    related_file = models.ForeignKey(
        DocumentFile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    related_checklist = models.ForeignKey(
        DocumentChecklist, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    related_bundle = models.ForeignKey(
        DocumentBundle, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    related_proof = models.ForeignKey(
        ProofRecord, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action} (doc {self.document_id})"


class DocumentTag(models.Model):
    """
    A user-owned label for organising documents.

    Tags are private to their owner (unlike the shared ``DocumentCategory``
    vocabulary) and are unique per owner by slug so the same name isn't created
    twice.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_tags",
    )
    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=80, blank=True)
    # Optional small palette key the UI maps to a colour; never free-form CSS.
    color = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "slug"], name="unique_tag_slug_per_owner"
            )
        ]
        indexes = [
            models.Index(fields=["owner", "slug"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner_id})"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:80]
        super().save(*args, **kwargs)


class DocumentRenewalEvent(models.Model):
    """
    A recorded renewal in a document's history (e.g. "passport renewed in 2026").

    Owner-owned history. Captures what changed (old/new expiry) and the cost, and
    can link to a proof record from the same owner. Never exposed publicly.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_renewal_events",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="renewal_events",
    )
    renewal_date = models.DateField()
    previous_expiry_date = models.DateField(null=True, blank=True)
    new_expiry_date = models.DateField(null=True, blank=True)
    cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=3, blank=True)
    notes = models.TextField(blank=True)
    proof = models.ForeignKey(
        "ProofRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="renewal_events",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-renewal_date", "-created_at"]
        indexes = [
            models.Index(fields=["owner", "renewal_date"]),
            models.Index(fields=["document", "renewal_date"]),
        ]

    def __str__(self):
        return f"Renewal {self.renewal_date} for document {self.document_id}"


class DocumentAppointment(models.Model):
    """
    An appointment tied to a document and/or a bundle (e.g. a biometrics
    appointment, an interview, a notary visit).

    Owner-owned. At least one of document/bundle should be set; both must belong
    to the same owner (enforced in the serializer).
    """

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        MISSED = "missed", "Missed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_appointments",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="appointments",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="appointments",
    )
    title = models.CharField(max_length=255)
    appointment_at = models.DateTimeField()
    location = models.CharField(max_length=255, blank=True)
    reference_number = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["appointment_at"]
        indexes = [
            models.Index(fields=["owner", "appointment_at"]),
            models.Index(fields=["document", "appointment_at"]),
        ]

    def __str__(self):
        return f"{self.title} @ {self.appointment_at:%Y-%m-%d}"


class DocumentPayment(models.Model):
    """
    Expected/actual renewal or application cost tied to a document and/or bundle.

    Owner-owned. Tracks budgeting (expected) vs reality (actual) and an optional
    proof/receipt link from the same owner.
    """

    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PARTIAL = "partial", "Partially paid"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"
        WAIVED = "waived", "Waived"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_payments",
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="payments",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    label = models.CharField(max_length=255)
    expected_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    actual_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=3, blank=True)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    payment_date = models.DateField(null=True, blank=True)
    proof = models.ForeignKey(
        "ProofRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return f"{self.label} ({self.payment_status})"


class ShareRoom(models.Model):
    """
    A secure room: a controlled, token-gated collection of selected documents,
    files, and proofs shared with a recipient.

    A room exposes ONLY the items the owner explicitly adds — never the whole
    vault. Permission, expiry, revocation, an optional access code, watermarking,
    and view/download limits are all enforced server-side on every request.
    """

    class Permission(models.TextChoices):
        VIEW_ONLY = "view_only", "View only"
        DOWNLOAD_ALLOWED = "download_allowed", "View and download"

    class AccessLimitType(models.TextChoices):
        UNLIMITED = "unlimited", "Unlimited access"
        ONE_TIME = "one_time", "One-time view"
        LIMITED_COUNT = "limited_count", "Limited number of views"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="share_rooms",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    token = models.CharField(
        max_length=128, unique=True, db_index=True, default=generate_share_token
    )
    permission = models.CharField(
        max_length=32,
        choices=Permission.choices,
        default=Permission.VIEW_ONLY,
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    access_code_required = models.BooleanField(default=False)
    access_code_hash = models.CharField(max_length=255, blank=True)

    watermark_enabled = models.BooleanField(default=False)
    privacy_screen_enabled = models.BooleanField(default=False)

    access_limit_type = models.CharField(
        max_length=20,
        choices=AccessLimitType.choices,
        default=AccessLimitType.UNLIMITED,
    )
    max_views = models.PositiveIntegerField(null=True, blank=True)
    view_count = models.PositiveIntegerField(default=0)
    max_downloads = models.PositiveIntegerField(null=True, blank=True)
    download_count = models.PositiveIntegerField(default=0)
    limit_reached_at = models.DateTimeField(null=True, blank=True)

    # Owner-facing only — never exposed through public room endpoints (except
    # recipient_email inside the watermark when watermarking is on).
    recipient_email = models.EmailField(blank=True)
    label = models.CharField(max_length=120, blank=True)
    purpose = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["token"]),
            models.Index(fields=["owner", "revoked_at"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"Room({self.token[:8]}… {self.title})"

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and timezone.now() >= self.expires_at

    @property
    def download_allowed(self) -> bool:
        return self.permission == self.Permission.DOWNLOAD_ALLOWED

    @property
    def view_cap(self):
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            return 1
        if self.access_limit_type == self.AccessLimitType.LIMITED_COUNT:
            return self.max_views
        return None

    @property
    def download_cap(self):
        caps = []
        if self.max_downloads:
            caps.append(self.max_downloads)
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            caps.append(1)
        return min(caps) if caps else None

    @property
    def is_view_limit_reached(self) -> bool:
        cap = self.view_cap
        return cap is not None and self.view_count >= cap

    @property
    def is_download_limit_reached(self) -> bool:
        cap = self.download_cap
        return cap is not None and self.download_count >= cap

    @property
    def is_limit_reached(self) -> bool:
        if self.access_limit_type == self.AccessLimitType.ONE_TIME:
            return (self.view_count + self.download_count) >= 1
        return self.is_view_limit_reached

    @property
    def is_active(self) -> bool:
        return (
            not self.is_revoked
            and not self.is_expired
            and not self.is_limit_reached
        )

    @property
    def watermark_text(self) -> str:
        return self.recipient_email or self.label or self.title or ""

    @property
    def short_id(self) -> str:
        return self.token[:8]


class ShareRoomItem(models.Model):
    """
    One item exposed by a secure room: a document, a single file, or a proof.

    Items are always owned by the room owner (validated on creation). Removing an
    item revokes access to it through the room immediately.
    """

    room = models.ForeignKey(
        ShareRoom,
        on_delete=models.CASCADE,
        related_name="items",
    )
    document = models.ForeignKey(
        "Document",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="share_room_items",
    )
    file = models.ForeignKey(
        "DocumentFile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="share_room_items",
    )
    proof = models.ForeignKey(
        "ProofRecord",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="share_room_items",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["room", "sort_order"]),
        ]

    def __str__(self):
        return f"RoomItem(room={self.room_id})"


class RoomActivity(models.Model):
    """Owner-only activity trail for a secure room. Access codes are never logged."""

    class Action(models.TextChoices):
        ROOM_CREATED = "room_created", "Room created"
        ROOM_OPENED = "room_opened", "Room opened"
        ROOM_PREVIEWED = "room_previewed", "Room item previewed"
        ROOM_DOWNLOADED = "room_downloaded", "Room item downloaded"
        ROOM_REVOKED = "room_revoked", "Room revoked"
        ROOM_CODE_VERIFIED = "room_access_code_verified", "Access code verified"
        ROOM_CODE_FAILED = "room_access_code_failed", "Access code failed"
        ROOM_LIMIT_REACHED = "room_limit_reached", "Room access limit reached"
        ROOM_BLOCKED_LIMIT_REACHED = (
            "room_blocked_limit_reached",
            "Room access blocked (limit reached)",
        )

    class ActorType(models.TextChoices):
        OWNER = "owner", "Owner"
        SHARED_VIEWER = "shared_viewer", "Shared viewer"
        SYSTEM = "system", "System"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="room_activities",
    )
    room = models.ForeignKey(
        ShareRoom,
        on_delete=models.CASCADE,
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
            models.Index(fields=["room", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action} on room {self.room_id}"
