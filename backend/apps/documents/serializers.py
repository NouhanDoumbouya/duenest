import os

from django.utils import timezone
from rest_framework import serializers
from rest_framework.reverse import reverse

from .constants import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE
from .models import (
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
    ProofRecord,
)
from .services import (
    APPLICABLE_EXTRACTION_FIELDS,
    bundle_readiness,
    checklist_progress,
    compute_confidence,
    compute_last_safe_action,
    get_document_health,
    reminder_date_for_rule,
)


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
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "is_trashed",
            "trashed_at",
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
            "is_trashed",
            "trashed_at",
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
        return obj.item_templates.count()


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
        if linked_file is not None and linked_file.document.owner_id != getattr(
            user, "id", None
        ):
            raise serializers.ValidationError(
                {"linked_file": "You can only link your own files."}
            )
        if linked_file is not None and (
            linked_file.is_trashed or linked_file.document.is_trashed
        ):
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
        if file is not None and file.document.owner_id != getattr(user, "id", None):
            raise serializers.ValidationError(
                {"linked_file": "You can only add your own files."}
            )
        if file is not None and (file.is_trashed or file.document.is_trashed):
            raise serializers.ValidationError(
                {"linked_file": "You cannot add a trashed file."}
            )
        if file is not None and document is not None and file.document_id != document.id:
            raise serializers.ValidationError(
                {"linked_file": "The file must belong to the selected document."}
            )
        return attrs


class EmergencyAccessPackSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    items = EmergencyAccessPackItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    share_url_path = serializers.SerializerMethodField()
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
            "expires_at",
            "access_code_required",
            "access_code",
            "share_url_path",
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
        # through dedicated enable/disable/regenerate actions.
        read_only_fields = [
            "id",
            "owner",
            "status",
            "share_url_path",
            "last_accessed_at",
            "disabled_at",
            "is_expired",
            "item_count",
            "items",
            "created_at",
            "updated_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()

    def get_share_url_path(self, obj):
        # Relative public path; only present while the pack is shareable now.
        if not obj.is_shareable_now:
            return None
        return f"/api/v1/share/emergency-packs/{obj.token}/"

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
    """SAFE public view of a shared pack. No owner identity, no internal ids."""

    title = serializers.CharField()
    description = serializers.CharField()
    access_code_required = serializers.BooleanField()
    expires_at = serializers.DateTimeField()
    items = serializers.SerializerMethodField()

    def get_items(self, obj):
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


class ProofRecordSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    document_title = serializers.CharField(
        source="document.title", read_only=True, default=None
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
            owned(linked_file, linked_file.document.owner_id, "linked_file")
            if linked_file.is_trashed or linked_file.document.is_trashed:
                raise serializers.ValidationError(
                    {"linked_file": "You cannot link a trashed file."}
                )
        return attrs


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
