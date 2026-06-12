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
