import os

from rest_framework import serializers
from rest_framework.reverse import reverse

from .constants import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE
from .models import Document, DocumentCategory, DocumentFile


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
            "created_at",
            "updated_at",
        ]
        # Everything is server-derived; nothing here is client-writable.
        read_only_fields = fields

    def get_download_url(self, obj):
        request = self.context.get("request")
        url = reverse(
            "document-file-download",
            kwargs={"document_id": obj.document_id, "pk": obj.pk},
            request=request,
        )
        return url


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
