import os
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


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
