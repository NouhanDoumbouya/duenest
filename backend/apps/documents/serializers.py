import os
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.reverse import reverse

from apps.core.security.encryption import encrypt_field_value
from apps.core.security import public_access
from .constants import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE


def _validate_owner_access_code(value):
    """Reject weak owner-supplied access codes at creation (SEC-001).

    Empty is allowed (a strong code is generated server-side). Legacy stored
    codes are never re-validated, so existing shares keep working.
    """
    code = (value or "").strip()
    if not code:
        return value
    ok, message = public_access.validate_access_code_strength(code)
    if not ok:
        raise serializers.ValidationError(message)
    return value
from .models import (
    DocumentSignatureRecord,
    GeneratedDocument,
    PreparedDocument,
    Document,
    DocumentActivity,
    DocumentAppointment,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentCategory,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentChecklistItemTemplate,
    DocumentChecklistTemplate,
    DocumentExportRequest,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentPayment,
    DocumentReminderRule,
    DocumentRenewalEvent,
    DocumentTag,
    DocumentVersion,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
    EmergencyActivityEvent,
    EmergencyTrustedContact,
    EmergencyUnlockRequest,
    ProofRecord,
    RoomActivity,
    ShareRoom,
    ShareRoomItem,
    TrackedApplication,
)
from .services import (
    APPLICABLE_EXTRACTION_FIELDS,
    bundle_readiness,
    collect_room_files,
    checklist_progress,
    compute_confidence,
    compute_last_safe_action,
    get_document_health,
    reminder_date_for_rule,
)


def _document_file_owner_id(file):
    if file is None:
        return None
    if file.document_id:
        return file.document.owner_id
    return file.uploaded_by_id


def _document_file_is_unavailable(file) -> bool:
    if file is None:
        return False
    return bool(
        file.is_trashed
        or (file.document_id and file.document.is_trashed)
    )


def days_until_trash_purge(trashed_at):
    """Days until a trashed item is permanently purged, or None when not trashed
    / auto-purge is disabled."""
    if not trashed_at:
        return None
    retention = getattr(settings, "TRASH_RETENTION_DAYS", 30)
    if retention <= 0:
        return None
    purge_on = (trashed_at + timedelta(days=retention)).date()
    return max(0, (purge_on - timezone.now().date()).days)


class DocumentTagSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = DocumentTag
        fields = [
            "id",
            "owner",
            "name",
            "slug",
            "color",
            "document_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "slug", "document_count", "created_at", "updated_at"]

    def get_document_count(self, obj):
        count = getattr(obj, "document_count", None)
        if count is not None:
            return count
        return obj.documents.filter(is_trashed=False).count()


class DocumentCategorySerializer(serializers.ModelSerializer):
    is_system = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentCategory
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "icon",
            "color",
            "is_system",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "is_system", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Enter a category name.")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        # Reject a name that already exists as a system category or among the
        # user's own categories (case-insensitive), with a friendly message.
        clash = DocumentCategory.objects.filter(name__iexact=name).filter(
            Q(owner__isnull=True) | Q(owner=user)
        )
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                "A category with this name already exists."
            )
        return name


class DocumentSerializer(serializers.ModelSerializer):
    # Owner is derived from the authenticated request, never from the client.
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    # Convenience read-only label so clients don't need a second request.
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=None
    )
    computed_status = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    status_reason = serializers.SerializerMethodField()
    urgency_level = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    days_until_renewal = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    is_expiring_soon = serializers.SerializerMethodField()
    is_renewal_due = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    missing_expiry_date = serializers.SerializerMethodField()
    missing_file = serializers.SerializerMethodField()
    needs_attention = serializers.SerializerMethodField()

    # Confidence / readiness.
    confidence_score = serializers.SerializerMethodField()
    confidence_label = serializers.SerializerMethodField()
    confidence_reasons = serializers.SerializerMethodField()

    # Last safe action — effective date is computed; the override is writable.
    last_safe_action_date = serializers.SerializerMethodField()
    days_until_last_safe_action = serializers.SerializerMethodField()
    last_safe_action_status = serializers.SerializerMethodField()
    last_safe_action_is_manual = serializers.SerializerMethodField()
    last_safe_action_override = serializers.DateField(
        source="last_safe_action_date", required=False, allow_null=True
    )

    is_shared_externally = serializers.SerializerMethodField()
    in_bundle = serializers.SerializerMethodField()
    in_emergency = serializers.SerializerMethodField()
    days_until_permanent_deletion = serializers.SerializerMethodField()

    # Tags: nested for reads, id list for writes (scoped to the owner).
    tags = DocumentTagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        source="tags",
        queryset=DocumentTag.objects.all(),
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
            "lifecycle_status",
            "is_pinned",
            "custom_fields",
            "physical_location_label",
            "physical_location_details",
            "original_available",
            "certified_copy_available",
            "translation_available",
            "notes_about_original",
            "tags",
            "tag_ids",
            "is_trashed",
            "trashed_at",
            "attention_snoozed_until",
            "computed_status",
            "status_label",
            "status_reason",
            "urgency_level",
            "days_until_expiry",
            "days_until_renewal",
            "is_expired",
            "is_expiring_soon",
            "is_renewal_due",
            "has_file",
            "missing_expiry_date",
            "missing_file",
            "needs_attention",
            "confidence_score",
            "confidence_label",
            "confidence_reasons",
            "last_safe_action_date",
            "last_safe_action_override",
            "days_until_last_safe_action",
            "last_safe_action_status",
            "last_safe_action_is_manual",
            "is_shared_externally",
            "in_bundle",
            "in_emergency",
            "days_until_permanent_deletion",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "is_trashed",
            "trashed_at",
            "attention_snoozed_until",
            "computed_status",
            "status_label",
            "status_reason",
            "urgency_level",
            "days_until_expiry",
            "days_until_renewal",
            "is_expired",
            "is_expiring_soon",
            "is_renewal_due",
            "has_file",
            "missing_expiry_date",
            "missing_file",
            "needs_attention",
            "confidence_score",
            "confidence_label",
            "confidence_reasons",
            "last_safe_action_date",
            "days_until_last_safe_action",
            "last_safe_action_status",
            "last_safe_action_is_manual",
            "is_shared_externally",
            "in_bundle",
            "in_emergency",
            "days_until_permanent_deletion",
            "created_at",
            "updated_at",
        ]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        # Only the owner's tags can be assigned.
        if request is not None and "tag_ids" in fields:
            fields["tag_ids"].child_relation.queryset = DocumentTag.objects.filter(
                owner=request.user
            )
        return fields

    def _health(self, obj):
        if not hasattr(obj, "_document_health_cache"):
            obj._document_health_cache = get_document_health(obj)
        return obj._document_health_cache

    def _confidence(self, obj):
        if not hasattr(obj, "_document_confidence_cache"):
            obj._document_confidence_cache = compute_confidence(
                obj, health=self._health(obj)
            )
        return obj._document_confidence_cache

    def _last_safe_action(self, obj):
        if not hasattr(obj, "_document_lsa_cache"):
            obj._document_lsa_cache = compute_last_safe_action(obj)
        return obj._document_lsa_cache

    def get_computed_status(self, obj):
        return self._health(obj).computed_status

    def get_status_label(self, obj):
        return self._health(obj).status_label

    def get_status_reason(self, obj):
        return self._health(obj).status_reason

    def get_urgency_level(self, obj):
        return self._health(obj).urgency_level

    def get_days_until_expiry(self, obj):
        return self._health(obj).days_until_expiry

    def get_days_until_renewal(self, obj):
        return self._health(obj).days_until_renewal

    def get_is_expired(self, obj):
        return self._health(obj).is_expired

    def get_is_expiring_soon(self, obj):
        return self._health(obj).is_expiring_soon

    def get_is_renewal_due(self, obj):
        return self._health(obj).is_renewal_due

    def get_has_file(self, obj):
        return self._health(obj).has_file

    def get_missing_expiry_date(self, obj):
        return self._health(obj).missing_expiry_date

    def get_missing_file(self, obj):
        return self._health(obj).missing_file

    def get_needs_attention(self, obj):
        return self._health(obj).needs_attention

    def get_confidence_score(self, obj):
        return self._confidence(obj).score

    def get_confidence_label(self, obj):
        return self._confidence(obj).label

    def get_confidence_reasons(self, obj):
        return self._confidence(obj).reasons

    def get_last_safe_action_date(self, obj):
        value = self._last_safe_action(obj).date
        return value.isoformat() if value else None

    def get_days_until_last_safe_action(self, obj):
        return self._last_safe_action(obj).days_until

    def get_last_safe_action_status(self, obj):
        return self._last_safe_action(obj).status

    def get_last_safe_action_is_manual(self, obj):
        return self._last_safe_action(obj).is_manual

    def get_is_shared_externally(self, obj):
        annotated = getattr(obj, "is_shared_ext", None)
        if annotated is not None:
            return bool(annotated)
        return obj.file_share_links.filter(
            revoked_at__isnull=True, expires_at__gt=timezone.now()
        ).exists()

    def get_in_bundle(self, obj):
        annotated = getattr(obj, "in_bundle_anno", None)
        if annotated is not None:
            return bool(annotated)
        return obj.bundle_requirements.exists()

    def get_in_emergency(self, obj):
        annotated = getattr(obj, "in_emergency_anno", None)
        if annotated is not None:
            return bool(annotated)
        return obj.emergency_pack_items.exists()

    def get_days_until_permanent_deletion(self, obj):
        return days_until_trash_purge(obj.trashed_at)

    def validate_custom_fields(self, value):
        """Custom fields are a flat object of string keys to scalar values."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Custom fields must be an object.")
        if len(value) > 30:
            raise serializers.ValidationError("Too many custom fields (max 30).")
        cleaned = {}
        for key, raw in value.items():
            key = str(key)[:60]
            if raw is None:
                cleaned[key] = ""
            elif isinstance(raw, (str, int, float, bool)):
                cleaned[key] = str(raw)[:500]
            else:
                raise serializers.ValidationError(
                    f"Custom field “{key}” must be a simple value."
                )
        return cleaned

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
    document_title = serializers.SerializerMethodField()
    assignment_status = serializers.SerializerMethodField()
    days_until_permanent_deletion = serializers.SerializerMethodField()

    class Meta:
        model = DocumentFile
        fields = [
            "id",
            "document",
            "document_title",
            "assignment_status",
            "uploaded_by",
            "original_filename",
            "content_type",
            "file_size",
            "checksum",
            "download_url",
            "preview_url",
            "is_previewable",
            "is_trashed",
            "trashed_at",
            "days_until_permanent_deletion",
            "created_at",
            "updated_at",
        ]
        # Everything is server-derived; nothing here is client-writable.
        read_only_fields = fields

    def get_days_until_permanent_deletion(self, obj):
        return days_until_trash_purge(obj.trashed_at)

    def get_download_url(self, obj):
        if obj.document_id is None:
            return reverse(
                "file-inbox-download",
                kwargs={"pk": obj.pk},
                request=self.context.get("request"),
            )
        return reverse(
            "document-file-download",
            kwargs={"document_id": obj.document_id, "pk": obj.pk},
            request=self.context.get("request"),
        )

    def get_preview_url(self, obj):
        if not obj.is_previewable:
            return None
        if obj.document_id is None:
            return reverse(
                "file-inbox-preview",
                kwargs={"pk": obj.pk},
                request=self.context.get("request"),
            )
        return reverse(
            "document-file-preview",
            kwargs={"document_id": obj.document_id, "pk": obj.pk},
            request=self.context.get("request"),
        )

    def get_document_title(self, obj):
        return obj.document.title if obj.document_id else ""

    def get_assignment_status(self, obj):
        return "attached" if obj.document_id else "inbox"


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

    # Access limits.
    access_limit_type = serializers.ChoiceField(
        choices=DocumentFileShareLink.AccessLimitType.choices,
        default=DocumentFileShareLink.AccessLimitType.UNLIMITED,
    )
    max_views = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    max_downloads = serializers.IntegerField(
        required=False, min_value=1, allow_null=True
    )
    watermark_enabled = serializers.BooleanField(default=False)
    privacy_screen_enabled = serializers.BooleanField(default=False)

    def validate_expires_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Expiry must be in the future.")
        return value

    def validate_access_code(self, value):
        return _validate_owner_access_code(value)

    def validate(self, attrs):
        limit_type = attrs.get("access_limit_type")
        if (
            limit_type == DocumentFileShareLink.AccessLimitType.LIMITED_COUNT
            and not attrs.get("max_views")
        ):
            raise serializers.ValidationError(
                {"max_views": "Set how many views this link allows."}
            )
        # Downloads can only be capped when downloading is permitted.
        if attrs.get("max_downloads") and (
            attrs.get("permission") != DocumentFileShareLink.Permission.DOWNLOAD_ALLOWED
        ):
            raise serializers.ValidationError(
                {"max_downloads": "Enable downloads to set a download limit."}
            )
        return attrs


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
            "access_limit_type",
            "max_views",
            "view_count",
            "max_downloads",
            "download_count",
            "limit_reached_at",
            "watermark_enabled",
            "privacy_screen_enabled",
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
        if obj.is_limit_reached:
            return "limit_reached"
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
    watermark_enabled = serializers.BooleanField()
    privacy_screen_enabled = serializers.BooleanField()
    watermark_text = serializers.SerializerMethodField()
    short_id = serializers.CharField()

    def get_watermark_text(self, obj):
        # Only surface the recipient marker when watermarking is on.
        return obj.watermark_text if obj.watermark_enabled else ""


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


class DocumentReminderRuleSerializer(serializers.ModelSerializer):
    """Owner-facing reminder rule with calculated next reminder date."""

    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )
    upcoming_reminder_date = serializers.SerializerMethodField()
    date_source = serializers.SerializerMethodField()

    class Meta:
        model = DocumentReminderRule
        fields = [
            "id",
            "owner",
            "document",
            "document_title",
            "trigger_type",
            "days_before",
            "is_enabled",
            "upcoming_reminder_date",
            "date_source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "document",
            "document_title",
            "upcoming_reminder_date",
            "date_source",
            "created_at",
            "updated_at",
        ]

    def get_upcoming_reminder_date(self, obj):
        reminder_date = reminder_date_for_rule(obj)
        return reminder_date.isoformat() if reminder_date else None

    def get_date_source(self, obj):
        if obj.trigger_type == DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE:
            return "renewal_date"
        return "expiry_date"

    def validate(self, attrs):
        document = self.context.get("document") or getattr(
            self.instance, "document", None
        )
        trigger_type = attrs.get(
            "trigger_type",
            getattr(self.instance, "trigger_type", DocumentReminderRule.TriggerType.BEFORE_EXPIRY),
        )
        days_before = attrs.get(
            "days_before", getattr(self.instance, "days_before", 30)
        )

        if trigger_type == DocumentReminderRule.TriggerType.ON_EXPIRY:
            attrs["days_before"] = 0
            days_before = 0

        if days_before < 0:
            raise serializers.ValidationError(
                {"days_before": "Days before cannot be negative."}
            )

        if document is not None:
            if (
                trigger_type
                == DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE
                and document.renewal_date is None
            ):
                raise serializers.ValidationError(
                    {
                        "trigger_type": (
                            "Add a renewal date before creating renewal "
                            "reminders."
                        )
                    }
                )
            if (
                trigger_type
                in {
                    DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
                    DocumentReminderRule.TriggerType.ON_EXPIRY,
                }
                and document.expiry_date is None
            ):
                raise serializers.ValidationError(
                    {
                        "trigger_type": (
                            "Add an expiry date before creating expiry "
                            "reminders."
                        )
                    }
                )
        return attrs


# ---- Checklist templates ---------------------------------------------------


class DocumentChecklistItemTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentChecklistItemTemplate
        fields = [
            "id",
            "title",
            "description",
            "is_required",
            "sort_order",
            "suggested_due_offset_days",
            "metadata",
        ]
        read_only_fields = fields


class DocumentChecklistTemplateSerializer(serializers.ModelSerializer):
    item_templates = DocumentChecklistItemTemplateSerializer(
        many=True, read_only=True
    )
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = DocumentChecklistTemplate
        fields = [
            "id",
            "title",
            "description",
            "document_type",
            "use_case",
            "checklist_type",
            "country",
            "is_system_template",
            "is_active",
            "sort_order",
            "slug",
            "item_count",
            "item_templates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_item_count(self, obj):
        # item_templates is prefetched and fully serialized; len() reuses the
        # prefetch cache instead of issuing a separate COUNT per row.
        return len(obj.item_templates.all())


# ---- User checklists -------------------------------------------------------


class _OwnerScopedRelatedMixin:
    """
    Shared ownership validation for linked Document / DocumentFile fields.

    A user must never be able to link another user's document or file, so we
    re-check ownership against the request user in ``validate`` even though the
    ids are accepted as plain primary keys.
    """

    def _request_user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def _validate_owned(self, attrs):
        user = self._request_user()
        linked_document = attrs.get("linked_document")
        if linked_document is not None and linked_document.owner_id != getattr(
            user, "id", None
        ):
            raise serializers.ValidationError(
                {"linked_document": "You can only link your own documents."}
            )
        if linked_document is not None and linked_document.is_trashed:
            raise serializers.ValidationError(
                {"linked_document": "You cannot link a trashed document."}
            )
        linked_file = attrs.get("linked_file")
        if linked_file is not None and _document_file_owner_id(linked_file) != getattr(
            user, "id", None
        ):
            raise serializers.ValidationError(
                {"linked_file": "You can only link your own files."}
            )
        if _document_file_is_unavailable(linked_file):
            raise serializers.ValidationError(
                {"linked_file": "You cannot link a trashed file."}
            )
        return attrs


class DocumentChecklistItemSerializer(
    _OwnerScopedRelatedMixin, serializers.ModelSerializer
):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    checklist = serializers.PrimaryKeyRelatedField(read_only=True)
    linked_document = serializers.PrimaryKeyRelatedField(
        queryset=Document.objects.all(),
        required=False,
        allow_null=True,
    )
    linked_file = serializers.PrimaryKeyRelatedField(
        queryset=DocumentFile.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = DocumentChecklistItem
        fields = [
            "id",
            "owner",
            "checklist",
            "title",
            "description",
            "is_required",
            "status",
            "due_date",
            "linked_document",
            "linked_file",
            "completed_at",
            "sort_order",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "checklist",
            "completed_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        return self._validate_owned(attrs)


class DocumentChecklistSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document = serializers.PrimaryKeyRelatedField(read_only=True)
    template = serializers.PrimaryKeyRelatedField(read_only=True)
    items = DocumentChecklistItemSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    bundle = serializers.PrimaryKeyRelatedField(
        queryset=DocumentBundle.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = DocumentChecklist
        fields = [
            "id",
            "owner",
            "document",
            "bundle",
            "template",
            "title",
            "description",
            "checklist_type",
            "status",
            "progress_percent",
            "due_date",
            "progress",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "document",
            "template",
            "status",
            "progress_percent",
            "progress",
            "items",
            "created_at",
            "updated_at",
        ]

    def get_progress(self, obj):
        progress = checklist_progress(obj)
        return {
            "percent": progress.percent,
            "status": progress.status,
            "total_items": progress.total_items,
            "completed_items": progress.completed_items,
            "skipped_items": progress.skipped_items,
            "required_items": progress.required_items,
            "required_completed": progress.required_completed,
            "required_incomplete": progress.required_incomplete,
        }

    def validate_bundle(self, value):
        user = getattr(self.context.get("request"), "user", None)
        if value is not None and value.owner_id != getattr(user, "id", None):
            raise serializers.ValidationError("You can only link your own bundles.")
        return value


class ChecklistFromTemplateSerializer(serializers.Serializer):
    """Input for creating a checklist from a template."""

    template = serializers.PrimaryKeyRelatedField(
        queryset=DocumentChecklistTemplate.objects.filter(is_active=True)
    )
    title = serializers.CharField(required=False, allow_blank=True, max_length=255)
    due_date = serializers.DateField(required=False, allow_null=True)
    bundle = serializers.PrimaryKeyRelatedField(
        queryset=DocumentBundle.objects.all(),
        required=False,
        allow_null=True,
    )

    def validate_bundle(self, value):
        user = getattr(self.context.get("request"), "user", None)
        if value is not None and value.owner_id != getattr(user, "id", None):
            raise serializers.ValidationError("You can only link your own bundles.")
        return value


# ---- Bundles ---------------------------------------------------------------


class DocumentBundleRequirementSerializer(
    _OwnerScopedRelatedMixin, serializers.ModelSerializer
):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    bundle = serializers.PrimaryKeyRelatedField(read_only=True)
    linked_document = serializers.PrimaryKeyRelatedField(
        queryset=Document.objects.all(),
        required=False,
        allow_null=True,
    )
    linked_file = serializers.PrimaryKeyRelatedField(
        queryset=DocumentFile.objects.all(),
        required=False,
        allow_null=True,
    )
    is_satisfied = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentBundleRequirement
        fields = [
            "id",
            "owner",
            "bundle",
            "title",
            "description",
            "is_required",
            "requirement_type",
            "expected_document_type",
            "linked_document",
            "linked_file",
            "status",
            "is_satisfied",
            "due_date",
            "sort_order",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "bundle",
            "is_satisfied",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        return self._validate_owned(attrs)


class DocumentBundleSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    requirements = DocumentBundleRequirementSerializer(many=True, read_only=True)
    readiness = serializers.SerializerMethodField()
    requirement_count = serializers.SerializerMethodField()
    missing_required_count = serializers.SerializerMethodField()

    class Meta:
        model = DocumentBundle
        fields = [
            "id",
            "owner",
            "title",
            "description",
            "bundle_type",
            "target_date",
            "status",
            "country",
            "authority_or_provider",
            "notes",
            "readiness_score",
            "readiness",
            "requirement_count",
            "missing_required_count",
            "requirements",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "readiness_score",
            "readiness",
            "requirement_count",
            "missing_required_count",
            "requirements",
            "created_at",
            "updated_at",
        ]

    def _readiness(self, obj):
        if not hasattr(obj, "_readiness_cache"):
            obj._readiness_cache = bundle_readiness(obj)
        return obj._readiness_cache

    def get_readiness(self, obj):
        readiness = self._readiness(obj)
        return {
            "score": readiness.score,
            "is_ready": readiness.is_ready,
            "total_requirements": readiness.total_requirements,
            "required_total": readiness.required_total,
            "required_satisfied": readiness.required_satisfied,
            "required_missing": readiness.required_missing,
            "optional_total": readiness.optional_total,
            "optional_satisfied": readiness.optional_satisfied,
            "missing_required_titles": readiness.missing_required_titles,
        }

    def get_requirement_count(self, obj):
        return self._readiness(obj).total_requirements

    def get_missing_required_count(self, obj):
        return self._readiness(obj).required_missing


class BundleReadinessSerializer(serializers.Serializer):
    """Output-only readiness summary for the dedicated readiness endpoint."""

    score = serializers.IntegerField()
    is_ready = serializers.BooleanField()
    total_requirements = serializers.IntegerField()
    required_total = serializers.IntegerField()
    required_satisfied = serializers.IntegerField()
    required_missing = serializers.IntegerField()
    optional_total = serializers.IntegerField()
    optional_satisfied = serializers.IntegerField()
    missing_required_titles = serializers.ListField(
        child=serializers.CharField()
    )


# ---- Timeline --------------------------------------------------------------


class TimelineEventSerializer(serializers.Serializer):
    id = serializers.CharField()
    event_type = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    date = serializers.DateField()
    urgency_level = serializers.CharField()
    related_document = serializers.IntegerField(allow_null=True)
    related_bundle = serializers.IntegerField(allow_null=True)
    related_checklist = serializers.IntegerField(allow_null=True)
    related_subscription = serializers.IntegerField(allow_null=True)
    metadata = serializers.DictField()


class CalendarEventSerializer(serializers.Serializer):
    id = serializers.CharField()
    source_type = serializers.CharField()
    source_id = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField()
    event_type = serializers.CharField()
    date = serializers.DateField()
    end_date = serializers.DateField(allow_null=True)
    status = serializers.CharField()
    urgency = serializers.CharField()
    category = serializers.CharField()
    linked_resource_type = serializers.CharField()
    linked_resource_id = serializers.IntegerField(allow_null=True)
    linked_resource_url = serializers.CharField()
    metadata = serializers.DictField()


# ---- Extraction ------------------------------------------------------------


class DocumentExtractionSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document = serializers.PrimaryKeyRelatedField(read_only=True)
    file = serializers.PrimaryKeyRelatedField(read_only=True)
    has_raw_text = serializers.SerializerMethodField()

    class Meta:
        model = DocumentExtraction
        fields = [
            "id",
            "owner",
            "document",
            "file",
            "extraction_status",
            "extracted_fields",
            "confidence_score",
            "provider",
            "error_message",
            "has_raw_text",
            "reviewed_at",
            "applied_at",
            "created_at",
            "updated_at",
        ]
        # raw_text is intentionally NOT exposed; only a boolean presence flag is.
        read_only_fields = [
            "id",
            "owner",
            "document",
            "file",
            "extraction_status",
            "confidence_score",
            "provider",
            "error_message",
            "has_raw_text",
            "reviewed_at",
            "applied_at",
            "created_at",
            "updated_at",
        ]

    def get_has_raw_text(self, obj):
        return bool(obj.raw_text)

    def validate_extracted_fields(self, value):
        """Only allow the known, applicable document fields to be staged."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object of fields.")
        unknown = set(value) - set(APPLICABLE_EXTRACTION_FIELDS)
        if unknown:
            raise serializers.ValidationError(
                f"Unsupported fields: {', '.join(sorted(unknown))}."
            )
        return value


class ExtractionApplySerializer(serializers.Serializer):
    """
    Owner confirmation of which reviewed fields to apply to the document.

    Only fields listed in ``fields`` are written, and only from the extraction's
    reviewed ``extracted_fields`` — the client never sends raw values here, so a
    review step is always required before a document is changed.
    """

    fields = serializers.ListField(
        child=serializers.ChoiceField(choices=APPLICABLE_EXTRACTION_FIELDS),
        allow_empty=False,
    )


class DocumentFileUploadSerializer(serializers.Serializer):
    """Validates an uploaded file before it is stored.

    Server-side content sniffing + structural validation via the shared
    secure-upload service (SEC-005) — the client-reported content type is no
    longer trusted on its own. Malware scanning runs at the view layer (see
    ``_create_document_file``) so a scanner outage can return a proper 503.
    """

    file = serializers.FileField(write_only=True)

    def validate_file(self, uploaded):
        from apps.core.security import file_validation

        try:
            file_validation.validate_secure_upload(
                uploaded,
                allowed_content_types=ALLOWED_CONTENT_TYPES,
                allowed_extensions=ALLOWED_EXTENSIONS,
                max_bytes=MAX_FILE_SIZE,
                scan=False,
            )
        except file_validation.SecureUploadError as exc:
            raise serializers.ValidationError(exc.message)
        return uploaded


# ===========================================================================
# Document Vault Maturity serializers
# ===========================================================================


class DocumentVersionSerializer(serializers.ModelSerializer):
    """Owner-facing version snapshot. Never exposes internal file paths."""

    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )

    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "document",
            "file",
            "version_number",
            "version_type",
            "title_snapshot",
            "document_type_snapshot",
            "issuer_snapshot",
            "country_snapshot",
            "reference_number_snapshot",
            "issue_date_snapshot",
            "expiry_date_snapshot",
            "renewal_date_snapshot",
            "notes_snapshot",
            "file_name_snapshot",
            "file_size_snapshot",
            "file_content_type_snapshot",
            "change_summary",
            "created_by_username",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class DocumentExportRequestSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentExportRequest
        fields = [
            "id",
            "export_type",
            "status",
            "download_url",
            "is_expired",
            "requested_at",
            "completed_at",
            "expires_at",
            "error_message",
            "metadata",
        ]
        read_only_fields = [
            "id",
            "status",
            "download_url",
            "is_expired",
            "requested_at",
            "completed_at",
            "expires_at",
            "error_message",
            "metadata",
        ]

    def get_download_url(self, obj):
        # Only completed, unexpired exports expose a download URL — and never
        # the raw storage path.
        if obj.status != DocumentExportRequest.Status.COMPLETED or obj.is_expired:
            return None
        return reverse(
            "document-export-download",
            kwargs={"export_id": obj.pk},
            request=self.context.get("request"),
        )

    def validate_export_type(self, value):
        if value == DocumentExportRequest.ExportType.FUTURE_FULL_ARCHIVE:
            raise serializers.ValidationError(
                "Full file archive export is not available yet."
            )
        if value in {
            DocumentExportRequest.ExportType.BUNDLE_METADATA_JSON,
            DocumentExportRequest.ExportType.BUNDLE_REQUIREMENTS_CSV,
        }:
            raise serializers.ValidationError(
                "Bundle exports must be requested from a bundle endpoint."
            )
        return value


class BundleExportRequestSerializer(DocumentExportRequestSerializer):
    """Bundle-scoped export serializer with bundle-specific download URLs."""

    def get_download_url(self, obj):
        if obj.status != DocumentExportRequest.Status.COMPLETED or obj.is_expired:
            return None
        bundle_id = obj.metadata.get("bundle_id") or self.context.get("bundle_id")
        if not bundle_id:
            return None
        return reverse(
            "document-bundle-export-download",
            kwargs={"bundle_id": bundle_id, "export_id": obj.pk},
            request=self.context.get("request"),
        )

    def validate_export_type(self, value):
        if value not in {
            DocumentExportRequest.ExportType.BUNDLE_METADATA_JSON,
            DocumentExportRequest.ExportType.BUNDLE_REQUIREMENTS_CSV,
        }:
            raise serializers.ValidationError(
                "Choose bundle_metadata_json or bundle_requirements_csv."
            )
        return value


class EmergencyAccessPackItemSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    pack = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )
    file_name = serializers.CharField(
        source="file.original_filename", read_only=True, default=None
    )
    linked_document = serializers.PrimaryKeyRelatedField(
        source="document",
        queryset=Document.objects.all(),
    )
    linked_file = serializers.PrimaryKeyRelatedField(
        source="file",
        queryset=DocumentFile.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = EmergencyAccessPackItem
        fields = [
            "id",
            "owner",
            "pack",
            "linked_document",
            "linked_file",
            "document_title",
            "file_name",
            "notes",
            "sort_order",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "pack",
            "document_title",
            "file_name",
            "created_at",
        ]

    def validate(self, attrs):
        user = getattr(self.context.get("request"), "user", None)
        document = attrs.get("document")
        if document is not None and document.owner_id != getattr(user, "id", None):
            raise serializers.ValidationError(
                {"linked_document": "You can only add your own documents."}
            )
        if document is not None and document.is_trashed:
            raise serializers.ValidationError(
                {"linked_document": "You cannot add a trashed document."}
            )
        file = attrs.get("file")
        if file is not None and _document_file_owner_id(file) != getattr(user, "id", None):
            raise serializers.ValidationError(
                {"linked_file": "You can only add your own files."}
            )
        if _document_file_is_unavailable(file):
            raise serializers.ValidationError(
                {"linked_file": "You cannot add a trashed file."}
            )
        if (
            file is not None
            and document is not None
            and file.document_id is not None
            and file.document_id != document.id
        ):
            raise serializers.ValidationError(
                {"linked_file": "The file must belong to the selected document."}
            )
        return attrs


class EmergencyAccessPackSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    items = EmergencyAccessPackItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    share_url_path = serializers.SerializerMethodField()
    public_url_path = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    access_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=64,
    )

    class Meta:
        model = EmergencyAccessPack
        fields = [
            "id",
            "owner",
            "title",
            "description",
            "status",
            "access_mode",
            "unlock_mode",
            "unlock_delay_hours",
            "expires_at",
            "access_code_required",
            "access_code",
            "access_duration_minutes",
            "allow_downloads",
            "location_enabled",
            "location_precision",
            "last_known_location",
            "last_known_location_at",
            "checkin_armed",
            "checkin_interval_minutes",
            "checkin_due_at",
            "checkin_message",
            "checkin_reveal_location",
            "checkin_triggered_at",
            "last_reviewed_at",
            "share_url_path",
            "public_url_path",
            "last_accessed_at",
            "disabled_at",
            "is_expired",
            "item_count",
            "items",
            "metadata",
            "created_at",
            "updated_at",
        ]
        # token + access_code_hash are never serialized. status/token are managed
        # through dedicated enable/disable/regenerate actions. Location is updated
        # through the dedicated location action so reveals can be audited.
        read_only_fields = [
            "id",
            "owner",
            "status",
            "last_known_location",
            "last_known_location_at",
            "checkin_armed",
            "checkin_interval_minutes",
            "checkin_due_at",
            "checkin_message",
            "checkin_reveal_location",
            "checkin_triggered_at",
            "last_reviewed_at",
            "share_url_path",
            "public_url_path",
            "last_accessed_at",
            "disabled_at",
            "is_expired",
            "item_count",
            "items",
            "created_at",
            "updated_at",
        ]

    def validate_unlock_delay_hours(self, value):
        if value < 1 or value > 168:
            raise serializers.ValidationError(
                "Choose a delay between 1 and 168 hours."
            )
        return value

    def get_item_count(self, obj):
        # items is prefetched and fully serialized; len() reuses the prefetch
        # cache instead of issuing a separate COUNT per row.
        return len(obj.items.all())

    def get_share_url_path(self, obj):
        # Relative public API path; only present while the pack is shareable now.
        if not obj.is_shareable_now:
            return None
        return f"/api/v1/share/emergency-packs/{obj.token}/"

    def get_public_url_path(self, obj):
        # Relative frontend viewer path the owner shares with trusted people.
        # The token is already exposed to the (authenticated) owner via
        # share_url_path, so this adds no new disclosure.
        if not obj.is_shareable_now:
            return None
        return f"/emergency/{obj.token}/"

    def validate_access_code(self, value):
        return _validate_owner_access_code(value)

    def validate(self, attrs):
        access_required = attrs.get(
            "access_code_required",
            getattr(self.instance, "access_code_required", False),
        )
        access_code = (attrs.get("access_code") or "").strip()
        has_existing_hash = bool(getattr(self.instance, "access_code_hash", ""))
        if access_required and not access_code and not has_existing_hash:
            raise serializers.ValidationError(
                {
                    "access_code": (
                        "Provide an access code when access_code_required is true."
                    )
                }
            )
        return attrs


class PublicEmergencyPackSerializer(serializers.Serializer):
    """
    SAFE public view of a shared pack. No owner identity, no internal ids, no
    tokens. The document items are only included when ``include_items`` is set in
    the serializer context (i.e. the unlock rules currently allow access). The
    emergency location is only included when the pack has it enabled AND access
    is unlocked, never before.
    """

    title = serializers.CharField()
    description = serializers.CharField()
    access_code_required = serializers.BooleanField()
    expires_at = serializers.DateTimeField()
    unlock_mode = serializers.CharField()
    requires_unlock_request = serializers.BooleanField()
    allow_downloads = serializers.BooleanField()
    access_state = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()

    def get_access_state(self, obj):
        # "open" when items are visible now, otherwise the gate the viewer shows.
        if self.context.get("include_items"):
            return "open"
        if obj.requires_unlock_request:
            return "request_required"
        return "open"

    def get_items(self, obj):
        if not self.context.get("include_items"):
            return []
        rows = []
        for item in obj.items.select_related("document", "file"):
            document = item.document
            file = item.file
            # Skip trashed documents/files entirely.
            if document.is_trashed or (file and file.is_trashed):
                continue
            rows.append(
                {
                    "id": item.id,
                    "title": document.title,
                    "document_type": document.document_type,
                    "file_name": file.original_filename if file else None,
                    "is_previewable": file.is_previewable if file else False,
                    "has_file": file is not None,
                    "notes": item.notes,
                }
            )
        return rows

    def get_location(self, obj):
        # Location is revealed only after unlock AND only when enabled by the
        # owner. Precise coordinates are withheld unless the owner chose precise.
        if not (self.context.get("include_items") and obj.location_enabled):
            return None
        loc = obj.last_known_location or {}
        precise = obj.location_precision == EmergencyAccessPack.LocationPrecision.PRECISE
        return {
            "label": loc.get("label", ""),
            "precision": obj.location_precision,
            "lat": loc.get("lat") if precise else None,
            "lng": loc.get("lng") if precise else None,
            "updated_at": (
                obj.last_known_location_at.isoformat()
                if obj.last_known_location_at
                else None
            ),
        }


class EmergencyTrustedContactSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    pack = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = EmergencyTrustedContact
        fields = [
            "id",
            "owner",
            "pack",
            "name",
            "relationship",
            "email",
            "phone",
            "note",
            "is_primary",
            "is_backup",
            "access_level",
            "verification_status",
            "last_notified_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "pack",
            "verification_status",
            "last_notified_at",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Give the contact a name.")
        return value.strip()


class EmergencyActivityEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyActivityEvent
        fields = [
            "id",
            "event_type",
            "actor_label",
            "description",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class EmergencyUnlockRequestSerializer(serializers.ModelSerializer):
    """Owner-facing view of an unlock request."""

    class Meta:
        model = EmergencyUnlockRequest
        fields = [
            "id",
            "requester_name",
            "relationship",
            "reason",
            "contact_info",
            "status",
            "unlock_at",
            "access_expires_at",
            "decided_at",
            "created_at",
        ]
        read_only_fields = fields


class PublicUnlockRequestCreateSerializer(serializers.Serializer):
    """Validates the public emergency-access request form. No code is stored."""

    requester_name = serializers.CharField(max_length=120)
    relationship = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )
    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )
    contact_info = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )

    def validate_requester_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Enter your name.")
        return value.strip()


class ProofRecordSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )
    # notes is stored encrypted at rest (notes_ciphertext); handled explicitly
    # in create/update/to_representation rather than mapped to a column.
    notes = serializers.CharField(
        required=False, allow_blank=True, default="", trim_whitespace=False
    )

    class Meta:
        model = ProofRecord
        fields = [
            "id",
            "owner",
            "title",
            "proof_type",
            "document",
            "document_title",
            "bundle",
            "checklist",
            "linked_file",
            "reference_number",
            "submitted_to",
            "submitted_at",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "document_title",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Every linked object must belong to the requesting owner."""
        user = getattr(self.context.get("request"), "user", None)
        uid = getattr(user, "id", None)

        def owned(obj, owner_id, label):
            if obj is not None and owner_id != uid:
                raise serializers.ValidationError(
                    {label: "You can only link your own records."}
                )

        document = attrs.get("document", getattr(self.instance, "document", None))
        bundle = attrs.get("bundle", getattr(self.instance, "bundle", None))
        checklist = attrs.get("checklist", getattr(self.instance, "checklist", None))
        linked_file = attrs.get(
            "linked_file", getattr(self.instance, "linked_file", None)
        )
        if document is not None:
            owned(document, document.owner_id, "document")
            if document.is_trashed:
                raise serializers.ValidationError(
                    {"document": "You cannot link a trashed document."}
                )
        if bundle is not None:
            owned(bundle, bundle.owner_id, "bundle")
        if checklist is not None:
            owned(checklist, checklist.owner_id, "checklist")
        if linked_file is not None:
            owned(linked_file, _document_file_owner_id(linked_file), "linked_file")
            if _document_file_is_unavailable(linked_file):
                raise serializers.ValidationError(
                    {"linked_file": "You cannot link a trashed file."}
                )
        return attrs

    # ---- Encrypted notes (AES-256-GCM, AAD-bound to this record) -----------

    _NOTES_UNSET = object()

    def create(self, validated_data):
        notes = validated_data.pop("notes", "")
        instance = super().create(validated_data)
        self._store_notes(instance, notes)
        return instance

    def update(self, instance, validated_data):
        notes = validated_data.pop("notes", self._NOTES_UNSET)
        instance = super().update(instance, validated_data)
        if notes is not self._NOTES_UNSET:
            self._store_notes(instance, notes)
        return instance

    def _store_notes(self, instance, notes):
        if notes:
            instance.notes_ciphertext = encrypt_field_value(
                notes, model="proofrecord", field="notes", record_id=instance.pk
            )
        else:
            instance.notes_ciphertext = None
        instance.notes = ""  # never persist plaintext
        instance.save(update_fields=["notes_ciphertext", "notes"])

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["notes"] = instance.decrypt_notes()
        return data


class DocumentActivityEventSerializer(serializers.Serializer):
    """
    Unified, user-facing activity event (merges document-level + file-level
    activity). Deliberately omits raw IP addresses and internal paths.
    """

    id = serializers.CharField()
    action = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    actor_type = serializers.CharField()
    timestamp = serializers.DateTimeField()
    related_file = serializers.IntegerField(allow_null=True)
    related_share = serializers.IntegerField(allow_null=True)
    related_checklist = serializers.IntegerField(allow_null=True)
    related_bundle = serializers.IntegerField(allow_null=True)
    related_proof = serializers.IntegerField(allow_null=True)
    metadata = serializers.DictField()


class _OwnerLinkedSerializer(serializers.ModelSerializer):
    """Shared ownership validation for serializers that link to a user's own
    document/bundle/proof records."""

    def _request_user_id(self):
        request = self.context.get("request")
        return getattr(getattr(request, "user", None), "id", None)

    def _assert_owned(self, obj, owner_id, field):
        if obj is not None and owner_id != self._request_user_id():
            raise serializers.ValidationError(
                {field: "You can only link your own records."}
            )


class DocumentRenewalEventSerializer(_OwnerLinkedSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )

    class Meta:
        model = DocumentRenewalEvent
        fields = [
            "id",
            "owner",
            "document",
            "document_title",
            "renewal_date",
            "previous_expiry_date",
            "new_expiry_date",
            "cost",
            "currency",
            "notes",
            "proof",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "document", "document_title", "created_at", "updated_at"]

    def validate(self, attrs):
        proof = attrs.get("proof", getattr(self.instance, "proof", None))
        if proof is not None:
            self._assert_owned(proof, proof.owner_id, "proof")
        return attrs


class DocumentAppointmentSerializer(_OwnerLinkedSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )
    bundle_title = serializers.CharField(
        source="bundle.title", read_only=True, default=None
    )

    class Meta:
        model = DocumentAppointment
        fields = [
            "id",
            "owner",
            "document",
            "document_title",
            "bundle",
            "bundle_title",
            "title",
            "appointment_at",
            "location",
            "reference_number",
            "notes",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "document_title", "bundle_title", "created_at", "updated_at"]

    def validate(self, attrs):
        document = attrs.get("document", getattr(self.instance, "document", None))
        bundle = attrs.get("bundle", getattr(self.instance, "bundle", None))
        if document is None and bundle is None:
            raise serializers.ValidationError(
                "Link the appointment to a document or a bundle."
            )
        if document is not None:
            self._assert_owned(document, document.owner_id, "document")
        if bundle is not None:
            self._assert_owned(bundle, bundle.owner_id, "bundle")
        return attrs


class DocumentPaymentSerializer(_OwnerLinkedSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
    )
    bundle_title = serializers.CharField(
        source="bundle.title", read_only=True, default=None
    )

    class Meta:
        model = DocumentPayment
        fields = [
            "id",
            "owner",
            "document",
            "document_title",
            "bundle",
            "bundle_title",
            "label",
            "expected_cost",
            "actual_cost",
            "currency",
            "payment_status",
            "payment_date",
            "proof",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "document_title", "bundle_title", "created_at", "updated_at"]

    def validate(self, attrs):
        document = attrs.get("document", getattr(self.instance, "document", None))
        bundle = attrs.get("bundle", getattr(self.instance, "bundle", None))
        proof = attrs.get("proof", getattr(self.instance, "proof", None))
        if document is None and bundle is None:
            raise serializers.ValidationError(
                "Link the payment to a document or a bundle."
            )
        if document is not None:
            self._assert_owned(document, document.owner_id, "document")
        if bundle is not None:
            self._assert_owned(bundle, bundle.owner_id, "bundle")
        if proof is not None:
            self._assert_owned(proof, proof.owner_id, "proof")
        return attrs


class MissingScanGroupSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    hint = serializers.CharField()
    fix_target = serializers.CharField()
    items = serializers.ListField(child=serializers.DictField())


class HealthOverviewGroupSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    count = serializers.IntegerField()
    items = serializers.ListField(child=serializers.DictField())


# ---- Secure rooms ----------------------------------------------------------


class ShareRoomItemSerializer(serializers.ModelSerializer):
    """Owner-facing representation of a room item with safe linked info."""

    kind = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()

    class Meta:
        model = ShareRoomItem
        fields = [
            "id",
            "kind",
            "title",
            "document",
            "file",
            "proof",
            "sort_order",
            "created_at",
        ]
        read_only_fields = fields

    def get_kind(self, obj):
        if obj.file_id:
            return "file"
        if obj.document_id:
            return "document"
        if obj.proof_id:
            return "proof"
        return "unknown"

    def get_title(self, obj):
        if obj.file_id:
            return obj.file.original_filename
        if obj.document_id:
            return obj.document.title
        if obj.proof_id:
            return obj.proof.title
        return ""


class ShareRoomItemCreateSerializer(serializers.Serializer):
    """Validates adding one owner-owned item (document, file, or proof)."""

    document = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.IntegerField(required=False, allow_null=True)
    proof = serializers.IntegerField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False, default=0)

    def validate(self, attrs):
        provided = [k for k in ("document", "file", "proof") if attrs.get(k)]
        if len(provided) != 1:
            raise serializers.ValidationError(
                "Provide exactly one of document, file, or proof."
            )
        return attrs


class ShareRoomSerializer(serializers.ModelSerializer):
    """Owner-facing room representation (includes the token)."""

    status = serializers.SerializerMethodField()
    download_allowed = serializers.BooleanField(read_only=True)
    items = ShareRoomItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    file_count = serializers.SerializerMethodField()

    class Meta:
        model = ShareRoom
        fields = [
            "id",
            "title",
            "description",
            "token",
            "permission",
            "download_allowed",
            "status",
            "expires_at",
            "revoked_at",
            "access_code_required",
            "watermark_enabled",
            "privacy_screen_enabled",
            "access_limit_type",
            "max_views",
            "view_count",
            "max_downloads",
            "download_count",
            "limit_reached_at",
            "recipient_email",
            "label",
            "purpose",
            "items",
            "item_count",
            "file_count",
            "created_at",
            "updated_at",
            "last_accessed_at",
        ]
        read_only_fields = fields

    def get_status(self, obj):
        if obj.is_revoked:
            return "revoked"
        if obj.is_expired:
            return "expired"
        if obj.is_limit_reached:
            return "limit_reached"
        return "active"

    def get_item_count(self, obj):
        # items is prefetched and fully serialized; len() reuses the prefetch
        # cache instead of issuing a separate COUNT per row.
        return len(obj.items.all())

    def get_file_count(self, obj):
        return len(collect_room_files(obj).files)


class ShareRoomCreateUpdateSerializer(serializers.ModelSerializer):
    """Validates owner input when creating/updating a room."""

    access_code = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=64
    )

    class Meta:
        model = ShareRoom
        fields = [
            "title",
            "description",
            "permission",
            "expires_at",
            "access_code_required",
            "access_code",
            "watermark_enabled",
            "privacy_screen_enabled",
            "access_limit_type",
            "max_views",
            "max_downloads",
            "recipient_email",
            "label",
            "purpose",
        ]

    def validate_expires_at(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Expiry must be in the future.")
        return value

    def validate_access_code(self, value):
        return _validate_owner_access_code(value)

    def validate(self, attrs):
        limit_type = attrs.get("access_limit_type")
        if (
            limit_type == ShareRoom.AccessLimitType.LIMITED_COUNT
            and not attrs.get("max_views")
            and not getattr(self.instance, "max_views", None)
        ):
            raise serializers.ValidationError(
                {"max_views": "Set how many views this room allows."}
            )
        return attrs


class PublicShareRoomFileSerializer(serializers.Serializer):
    """Safe public representation of a single file inside a room."""

    file_id = serializers.IntegerField(source="file.id")
    name = serializers.CharField(source="file.original_filename")
    content_type = serializers.CharField(source="file.content_type")
    file_size = serializers.IntegerField(source="file.file_size")
    is_previewable = serializers.BooleanField(source="file.is_previewable")
    source = serializers.CharField(source="source_label")


class PublicShareRoomSerializer(serializers.Serializer):
    """
    SAFE public metadata for a room. Omits owner identity, tokens, access codes,
    internal paths, recipient email (except inside the watermark), and any vault
    data beyond the room's explicit items.
    """

    title = serializers.CharField()
    description = serializers.CharField()
    permission = serializers.CharField()
    download_allowed = serializers.BooleanField()
    access_code_required = serializers.BooleanField()
    watermark_enabled = serializers.BooleanField()
    privacy_screen_enabled = serializers.BooleanField()
    watermark_text = serializers.SerializerMethodField()
    short_id = serializers.CharField()
    expires_at = serializers.DateTimeField()
    files = serializers.SerializerMethodField()

    def get_watermark_text(self, obj):
        return obj.watermark_text if obj.watermark_enabled else ""

    def get_files(self, obj):
        entries = self.context.get("room_files")
        if entries is None:
            entries = collect_room_files(obj).files
        return PublicShareRoomFileSerializer(entries, many=True).data


class RoomActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomActivity
        fields = [
            "id",
            "action",
            "actor_type",
            "ip_address",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class DocumentSignatureRecordSerializer(serializers.ModelSerializer):
    """Read-only audit record for a prepared signed copy (not legal certification)."""

    class Meta:
        model = DocumentSignatureRecord
        fields = [
            "id",
            "signer_name",
            "signer_email",
            "signature_method",
            "signed_at",
            "original_file_hash",
            "prepared_file_hash",
            "audit_payload",
            "created_at",
        ]
        read_only_fields = fields


class PreparedDocumentSerializer(serializers.ModelSerializer):
    """A prepared (filled/signed) copy plus its audit record(s)."""

    prepared_file = DocumentFileSerializer(read_only=True)
    signature_records = DocumentSignatureRecordSerializer(many=True, read_only=True)

    class Meta:
        model = PreparedDocument
        fields = [
            "id",
            "document",
            "original_file",
            "prepared_file",
            "preparation_type",
            "annotations",
            "signature_records",
            "created_at",
        ]
        read_only_fields = fields


class FillSignRequestSerializer(serializers.Serializer):
    """Input for preparing a signed copy. `annotations` is the overlay spec."""

    annotations = serializers.ListField(
        child=serializers.DictField(), allow_empty=False
    )
    signer_name = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=200
    )
    signer_email = serializers.EmailField(
        required=False, allow_blank=True, default=""
    )
    signature_method = serializers.ChoiceField(
        choices=[m.value for m in DocumentSignatureRecord.SignatureMethod],
        required=False,
        default=DocumentSignatureRecord.SignatureMethod.NONE,
    )


class GeneratedDocumentSerializer(serializers.ModelSerializer):
    """A saved AI-drafted document (drafts library). Owner-scoped."""

    class Meta:
        model = GeneratedDocument
        fields = [
            "id",
            "title",
            "document_type",
            "input_payload",
            "output_text",
            "status",
            "related_pack",
            "provider",
            "model",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "provider", "model", "created_at", "updated_at"]

    def validate_related_pack(self, value):
        # A draft may only be attached to one of the requesting user's own packs.
        request = self.context.get("request")
        if value is not None and request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Pack not found.")
        return value


class TrackedApplicationSerializer(serializers.ModelSerializer):
    """Create/update validation for a tracked application (owner-scoped).

    Read/list/detail responses use the richer deterministic payload from
    ``apps.documents.application_tracker`` (status, deadline state, linked-pack
    readiness, next actions); this serializer governs writes + ownership.
    """

    owner = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = TrackedApplication
        fields = [
            "id",
            "owner",
            "title",
            "application_type",
            "status",
            "linked_bundle",
            "source_url",
            "organization_name",
            "deadline_date",
            "submitted_at",
            "decision_date",
            "target_start_date",
            "notes",
            "priority",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def validate_title(self, value):
        cleaned = " ".join((value or "").split())
        if not cleaned:
            raise serializers.ValidationError("A title is required.")
        return cleaned[:255]

    def validate_linked_bundle(self, value):
        # A pack may only be linked if it belongs to the requesting user.
        request = self.context.get("request")
        if value is not None and request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Pack not found.")
        return value


# ---- AI Application Document Generator V1 ----------------------------------

from .models import GeneratedApplicationDocument  # noqa: E402


class GeneratedApplicationDocumentSerializer(serializers.ModelSerializer):
    """Detail/review serializer. System/AI fields are read-only; the user may
    edit the reviewed content + presentation choices before export."""

    owner = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = GeneratedApplicationDocument
        fields = [
            "id", "owner", "application", "bundle", "document_type", "status",
            "title", "target_organization", "template_key", "content_style",
            "structured_content", "plain_text_preview", "ats_score",
            "quality_score", "warnings", "ai_model", "credits_charged",
            "exported_pdf_file", "exported_docx_file", "created_document",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "owner", "application", "bundle", "document_type",
            "target_organization", "ats_score", "quality_score", "warnings",
            "ai_model", "credits_charged", "exported_pdf_file",
            "exported_docx_file", "created_document", "created_at", "updated_at",
        ]
        # Editable on review: title, status, template_key, content_style,
        # structured_content, plain_text_preview.


from .models import MagicInboxItem  # noqa: E402


class MagicInboxItemSerializer(serializers.ModelSerializer):
    """
    Read serializer for a Magic Inbox item. Exposes linked-record ids and a
    minimal file descriptor — the file is only ever served via the existing
    PRIVATE download route (``/api/v1/files/{id}/download/``); raw storage URLs
    are never exposed. All write fields are handled by the service, so everything
    here is read-only.
    """

    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    file = serializers.SerializerMethodField()

    class Meta:
        model = MagicInboxItem
        fields = [
            "id", "owner", "item_type", "status", "title", "source_label",
            "source_url", "pasted_text", "linked_file", "linked_document",
            "linked_bundle", "linked_application", "extracted_payload",
            "suggestions", "warnings", "ai_model", "credits_charged",
            "file", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_file(self, obj):
        f = obj.linked_file
        if f is None:
            return None
        # Private, authenticated download route only — never a storage URL.
        return {
            "id": f.id,
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "download_url": f"/api/v1/files/{f.id}/download/",
        }


from .models import DocumentRequestLink  # noqa: E402


class DocumentRequestLinkSerializer(serializers.ModelSerializer):
    """
    Owner-facing serializer for a document request. Exposes the public token +
    upload URL (the owner needs it to share the link) and a minimal file descriptor
    for any uploaded file — served ONLY via the private owner download route, never
    a raw storage URL. All state transitions happen through the service, so the
    write surface is just the editable request metadata.
    """

    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    uploaded_file_info = serializers.SerializerMethodField()
    upload_url = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    can_upload = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentRequestLink
        fields = [
            "id", "owner", "status", "token", "upload_url",
            "requested_document_title", "requested_document_type", "instructions",
            "recipient_name", "recipient_email", "recipient_message",
            "due_date", "expires_at", "max_uploads", "upload_count",
            "linked_bundle", "linked_application", "linked_requirement",
            "uploaded_file", "uploaded_file_info", "created_document",
            "rejection_reason", "owner_note",
            "is_expired", "can_upload",
            "opened_at", "uploaded_at", "reviewed_at", "accepted_at", "rejected_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "owner", "status", "token", "upload_url", "upload_count",
            "uploaded_file", "uploaded_file_info", "created_document",
            "rejection_reason", "is_expired", "can_upload",
            "opened_at", "uploaded_at", "reviewed_at", "accepted_at", "rejected_at",
            "created_at", "updated_at",
        ]

    def get_uploaded_file_info(self, obj):
        f = obj.uploaded_file
        if f is None:
            return None
        # Owner-only private download route — never a storage URL, never given to
        # the recipient.
        return {
            "id": f.id,
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "download_url": f"/api/v1/files/{f.id}/download/",
        }

    def get_upload_url(self, obj):
        from django.conf import settings

        base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
        # Public recipient page route (distinct from the share_requests /request
        # route, which is a different feature).
        return f"{base}/document-request/{obj.token}"


from .models import (  # noqa: E402
    SharingRoom,
    SharingRoomItem,
    SharingRoomParticipant,
)


class SharingRoomItemSerializer(serializers.ModelSerializer):
    """Owner-facing room item. A file descriptor uses the PRIVATE owner download
    route only — never a storage URL. Request items surface the link status."""

    file_info = serializers.SerializerMethodField()
    request_info = serializers.SerializerMethodField()

    class Meta:
        model = SharingRoomItem
        fields = [
            "id", "item_type", "document", "file", "request_link",
            "title", "note", "sort_order", "file_info", "request_info", "created_at",
        ]
        read_only_fields = fields

    def get_file_info(self, obj):
        f = obj.file
        if f is None:
            return None
        return {
            "id": f.id,
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "download_url": f"/api/v1/files/{f.id}/download/",
        }

    def get_request_info(self, obj):
        link = obj.request_link
        if link is None:
            return None
        return {
            "id": link.id,
            "status": link.status,
            "requested_document_title": link.requested_document_title,
        }


class SharingRoomParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = SharingRoomParticipant
        fields = ["id", "name", "email", "permission", "last_opened_at", "created_at"]
        read_only_fields = ["id", "last_opened_at", "created_at"]


class SharingRoomSerializer(serializers.ModelSerializer):
    """
    Owner-facing room serializer. Exposes the public token + room URL (the owner
    needs them to share) and nested items/participants. State changes happen
    through actions, so the write surface is just editable metadata.
    """

    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    items = SharingRoomItemSerializer(many=True, read_only=True)
    participants = SharingRoomParticipantSerializer(many=True, read_only=True)
    public_url = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    request_count = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = SharingRoom
        fields = [
            "id", "owner", "title", "description", "room_type", "status",
            "token", "public_url", "linked_bundle", "linked_application",
            "expires_at", "allow_download", "allow_upload",
            "items", "participants", "item_count", "request_count",
            "is_expired", "is_open",
            "opened_at", "last_opened_at", "open_count", "revoked_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "owner", "status", "token", "public_url", "items", "participants",
            "item_count", "request_count", "is_expired", "is_open",
            "opened_at", "last_opened_at", "open_count", "revoked_at",
            "created_at", "updated_at",
        ]

    def get_public_url(self, obj):
        from django.conf import settings

        base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
        return f"{base}/room/{obj.token}"

    def get_item_count(self, obj):
        return obj.items.count()

    def get_request_count(self, obj):
        return obj.items.filter(item_type=SharingRoomItem.ItemType.REQUEST).count()
