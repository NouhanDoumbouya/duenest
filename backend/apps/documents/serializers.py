import os

from django.utils import timezone
from rest_framework import serializers
from rest_framework.reverse import reverse

from .constants import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE
from .models import (
    Document,
    DocumentCategory,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
)


class DocumentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentCategory
        fields = ["id", "name", "slug", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


class DocumentSerializer(serializers.ModelSerializer):
    # Owner is derived from the authenticated request, never from the client.
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    # Convenience read-only label so clients don't need a second request.
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=None
    )

    class Meta:
        model = Document
        fields = [
            "id",
            "owner",
            "category",
            "category_name",
            "title",
            "document_type",
            "issuer",
            "country",
            "reference_number",
            "issue_date",
            "expiry_date",
            "renewal_date",
            "notes",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def validate(self, attrs):
        """
        Enforce date ordering. On PATCH we merge incoming values with the
        existing instance so partial updates are validated against full state.
        """
        issue_date = attrs.get("issue_date", getattr(self.instance, "issue_date", None))
        expiry_date = attrs.get(
            "expiry_date", getattr(self.instance, "expiry_date", None)
        )
        renewal_date = attrs.get(
            "renewal_date", getattr(self.instance, "renewal_date", None)
        )

        if issue_date and expiry_date and expiry_date < issue_date:
            raise serializers.ValidationError(
                {"expiry_date": "Expiry date cannot be earlier than the issue date."}
            )
        if renewal_date and expiry_date and renewal_date > expiry_date:
            raise serializers.ValidationError(
                {"renewal_date": "Renewal date cannot be later than the expiry date."}
            )
        return attrs


class DocumentFileSerializer(serializers.ModelSerializer):
    """Read representation of an attached file. Exposes no internal path."""

    uploaded_by = serializers.PrimaryKeyRelatedField(read_only=True)
    download_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    is_previewable = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentFile
        fields = [
            "id",
            "document",
            "uploaded_by",
            "original_filename",
            "content_type",
            "file_size",
            "checksum",
            "download_url",
            "preview_url",
            "is_previewable",
            "created_at",
            "updated_at",
        ]
        # Everything is server-derived; nothing here is client-writable.
        read_only_fields = fields

    def get_download_url(self, obj):
        return reverse(
            "document-file-download",
            kwargs={"document_id": obj.document_id, "pk": obj.pk},
            request=self.context.get("request"),
        )

    def get_preview_url(self, obj):
        if not obj.is_previewable:
            return None
        return reverse(
            "document-file-preview",
            kwargs={"document_id": obj.document_id, "pk": obj.pk},
            request=self.context.get("request"),
        )


class ShareLinkCreateSerializer(serializers.Serializer):
    """Validates owner input when creating a share link."""

    permission = serializers.ChoiceField(
        choices=DocumentFileShareLink.Permission.choices,
        default=DocumentFileShareLink.Permission.VIEW_ONLY,
    )
    expires_at = serializers.DateTimeField()
    access_code_required = serializers.BooleanField(default=False)
    # Optional owner-supplied code; if omitted while required, one is generated.
    access_code = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=64
    )
    label = serializers.CharField(required=False, allow_blank=True, max_length=120)
    recipient_email = serializers.EmailField(required=False, allow_blank=True)
    purpose = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_expires_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Expiry must be in the future.")
        return value


class DocumentFileShareLinkSerializer(serializers.ModelSerializer):
    """Owner-facing representation of a share link (includes the token)."""

    status = serializers.SerializerMethodField()
    download_allowed = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentFileShareLink
        fields = [
            "id",
            "token",
            "permission",
            "download_allowed",
            "status",
            "expires_at",
            "revoked_at",
            "access_code_required",
            "label",
            "recipient_email",
            "purpose",
            "created_at",
            "last_accessed_at",
        ]
        read_only_fields = fields

    def get_status(self, obj):
        if obj.is_revoked:
            return "revoked"
        if obj.is_expired:
            return "expired"
        return "active"


class PublicSharedFileSerializer(serializers.Serializer):
    """
    SAFE public metadata for a shared file. Deliberately omits owner identity,
    internal paths, the parent document, and owner-only notes (label, recipient,
    purpose).
    """

    file_name = serializers.CharField(source="file.original_filename")
    content_type = serializers.CharField(source="file.content_type")
    file_size = serializers.IntegerField(source="file.file_size")
    permission = serializers.CharField()
    expires_at = serializers.DateTimeField()
    is_previewable = serializers.BooleanField(source="file.is_previewable")
    download_allowed = serializers.BooleanField()
    access_code_required = serializers.BooleanField()


class DocumentFileActivitySerializer(serializers.ModelSerializer):
    """Owner-only activity entry."""

    class Meta:
        model = DocumentFileActivity
        fields = [
            "id",
            "action",
            "actor_type",
            "share_link",
            "ip_address",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class DocumentFileUploadSerializer(serializers.Serializer):
    """Validates an uploaded file (type + size) before it is stored."""

    file = serializers.FileField(write_only=True)

    def validate_file(self, uploaded):
        if uploaded.size > MAX_FILE_SIZE:
            max_mb = MAX_FILE_SIZE // (1024 * 1024)
            raise serializers.ValidationError(
                f"File is too large. Maximum size is {max_mb} MB."
            )

        ext = os.path.splitext(uploaded.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                "Unsupported file extension. Allowed: "
                + ", ".join(sorted(ALLOWED_EXTENSIONS))
                + "."
            )

        # content_type is client-reported (spoofable) — checked alongside the
        # extension as a first line of defence. See constants.py TODO.
        if uploaded.content_type not in ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Unsupported file type. Allowed types: PDF, JPEG, PNG, DOC, DOCX."
            )

        return uploaded
