from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from apps.documents.models import (
    DocumentChecklistItemTemplate,
    DocumentChecklistTemplate,
)

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    InviteCode,
    InviteCodeUse,
    LaunchChecklistItem,
    OperationalEvent,
    ProductEvent,
    ScheduledJobRun,
    TransactionalEmailSetting,
    WaitlistEntry,
)
from .services import create_invite_code, normalize_invite_code, sanitize_metadata


User = get_user_model()


class FounderMeSerializer(serializers.Serializer):
    is_founder = serializers.BooleanField()
    user_id = serializers.IntegerField()
    email = serializers.EmailField()


class PrivateBetaStatusSerializer(serializers.Serializer):
    private_beta_enabled = serializers.BooleanField()


class WaitlistCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaitlistEntry
        fields = [
            "id",
            "full_name",
            "email",
            "persona",
            "country",
            "message",
            "referral_source",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "status", "created_at"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Full name is required.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        active_statuses = [
            WaitlistEntry.Status.PENDING,
            WaitlistEntry.Status.INVITED,
        ]
        if WaitlistEntry.objects.filter(
            email__iexact=value,
            status__in=active_statuses,
        ).exists():
            raise serializers.ValidationError(
                "This email is already on the private beta waitlist."
            )
        return value

    def validate_country(self, value):
        return value.strip()

    def validate_message(self, value):
        return value.strip()

    def validate_referral_source(self, value):
        return value.strip()


class InviteValidateSerializer(serializers.Serializer):
    code = serializers.CharField(write_only=True, trim_whitespace=True, max_length=80)

    def validate_code(self, value):
        return normalize_invite_code(value)


class InviteCodeUseSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = InviteCodeUse
        fields = [
            "id",
            "user",
            "user_email",
            "waitlist_entry",
            "email",
            "used_at",
        ]
        read_only_fields = fields


class FounderInviteCodeSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)
    remaining_uses = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    status_label = serializers.CharField(read_only=True)
    custom_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=40,
    )
    waitlist_entry_id = serializers.IntegerField(
        write_only=True,
        required=False,
        min_value=1,
    )
    uses = InviteCodeUseSerializer(many=True, read_only=True)

    class Meta:
        model = InviteCode
        fields = [
            "id",
            "code",
            "label",
            "created_by",
            "created_by_email",
            "max_uses",
            "used_count",
            "remaining_uses",
            "expires_at",
            "is_active",
            "is_expired",
            "status_label",
            "persona_target",
            "notes",
            "custom_code",
            "waitlist_entry_id",
            "uses",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "code",
            "created_by",
            "created_by_email",
            "used_count",
            "remaining_uses",
            "is_expired",
            "status_label",
            "uses",
            "created_at",
            "updated_at",
        ]

    def validate_max_uses(self, value):
        if value < 1:
            raise serializers.ValidationError("Invite codes need at least one use.")
        return value

    def validate_custom_code(self, value):
        if not value:
            return ""
        code = normalize_invite_code(value)
        if len(code) < 6:
            raise serializers.ValidationError("Use at least 6 characters.")
        if InviteCode.objects.filter(code=code).exists():
            raise serializers.ValidationError("This invite code already exists.")
        return code

    def create(self, validated_data):
        custom_code = validated_data.pop("custom_code", "")
        waitlist_entry_id = validated_data.pop("waitlist_entry_id", None)
        request = self.context.get("request")
        waitlist_entry = None
        if waitlist_entry_id is not None:
            waitlist_entry = WaitlistEntry.objects.filter(pk=waitlist_entry_id).first()
            if waitlist_entry is None:
                raise serializers.ValidationError(
                    {"waitlist_entry_id": "Waitlist entry not found."}
                )
        return create_invite_code(
            created_by=getattr(request, "user", None),
            request=request,
            waitlist_entry=waitlist_entry,
            code=custom_code,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data.pop("custom_code", None)
        validated_data.pop("waitlist_entry_id", None)
        return super().update(instance, validated_data)


class FounderWaitlistEntrySerializer(serializers.ModelSerializer):
    invite_code_value = serializers.CharField(source="invite_code.code", read_only=True)
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True)
    accepted_user_email = serializers.EmailField(
        source="accepted_user.email",
        read_only=True,
    )

    class Meta:
        model = WaitlistEntry
        fields = [
            "id",
            "full_name",
            "email",
            "persona",
            "country",
            "message",
            "referral_source",
            "status",
            "founder_notes",
            "invite_code",
            "invite_code_value",
            "invited_by",
            "invited_by_email",
            "accepted_user",
            "accepted_user_email",
            "invited_at",
            "accepted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "email",
            "invite_code",
            "invite_code_value",
            "invited_by",
            "invited_by_email",
            "accepted_user",
            "accepted_user_email",
            "invited_at",
            "accepted_at",
            "created_at",
            "updated_at",
        ]

    def update(self, instance, validated_data):
        old_status = instance.status
        item = super().update(instance, validated_data)
        updates = []
        if item.status == WaitlistEntry.Status.INVITED and item.invited_at is None:
            item.invited_at = timezone.now()
            updates.append("invited_at")
        if item.status == WaitlistEntry.Status.ACCEPTED and item.accepted_at is None:
            item.accepted_at = timezone.now()
            updates.append("accepted_at")
        if old_status == WaitlistEntry.Status.ACCEPTED and item.status != old_status:
            item.accepted_at = None
            updates.append("accepted_at")
        if updates:
            item.save(update_fields=[*updates, "updated_at"])
        return item


class FeedbackCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedbackItem
        fields = [
            "id",
            "email",
            "category",
            "title",
            "message",
            "urgency",
            "contact_preference",
            "related_path",
            "related_feature",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Title is required.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message is required.")
        return value


class FounderFeedbackSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = FeedbackItem
        fields = [
            "id",
            "user",
            "user_email",
            "email",
            "category",
            "title",
            "message",
            "urgency",
            "contact_preference",
            "status",
            "priority",
            "source",
            "related_path",
            "related_feature",
            "founder_notes",
            "founder_response",
            "created_at",
            "updated_at",
            "reviewed_at",
            "responded_at",
            "closed_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_email",
            "email",
            "category",
            "title",
            "message",
            "urgency",
            "contact_preference",
            "source",
            "related_path",
            "related_feature",
            "created_at",
            "updated_at",
            "reviewed_at",
            "responded_at",
            "closed_at",
        ]

    def update(self, instance, validated_data):
        old_status = instance.status
        old_response = instance.founder_response
        item = super().update(instance, validated_data)
        updates = []
        if old_status == FeedbackItem.Status.NEW and item.status != old_status:
            item.reviewed_at = timezone.now()
            updates.append("reviewed_at")
        if item.founder_response.strip() and item.founder_response != old_response:
            item.responded_at = timezone.now()
            updates.append("responded_at")
        elif not item.founder_response.strip() and item.responded_at is not None:
            item.responded_at = None
            updates.append("responded_at")
        if item.status in {FeedbackItem.Status.CLOSED, FeedbackItem.Status.REJECTED}:
            if item.closed_at is None:
                item.closed_at = timezone.now()
                updates.append("closed_at")
        elif old_status in {FeedbackItem.Status.CLOSED, FeedbackItem.Status.REJECTED}:
            item.closed_at = None
            updates.append("closed_at")
        if updates:
            item.save(update_fields=[*updates, "updated_at"])
        return item


class ClientErrorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppErrorLog
        fields = [
            "id",
            "severity",
            "source",
            "error_type",
            "message",
            "path",
            "method",
            "status_code",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    # Payload caps (SEC-008): a public endpoint must not let callers write
    # unbounded rows. Over-long text is truncated rather than rejected so genuine
    # client errors are still captured.
    _MAX_MESSAGE = 2000
    _MAX_FIELD = 500
    _MAX_METADATA_BYTES = 4096

    def validate_message(self, value):
        return (value or "")[: self._MAX_MESSAGE]

    def validate_error_type(self, value):
        return (value or "")[: self._MAX_FIELD]

    def validate_path(self, value):
        return (value or "")[: self._MAX_FIELD]

    def validate_metadata(self, value):
        import json

        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        try:
            encoded = json.dumps(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError("Metadata is not serializable.")
        if len(encoded.encode("utf-8")) > self._MAX_METADATA_BYTES:
            raise serializers.ValidationError(
                "Metadata is too large. Keep it under 4 KB."
            )
        return sanitize_metadata(value)

    def validate_source(self, value):
        if value not in {
            AppErrorLog.Source.FRONTEND,
            AppErrorLog.Source.BACKEND,
            AppErrorLog.Source.SYSTEM,
        }:
            raise serializers.ValidationError("Unsupported error source.")
        return value


class FounderAppErrorLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    traceback = serializers.SerializerMethodField()

    class Meta:
        model = AppErrorLog
        fields = [
            "id",
            "user",
            "user_email",
            "severity",
            "source",
            "error_type",
            "message",
            "path",
            "method",
            "status_code",
            "traceback",
            "metadata",
            "resolved",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_email",
            "source",
            "error_type",
            "message",
            "path",
            "method",
            "status_code",
            "traceback",
            "metadata",
            "resolved_at",
            "created_at",
        ]

    def get_traceback(self, obj):
        return obj.traceback if settings.DEBUG else ""

    def update(self, instance, validated_data):
        resolved = validated_data.get("resolved", instance.resolved)
        if resolved and not instance.resolved:
            validated_data["resolved_at"] = timezone.now()
        if not resolved:
            validated_data["resolved_at"] = None
        return super().update(instance, validated_data)


class FounderOperationalEventSerializer(serializers.ModelSerializer):
    """Read-only view of an operational event for the observability console.

    Every field here is already safe (metadata was scrubbed on write); user is
    exposed only as an id, never with private contents.
    """

    class Meta:
        model = OperationalEvent
        fields = [
            "id",
            "created_at",
            "severity",
            "category",
            "source",
            "status",
            "user",
            "organization",
            "correlation_id",
            "message",
            "error_code",
            "metadata",
            "resolved",
            "resolved_at",
            "resolution_note",
        ]
        read_only_fields = fields


class FounderScheduledJobRunSerializer(serializers.ModelSerializer):
    """Read-only view of one scheduled-job execution (already-safe fields)."""

    class Meta:
        model = ScheduledJobRun
        fields = [
            "id",
            "job_name",
            "display_name",
            "category",
            "status",
            "started_at",
            "finished_at",
            "duration_ms",
            "attempted_count",
            "success_count",
            "skipped_count",
            "failed_count",
            "triggered_by",
            "triggered_by_user",
            "correlation_id",
            "error_code",
            "safe_message",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class ProductEventSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = ProductEvent
        fields = [
            "id",
            "user",
            "user_email",
            "event_type",
            "event_source",
            "object_type",
            "object_id",
            "path",
            "method",
            "status_code",
            "country",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class FounderAuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = FounderAuditLog
        fields = [
            "id",
            "actor",
            "actor_email",
            "action",
            "object_type",
            "object_id",
            "path",
            "method",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class FeatureCompletionItemSerializer(serializers.ModelSerializer):
    completion_percent = serializers.SerializerMethodField()

    class Meta:
        model = FeatureCompletionItem
        fields = [
            "id",
            "key",
            "feature_name",
            "module",
            "backend_done",
            "frontend_done",
            "tests_done",
            "docs_done",
            "polished",
            "status",
            "priority",
            "notes",
            "sort_order",
            "completion_percent",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"key": {"required": False}}

    def validate_key(self, value):
        value = slugify(value or "")[:80]
        if not value:
            raise serializers.ValidationError("Key is required.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None and not attrs.get("key"):
            attrs["key"] = slugify(attrs.get("feature_name", ""))[:80]
        if self.instance is None and not attrs.get("key"):
            raise serializers.ValidationError({"key": "Key is required."})
        return attrs

    def get_completion_percent(self, obj):
        flags = [
            obj.backend_done,
            obj.frontend_done,
            obj.tests_done,
            obj.docs_done,
            obj.polished,
        ]
        return round((sum(1 for flag in flags if flag) / len(flags)) * 100)


class LaunchChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LaunchChecklistItem
        fields = [
            "id",
            "key",
            "label",
            "description",
            "is_complete",
            "priority",
            "notes",
            "sort_order",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "key",
            "label",
            "description",
            "sort_order",
            "completed_at",
            "created_at",
            "updated_at",
        ]

    def update(self, instance, validated_data):
        if "is_complete" in validated_data:
            is_complete = validated_data["is_complete"]
            if is_complete and not instance.is_complete:
                validated_data["completed_at"] = timezone.now()
            elif not is_complete:
                validated_data["completed_at"] = None
        return super().update(instance, validated_data)


class BetaUserProfileSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    document_count = serializers.IntegerField(read_only=True)
    file_count = serializers.IntegerField(read_only=True)
    reminder_count = serializers.IntegerField(read_only=True)
    bundle_count = serializers.IntegerField(read_only=True)
    feedback_count = serializers.IntegerField(read_only=True)
    onboarding_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = BetaUserProfile
        fields = [
            "id",
            "user",
            "user_email",
            "username",
            "date_joined",
            "last_login",
            "invite_status",
            "persona",
            "tags",
            "notes",
            "invited_at",
            "activated_at",
            "last_contacted_at",
            "document_count",
            "file_count",
            "reminder_count",
            "bundle_count",
            "feedback_count",
            "onboarding_completed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_email",
            "username",
            "date_joined",
            "last_login",
            "document_count",
            "file_count",
            "reminder_count",
            "bundle_count",
            "feedback_count",
            "onboarding_completed",
            "created_at",
            "updated_at",
        ]

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list.")
        return [str(item)[:80] for item in value[:12]]


class ChecklistItemTemplateWriteSerializer(serializers.ModelSerializer):
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
        read_only_fields = ["id"]


class FounderChecklistTemplateSerializer(serializers.ModelSerializer):
    items = ChecklistItemTemplateWriteSerializer(
        source="item_templates",
        many=True,
        required=False,
    )

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
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _unique_slug(self, title: str, instance=None) -> str:
        base = slugify(title)[:120] or "checklist-template"
        candidate = base
        suffix = 2
        queryset = DocumentChecklistTemplate.objects.all()
        if instance is not None:
            queryset = queryset.exclude(pk=instance.pk)
        while queryset.filter(slug=candidate).exists():
            candidate = f"{base[:110]}-{suffix}"
            suffix += 1
        return candidate

    def create(self, validated_data):
        item_data = validated_data.pop("item_templates", [])
        validated_data.setdefault("is_system_template", True)
        if not validated_data.get("slug"):
            validated_data["slug"] = self._unique_slug(validated_data["title"])
        template = DocumentChecklistTemplate.objects.create(**validated_data)
        self._replace_items(template, item_data)
        return template

    def update(self, instance, validated_data):
        item_data = validated_data.pop("item_templates", None)
        if not validated_data.get("slug") and "title" in validated_data:
            validated_data["slug"] = self._unique_slug(
                validated_data["title"],
                instance=instance,
            )
        template = super().update(instance, validated_data)
        if item_data is not None:
            self._replace_items(template, item_data)
        return template

    def _replace_items(self, template, item_data):
        template.item_templates.all().delete()
        items = [
            DocumentChecklistItemTemplate(template=template, **item)
            for item in item_data
        ]
        DocumentChecklistItemTemplate.objects.bulk_create(items)


class FounderUserListSerializer(serializers.ModelSerializer):
    document_count = serializers.IntegerField(read_only=True)
    file_count = serializers.IntegerField(read_only=True)
    reminder_count = serializers.IntegerField(read_only=True)
    checklist_count = serializers.IntegerField(read_only=True)
    bundle_count = serializers.IntegerField(read_only=True)
    share_link_count = serializers.IntegerField(read_only=True)
    feedback_count = serializers.IntegerField(read_only=True)
    onboarding_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "date_joined",
            "last_login",
            "is_staff",
            "document_count",
            "file_count",
            "reminder_count",
            "checklist_count",
            "bundle_count",
            "share_link_count",
            "feedback_count",
            "onboarding_completed",
        ]
        read_only_fields = fields


class TransactionalEmailSettingSerializer(serializers.ModelSerializer):
    """Founder-editable transactional email. Only enabled/subject/body are
    writable; blank subject/body fall back to the code defaults (exposed here as
    read-only fields so the editor can show and reset to them)."""

    default_subject = serializers.SerializerMethodField()
    default_body = serializers.SerializerMethodField()
    trigger = serializers.SerializerMethodField()

    class Meta:
        model = TransactionalEmailSetting
        fields = [
            "id",
            "key",
            "name",
            "enabled",
            "subject",
            "body",
            "default_subject",
            "default_body",
            "trigger",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "key",
            "name",
            "default_subject",
            "default_body",
            "trigger",
            "updated_at",
        ]

    def _definition(self, obj):
        from common.transactional_email import TRANSACTIONAL_EMAILS

        return TRANSACTIONAL_EMAILS.get(obj.key)

    def get_default_subject(self, obj) -> str:
        definition = self._definition(obj)
        return definition.subject if definition else ""

    def get_default_body(self, obj) -> str:
        definition = self._definition(obj)
        return definition.body if definition else ""

    def get_trigger(self, obj) -> str:
        definition = self._definition(obj)
        return definition.trigger if definition else ""
