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
    media/documents/user_<user_id>/inbox/<uuid><ext>
    """
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    folder = f"document_{instance.document_id}" if instance.document_id else "inbox"
    return f"documents/user_{instance.uploaded_by_id}/{folder}/{safe_name}"


class DocumentCategory(models.Model):
    """
    A grouping for documents (e.g. Passport, Visa, Insurance).

    Categories are either:
    * system categories (``owner`` is null) — a shared controlled vocabulary
      available to everyone, or
    * user categories (``owner`` set) — private to that user.

    A document's category is optional. Names are unique within a scope: globally
    among system categories, and per-owner among a user's own categories.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_categories",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    # Optional lucide icon name + hex/CSS colour token the UI can render.
    icon = models.CharField(max_length=60, blank=True)
    color = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "document categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
                condition=models.Q(owner__isnull=True),
                name="uniq_system_document_category_name",
            ),
            models.UniqueConstraint(
                fields=["owner", "name"],
                name="uniq_owner_document_category_name",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_system(self) -> bool:
        return self.owner_id is None

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
    # Owner can pin important documents to surface them first.
    is_pinned = models.BooleanField(default=False)

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

    # "I've seen this — stop nagging me until later." When set to a future
    # datetime, the document is hidden from the Life Radar / Attention surfaces
    # until then. It does NOT change the real expiry/renewal facts.
    attention_snoozed_until = models.DateTimeField(null=True, blank=True)

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
            # Hot path: the active vault list filters owner + is_trashed and
            # orders by -is_pinned, -created_at. This composite lets the DB
            # satisfy the filter + sort from one index (see DocumentViewSet.list).
            models.Index(
                fields=["owner", "is_trashed", "-is_pinned", "-created_at"],
                name="doc_owner_active_listing",
            ),
            # Supports the owner + status filter combined with the trash scope
            # used across list/attention queries.
            models.Index(
                fields=["owner", "is_trashed", "status"],
                name="doc_owner_trashed_status",
            ),
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
    A file uploaded by a user, optionally attached to a user-owned Document.

    Attached-file ownership is enforced through the parent document. Inbox-file
    ownership is enforced through ``uploaded_by``. The stored path is internal
    and is never exposed in API responses — clients use controlled endpoints.
    """

    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="files",
        null=True,
        blank=True,
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

    # ---- Application-level encryption at rest (see docs/ENCRYPTION.md) -----
    # Immutable identity used to bind ciphertext to this record via AES-GCM AAD.
    file_uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class EncryptionStatus(models.TextChoices):
        PLAINTEXT_LEGACY = "plaintext_legacy", "Plaintext legacy"
        ENCRYPTING = "encrypting", "Encrypting"
        ENCRYPTED = "encrypted", "Encrypted"
        ENCRYPTION_FAILED = "encryption_failed", "Encryption failed"

    encryption_status = models.CharField(
        max_length=32,
        choices=EncryptionStatus.choices,
        default=EncryptionStatus.PLAINTEXT_LEGACY,
        db_index=True,
    )
    encryption_algorithm = models.CharField(max_length=64, default="AES-256-GCM")
    encryption_version = models.PositiveSmallIntegerField(default=1)
    # Which KEK version wrapped this file's DEK (needed to unwrap/rotate).
    kek_version = models.CharField(max_length=32, blank=True, db_index=True)
    wrapped_dek = models.BinaryField(null=True, blank=True)
    nonce = models.BinaryField(null=True, blank=True)
    # GCM tag is appended to ciphertext by AESGCM; kept nullable for clarity and
    # potential future streaming formats. Not required for the current format.
    gcm_tag = models.BinaryField(null=True, blank=True)
    # SHA-256 of the ENCRYPTED bytes (storage integrity; not plaintext).
    ciphertext_sha256 = models.CharField(max_length=64, blank=True)
    plaintext_size_bytes = models.BigIntegerField(null=True, blank=True)
    ciphertext_size_bytes = models.BigIntegerField(null=True, blank=True)
    encrypted_at = models.DateTimeField(null=True, blank=True)
    encryption_error = models.CharField(max_length=255, blank=True)

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
            models.Index(fields=["uploaded_by", "is_trashed"]),
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
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
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
    # Optional: an extraction belongs to a FILE. A scanned File Inbox file has
    # no parent document yet, so `document` may be null (the per-document
    # extraction endpoints simply won't surface inbox extractions, which is
    # correct — they appear once the file is promoted to a document).
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="extractions",
        null=True,
        blank=True,
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

    class UnlockMode(models.TextChoices):
        # How a scanned/opened emergency link turns into document access.
        OWNER_APPROVAL = "owner_approval", "Owner approval only"
        DELAYED = "delayed", "Delayed unlock"
        INSTANT_CODE = "instant_code", "Instant with code"
        DISABLED_UNTIL_ACTIVATED = "disabled_until_activated", "Disabled until activated"

    class LocationPrecision(models.TextChoices):
        APPROXIMATE = "approximate", "Approximate"
        PRECISE = "precise", "Precise"

    # Safety check-in bounds (minutes): no shorter than 5 min, no longer than a
    # week. The pre-deadline nudge is sent this long before the deadline.
    CHECKIN_MIN_MINUTES = 5
    CHECKIN_MAX_MINUTES = 7 * 24 * 60
    CHECKIN_NUDGE_LEAD_MINUTES = 15

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
    # Unlock rule applied when a trusted person opens the public link. The model
    # default stays INSTANT_CODE so that links/packs created directly (and legacy
    # rows) keep their original "code unlocks immediately" behaviour; the API
    # surfaces DELAYED as the recommended default for new packs.
    unlock_mode = models.CharField(
        max_length=32,
        choices=UnlockMode.choices,
        default=UnlockMode.INSTANT_CODE,
    )
    unlock_delay_hours = models.PositiveIntegerField(default=24)
    expires_at = models.DateTimeField(null=True, blank=True)
    access_code_required = models.BooleanField(default=False)
    access_code_hash = models.CharField(max_length=255, blank=True)
    token = models.CharField(
        max_length=128, unique=True, null=True, blank=True, db_index=True
    )
    # Optional duration (minutes) that an approved/unlocked request stays open.
    # Null means it follows the pack expiry / stays open until revoked.
    access_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    allow_downloads = models.BooleanField(default=True)
    # --- Optional emergency location (off by default; revealed only after the
    # unlock rules allow access). This is NOT live tracking. ---
    location_enabled = models.BooleanField(default=False)
    location_precision = models.CharField(
        max_length=16,
        choices=LocationPrecision.choices,
        default=LocationPrecision.APPROXIMATE,
    )
    # Stored shape: {"label": str, "lat": float|None, "lng": float|None}.
    last_known_location = models.JSONField(null=True, blank=True)
    last_known_location_at = models.DateTimeField(null=True, blank=True)
    # --- Safety check-in ("dead man's switch"). Off unless the owner arms it.
    # When armed, the owner must check in by ``checkin_due_at``; if that passes,
    # the escalation fires server-side (so it works even with the phone off):
    # the pack's trusted contacts are emailed ``checkin_message`` and, when
    # ``checkin_reveal_location`` is on, the last-known location. Not tracking —
    # a one-shot escalation the owner can extend or cancel at any time. ---
    checkin_armed = models.BooleanField(default=False)
    checkin_interval_minutes = models.PositiveIntegerField(null=True, blank=True)
    checkin_due_at = models.DateTimeField(null=True, blank=True)
    # Whether the pre-deadline "almost due" nudge has been sent for this window.
    checkin_nudge_sent = models.BooleanField(default=False)
    checkin_message = models.TextField(blank=True)
    checkin_reveal_location = models.BooleanField(default=True)
    checkin_triggered_at = models.DateTimeField(null=True, blank=True)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
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
    def checkin_is_overdue(self) -> bool:
        """Armed and the deadline has passed — the escalation is due to fire."""
        return (
            self.checkin_armed
            and self.checkin_due_at is not None
            and timezone.now() >= self.checkin_due_at
        )

    @property
    def is_shareable_now(self) -> bool:
        """Whether a public token currently grants access."""
        return (
            self.access_mode == self.AccessMode.SHARE_LINK
            and self.status == self.Status.ACTIVE
            and bool(self.token)
            and not self.is_expired
        )

    @property
    def requires_unlock_request(self) -> bool:
        """
        Whether opening the link starts a request flow (owner approval or a
        delayed countdown) rather than unlocking documents immediately.
        """
        return self.unlock_mode in (
            self.UnlockMode.OWNER_APPROVAL,
            self.UnlockMode.DELAYED,
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


class EmergencyTrustedContact(models.Model):
    """
    A person the owner trusts to request (or be given) emergency access. Storing
    a contact does NOT grant access on its own — access is always governed by the
    pack's unlock rules. No credentials are ever generated automatically.
    """

    class Relationship(models.TextChoices):
        PARENT = "parent", "Parent"
        SIBLING = "sibling", "Sibling"
        SPOUSE = "spouse", "Spouse"
        FRIEND = "friend", "Friend"
        GUARDIAN = "guardian", "Guardian"
        ROOMMATE = "roommate", "Roommate"
        COLLEAGUE = "colleague", "Colleague"
        OTHER = "other", "Other"

    class AccessLevel(models.TextChoices):
        CAN_REQUEST = "can_request", "Can request access"
        INSTANT_WITH_CODE = "instant_with_code", "Can access instantly with QR + code"
        NOTIFY_ONLY = "notify_only", "Can only be notified"

    class VerificationStatus(models.TextChoices):
        UNVERIFIED = "unverified", "Unverified"
        NOTIFIED = "notified", "Setup notice sent"
        VERIFIED = "verified", "Verified"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_trusted_contacts",
    )
    pack = models.ForeignKey(
        EmergencyAccessPack,
        on_delete=models.CASCADE,
        related_name="trusted_contacts",
    )
    name = models.CharField(max_length=120)
    relationship = models.CharField(
        max_length=20, choices=Relationship.choices, default=Relationship.OTHER
    )
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=255, blank=True)
    is_primary = models.BooleanField(default=False)
    is_backup = models.BooleanField(default=False)
    access_level = models.CharField(
        max_length=24,
        choices=AccessLevel.choices,
        default=AccessLevel.CAN_REQUEST,
    )
    verification_status = models.CharField(
        max_length=16,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNVERIFIED,
    )
    last_notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_primary", "name"]
        indexes = [
            models.Index(fields=["pack", "is_primary"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_relationship_display()})"


class EmergencyUnlockRequest(models.Model):
    """
    A request, started from the public emergency link, to open a pack's selected
    documents. The flow depends on the pack's unlock_mode:

    * owner_approval -> PENDING until the owner approves or denies.
    * delayed        -> COUNTDOWN until ``unlock_at``; auto-unlocks unless denied.
    * instant_code   -> handled inline by the viewer (no request row needed).

    The request is identified publicly by an opaque ``request_token`` so the
    requester can poll status without authenticating. No sensitive secrets are
    stored on this row.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending owner approval"
        COUNTDOWN = "countdown", "Delayed unlock counting down"
        UNLOCKED = "unlocked", "Unlocked"
        DENIED = "denied", "Denied"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    pack = models.ForeignKey(
        EmergencyAccessPack,
        on_delete=models.CASCADE,
        related_name="unlock_requests",
    )
    request_token = models.CharField(max_length=128, unique=True, db_index=True)
    requester_name = models.CharField(max_length=120)
    relationship = models.CharField(max_length=60, blank=True)
    reason = models.CharField(max_length=500, blank=True)
    contact_info = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    unlock_at = models.DateTimeField(null=True, blank=True)
    access_expires_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pack", "status"]),
        ]

    def __str__(self):
        return f"Unlock request for pack {self.pack_id} ({self.status})"

    def settle_due_countdown(self):
        """
        Promote a COUNTDOWN request to UNLOCKED once its delay has elapsed.
        Returns True if the status changed (caller persists). Pure time check;
        never silently unlocks a denied/revoked request.
        """
        if (
            self.status == self.Status.COUNTDOWN
            and self.unlock_at is not None
            and timezone.now() >= self.unlock_at
        ):
            self.status = self.Status.UNLOCKED
            return True
        return False

    @property
    def is_open(self) -> bool:
        """Whether this request currently grants access to pack items."""
        if self.status != self.Status.UNLOCKED:
            return False
        if self.access_expires_at is not None and timezone.now() >= self.access_expires_at:
            return False
        return True


class EmergencyActivityEvent(models.Model):
    """
    Append-only audit trail for a pack: setup changes, scans, requests,
    approvals, views, downloads, location reveals, revocations, etc. Never stores
    secrets (codes, tokens) — only human-readable, non-sensitive context.
    """

    class EventType(models.TextChoices):
        SETUP_CREATED = "setup_created", "Setup created"
        DOCUMENTS_CHANGED = "documents_changed", "Emergency documents changed"
        CONTACT_ADDED = "contact_added", "Trusted contact added"
        CONTACT_REMOVED = "contact_removed", "Trusted contact removed"
        CONTACT_NOTIFIED = "contact_notified", "Trusted contact notified"
        QR_GENERATED = "qr_generated", "QR generated"
        QR_REGENERATED = "qr_regenerated", "QR regenerated"
        QR_SCANNED = "qr_scanned", "QR scanned / link opened"
        REQUEST_SUBMITTED = "request_submitted", "Request submitted"
        WRONG_CODE = "wrong_code", "Wrong code attempt"
        COUNTDOWN_STARTED = "countdown_started", "Delayed countdown started"
        ACCESS_APPROVED = "access_approved", "Access approved"
        ACCESS_DENIED = "access_denied", "Access denied"
        ACCESS_UNLOCKED = "access_unlocked", "Access unlocked"
        DOCUMENT_VIEWED = "document_viewed", "Document viewed"
        DOCUMENT_DOWNLOADED = "document_downloaded", "Document downloaded"
        LOCATION_REQUESTED = "location_requested", "Location requested"
        LOCATION_REVEALED = "location_revealed", "Location revealed"
        LOCATION_UPDATED = "location_updated", "Location updated"
        LOCATION_TOGGLED = "location_toggled", "Location sharing toggled"
        ACCESS_REVOKED = "access_revoked", "Access revoked"
        UNLOCK_MODE_CHANGED = "unlock_mode_changed", "Unlock mode changed"
        SETUP_DISABLED = "setup_disabled", "Setup disabled"
        SETUP_ENABLED = "setup_enabled", "Setup enabled"
        CHECKIN_ARMED = "checkin_armed", "Safety check-in armed"
        CHECKIN_EXTENDED = "checkin_extended", "Safety check-in extended"
        CHECKIN_CANCELED = "checkin_canceled", "Safety check-in canceled"
        CHECKIN_TRIGGERED = "checkin_triggered", "Safety check-in escalation fired"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_activity_events",
    )
    pack = models.ForeignKey(
        EmergencyAccessPack,
        on_delete=models.CASCADE,
        related_name="activity_events",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    actor_label = models.CharField(max_length=120, blank=True)
    description = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pack", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} on pack {self.pack_id}"


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
    # Legacy plaintext notes — migrated into notes_ciphertext and then blanked.
    # New writes go to notes_ciphertext (AES-256-GCM, AAD-bound to this record).
    notes = models.TextField(blank=True)
    notes_ciphertext = models.BinaryField(null=True, blank=True)
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

    def decrypt_notes(self) -> str:
        """Decrypted notes (AAD-bound to this record), falling back to any
        legacy plaintext not yet migrated. Never raises."""
        from apps.core.security.encryption import (
            DecryptionError,
            decrypt_field_value,
        )

        if self.notes_ciphertext:
            try:
                return decrypt_field_value(
                    bytes(self.notes_ciphertext),
                    model="proofrecord",
                    field="notes",
                    record_id=self.pk,
                )
            except DecryptionError:
                return ""
        return self.notes or ""


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
        REMINDER_ADDED = "reminder_added", "Reminder added"
        ADDED_TO_BUNDLE = "added_to_bundle", "Added to a bundle"
        SHARED_VIA_SAFESEND = "shared_via_safesend", "Shared via SafeSend"
        BUNDLE_CREATED = "bundle_created", "Pack created"
        BUNDLE_TEMPLATE_APPLIED = "bundle_template_applied", "Template applied"
        BUNDLE_REQUIREMENT_ADDED = "bundle_requirement_added", "Checklist item added"
        BUNDLE_REQUIREMENT_REMOVED = "bundle_requirement_removed", "Checklist item removed"
        BUNDLE_REQUIREMENT_STATUS_CHANGED = (
            "bundle_requirement_status_changed",
            "Checklist item updated",
        )
        BUNDLE_STATUS_CHANGED = "bundle_status_changed", "Pack status changed"
        BUNDLE_EXPORTED = "bundle_exported", "Pack exported"

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


class DocumentEmbedding(models.Model):
    """A stored semantic embedding for one document (content-level RAG).

    Built from the document's searchable text and refreshed when ``text_hash``
    changes. Stored as a JSON float list so it works on SQLite and Postgres with
    no vector extension — cosine similarity is computed in Python at query time
    (fine for per-owner vault sizes). Owner-scoped via the document; only
    populated when an embeddings key is configured.
    """

    document = models.OneToOneField(
        Document, on_delete=models.CASCADE, related_name="embedding"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_embeddings",
    )
    vector = models.JSONField(default=list)
    text_hash = models.CharField(max_length=64, blank=True)
    model = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["owner"])]

    def __str__(self):
        return f"Embedding(doc={self.document_id})"


class DocumentChunk(models.Model):
    """A chunk of a document's extracted/OCR **body text** for chunk-level RAG.

    Where ``DocumentEmbedding`` is one vector over a document's *metadata snippet*,
    a ``DocumentChunk`` is a slice of the document's actual extracted content
    (from ``DocumentExtraction.raw_text``) so the AI can answer about what a
    document *says*, not just its key fields.

    Stored owner-scoped. ``embedding_vector`` is an optional JSON float list
    (same SQLite/Postgres-friendly strategy as ``DocumentEmbedding`` — cosine in
    Python; no pgvector). When no embeddings key is configured the chunk is still
    stored and retrievable by lexical scoring. This table holds **extracted text
    only** — never AI responses, file URLs, or secrets.
    """

    class Status(models.TextChoices):
        READY = "ready", "Ready"
        EMBEDDING_FAILED = "embedding_failed", "Embedding failed"
        SKIPPED = "skipped", "Skipped"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_chunks",
    )
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="ai_chunks"
    )
    chunk_index = models.PositiveIntegerField()
    text = models.TextField()
    text_hash = models.CharField(max_length=64, blank=True)
    source_title = models.CharField(max_length=255, blank=True)
    page_number = models.PositiveIntegerField(null=True, blank=True)
    section_label = models.CharField(max_length=120, blank=True)
    # Character count of the chunk — a cheap, deterministic size estimate.
    token_estimate = models.PositiveIntegerField(default=0)
    embedding_vector = models.JSONField(null=True, blank=True)
    embedding_model = models.CharField(max_length=64, blank=True)
    embedding_created_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.READY
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["document_id", "chunk_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "chunk_index"], name="uniq_document_chunk_index"
            )
        ]
        indexes = [
            models.Index(fields=["owner", "document"]),
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["document", "chunk_index"]),
            models.Index(fields=["text_hash"]),
        ]

    def __str__(self):
        return f"Chunk(doc={self.document_id}, #{self.chunk_index})"


class PreparedDocument(models.Model):
    """
    A prepared (filled / signed) copy of a document file.

    The original ``DocumentFile`` is always preserved; the prepared copy is a new
    encrypted ``DocumentFile``. This is a *prepared copy*, not a legally binding
    e-signature — see ``DocumentSignatureRecord`` for the audit trail.
    """

    class PreparationType(models.TextChoices):
        FILL_SIGN = "fill_sign", "Fill & Sign"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="prepared_documents",
    )
    # The source document (nullable: a File Inbox file may not be a Document yet).
    document = models.ForeignKey(
        "Document",
        on_delete=models.CASCADE,
        related_name="prepared_documents",
        null=True,
        blank=True,
    )
    original_file = models.ForeignKey(
        "DocumentFile",
        on_delete=models.CASCADE,
        related_name="prepared_as_original",
    )
    prepared_file = models.ForeignKey(
        "DocumentFile",
        on_delete=models.CASCADE,
        related_name="prepared_as_copy",
    )
    preparation_type = models.CharField(
        max_length=32,
        choices=PreparationType.choices,
        default=PreparationType.FILL_SIGN,
    )
    # The overlay spec the prepared copy was built from (list of annotations).
    annotations = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "-created_at"]),
            models.Index(fields=["document"]),
        ]

    def __str__(self):
        return f"PreparedDocument(owner={self.owner_id}, file={self.prepared_file_id})"


class DocumentSignatureRecord(models.Model):
    """
    Audit record for a prepared signed copy: who prepared it, how, when, and the
    SHA-256 hashes of the original and prepared files.

    This is **not** a legal certification of signature validity. It is a
    tamper-evidence/audit trail for a prepared copy.
    """

    class SignatureMethod(models.TextChoices):
        DRAWN = "drawn", "Drawn"
        TYPED = "typed", "Typed"
        UPLOADED = "uploaded", "Uploaded"
        NONE = "none", "Fill only (no signature)"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="signature_records",
    )
    prepared = models.ForeignKey(
        PreparedDocument,
        on_delete=models.CASCADE,
        related_name="signature_records",
    )
    signer_name = models.CharField(max_length=200, blank=True)
    signer_email = models.EmailField(blank=True)
    signature_method = models.CharField(
        max_length=16,
        choices=SignatureMethod.choices,
        default=SignatureMethod.NONE,
    )
    signed_at = models.DateTimeField(default=timezone.now)
    original_file_hash = models.CharField(max_length=64, blank=True)
    prepared_file_hash = models.CharField(max_length=64, blank=True)
    audit_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "-created_at"])]

    def __str__(self):
        return f"SignatureRecord(prepared={self.prepared_id}, method={self.signature_method})"


class GeneratedDocument(models.Model):
    """
    A persisted AI-drafted document (CV, cover/motivation letter, request email,
    etc.). Generation itself stays ephemeral and review-first in ``ai_draft``;
    this model lets the user **save** a reviewed draft into a drafts library,
    edit it, and attach it to an Application Pack.

    The draft is a starting point the user reviews — not an authoritative document
    and not a guarantee of any application outcome.
    """

    class DocumentType(models.TextChoices):
        CV = "cv", "CV / résumé"
        COVER_LETTER = "cover_letter", "Cover letter"
        MOTIVATION_LETTER = "motivation_letter", "Motivation letter"
        STATEMENT_OF_PURPOSE = "statement_of_purpose", "Statement of purpose"
        RECOMMENDATION_EMAIL = "recommendation_email", "Recommendation request email"
        FORMAL_LETTER = "formal_letter", "Formal request letter"
        APPLICATION_EMAIL = "application_email", "Application email"
        REQUEST_MESSAGE = "request_message", "Document request message"
        PACK_COVER_SHEET = "pack_cover_sheet", "Pack cover sheet"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SAVED = "saved", "Saved"
        DISCARDED = "discarded", "Discarded"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generated_documents",
    )
    title = models.CharField(max_length=255)
    document_type = models.CharField(
        max_length=32, choices=DocumentType.choices, default=DocumentType.OTHER
    )
    # The inputs the draft was generated from (instructions, tone, doc ids, etc.).
    input_payload = models.JSONField(default=dict, blank=True)
    output_text = models.TextField(blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    related_pack = models.ForeignKey(
        "DocumentBundle",
        on_delete=models.SET_NULL,
        related_name="generated_documents",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, blank=True)
    model = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "-updated_at"]),
            models.Index(fields=["related_pack"]),
        ]

    def __str__(self):
        return f"GeneratedDocument(owner={self.owner_id}, type={self.document_type})"


class RequirementExtractionDraft(models.Model):
    """
    A reviewable draft from Requirement Link import (Extract → Review → Apply).

    Stores the AI-extracted, structured payload (required/optional documents,
    deadlines, eligibility, instructions, warnings) plus the source URL/title —
    NEVER raw page HTML. Owner- and bundle-scoped. The user reviews the draft and
    explicitly applies a selection; nothing touches the pack until then.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        EXTRACTED = "extracted", "Extracted"
        APPLIED = "applied", "Applied"
        FAILED = "failed", "Failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requirement_extraction_drafts",
    )
    bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.CASCADE,
        related_name="requirement_extraction_drafts",
    )
    source_url = models.URLField(max_length=2048)
    page_title = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    # Structured extraction only (documents/deadlines/notes/snippets) — no HTML.
    extracted_payload = models.JSONField(default=dict, blank=True)
    created_requirements = models.PositiveIntegerField(default=0)
    created_reminders = models.PositiveIntegerField(default=0)
    error_message = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "bundle"]),
            models.Index(fields=["bundle", "status"]),
        ]

    def __str__(self):
        return f"RequirementExtractionDraft(bundle={self.bundle_id}, status={self.status})"


class TrackedApplication(models.Model):
    """
    A tracked document-based workflow (scholarship, visa, job, grant, renewal…).

    Connects the user's intent (deadline, status, notes, source link) to an
    optional application pack (``DocumentBundle``), so CertaNest can say not just
    "your pack is 72% ready" but "your visa renewal is documents-missing" or
    "your scholarship is ready to submit". Owner-scoped; deterministic (no AI);
    stores no file URLs.
    """

    class Type(models.TextChoices):
        SCHOLARSHIP = "scholarship", "Scholarship"
        UNIVERSITY = "university", "University"
        VISA = "visa", "Visa"
        JOB = "job", "Job"
        INTERNSHIP = "internship", "Internship"
        GRANT = "grant", "Grant"
        PERMIT = "permit", "Permit"
        RENEWAL = "renewal", "Renewal"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PLANNING = "planning", "Planning"
        CHECKLIST_CREATED = "checklist_created", "Checklist created"
        DOCUMENTS_MISSING = "documents_missing", "Documents missing"
        READY_TO_SUBMIT = "ready_to_submit", "Ready to submit"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under review"
        INTERVIEW = "interview", "Interview"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"
        RENEWAL_NEEDED = "renewal_needed", "Renewal needed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tracked_applications",
    )
    title = models.CharField(max_length=255)
    application_type = models.CharField(
        max_length=20, choices=Type.choices, default=Type.OTHER
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PLANNING
    )
    # Optional link to an application pack; SET_NULL so deleting a pack never
    # destroys the application record.
    linked_bundle = models.ForeignKey(
        DocumentBundle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tracked_applications",
    )
    source_url = models.URLField(max_length=2048, blank=True)
    organization_name = models.CharField(max_length=255, blank=True)
    deadline_date = models.DateField(null=True, blank=True)
    submitted_at = models.DateField(null=True, blank=True)
    decision_date = models.DateField(null=True, blank=True)
    target_start_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    priority = models.CharField(
        max_length=8, choices=Priority.choices, default=Priority.MEDIUM
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "is_archived", "-updated_at"]),
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "deadline_date"]),
        ]

    def __str__(self):
        return f"TrackedApplication(owner={self.owner_id}, title={self.title!r})"
