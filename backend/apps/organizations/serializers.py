import os

from django.utils import timezone
from rest_framework import serializers

from apps.documents.constants import (
    ALLOWED_CONTENT_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
)

from .models import (
    CampaignRequirement,
    CampaignTargetMember,
    DocumentCollectionCampaign,
    DocumentRequest,
    DocumentRequestSubmission,
    Organization,
    OrganizationActivity,
    OrganizationBundle,
    OrganizationDocument,
    OrganizationDocumentFile,
    OrganizationInvite,
    OrganizationMembership,
    OrganizationRequestTemplate,
    OrganizationSecureRoom,
    OrganizationSecureRoomItem,
)
from .services import campaign_progress


def _context_organization(serializer):
    return serializer.context.get("organization")


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source="user.email", read_only=True)
    assigned_requests_count = serializers.SerializerMethodField()
    overdue_requests_count = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "organization",
            "user",
            "user_name",
            "user_email",
            "role",
            "status",
            "joined_at",
            "last_active_at",
            "assigned_requests_count",
            "overdue_requests_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "user",
            "user_name",
            "user_email",
            "joined_at",
            "last_active_at",
            "assigned_requests_count",
            "overdue_requests_count",
            "created_at",
            "updated_at",
        ]

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.get_username()

    def get_assigned_requests_count(self, obj):
        return obj.assigned_document_requests.exclude(
            status__in=[
                DocumentRequest.Status.APPROVED,
                DocumentRequest.Status.CANCELLED,
            ]
        ).count()

    def get_overdue_requests_count(self, obj):
        return sum(1 for request in obj.assigned_document_requests.all() if request.is_overdue)


class OrganizationSerializer(serializers.ModelSerializer):
    user_role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "website",
            "country",
            "organization_type",
            "created_by",
            "archived_at",
            "is_archived",
            "user_role",
            "member_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "slug",
            "created_by",
            "archived_at",
            "is_archived",
            "user_role",
            "member_count",
            "created_at",
            "updated_at",
        ]

    def get_user_role(self, obj):
        request = self.context.get("request")
        if not request:
            return ""
        membership = getattr(obj, "_current_membership", None)
        if membership is None:
            membership = obj.memberships.filter(
                user=request.user, status=OrganizationMembership.Status.ACTIVE
            ).first()
        return membership.role if membership else ""

    def get_member_count(self, obj):
        count = getattr(obj, "member_count", None)
        if count is not None:
            return count
        return obj.memberships.filter(status=OrganizationMembership.Status.ACTIVE).count()


class OrganizationInviteSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.SerializerMethodField()
    accepted_by_name = serializers.SerializerMethodField()
    invite_url = serializers.SerializerMethodField()
    expires_in_days = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationInvite
        fields = [
            "id",
            "organization",
            "email",
            "role",
            "status",
            "token",
            "invite_url",
            "expires_at",
            "expires_in_days",
            "invited_by",
            "invited_by_name",
            "accepted_by",
            "accepted_by_name",
            "accepted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "token",
            "invite_url",
            "status",
            "expires_at",
            "expires_in_days",
            "invited_by",
            "invited_by_name",
            "accepted_by",
            "accepted_by_name",
            "accepted_at",
            "created_at",
            "updated_at",
        ]

    def get_invited_by_name(self, obj):
        if not obj.invited_by:
            return ""
        return obj.invited_by.get_full_name() or obj.invited_by.get_username()

    def get_accepted_by_name(self, obj):
        if not obj.accepted_by:
            return ""
        return obj.accepted_by.get_full_name() or obj.accepted_by.get_username()

    def get_invite_url(self, obj):
        return f"/org-invite/{obj.token}"

    def get_expires_in_days(self, obj):
        delta = obj.expires_at.date() - timezone.localdate()
        return max(delta.days, 0)


class BulkInviteSerializer(serializers.Serializer):
    emails = serializers.CharField()
    role = serializers.ChoiceField(
        choices=OrganizationMembership.Role.choices,
        default=OrganizationMembership.Role.MEMBER,
    )


class InviteAcceptSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_type = serializers.CharField(
        source="organization.organization_type", read_only=True
    )

    class Meta:
        model = OrganizationInvite
        fields = [
            "id",
            "organization",
            "organization_name",
            "organization_type",
            "email",
            "role",
            "status",
            "expires_at",
        ]
        read_only_fields = fields


class OrganizationDocumentFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationDocumentFile
        fields = [
            "id",
            "organization",
            "document",
            "original_filename",
            "content_type",
            "file_size",
            "uploaded_by",
            "created_at",
        ]
        read_only_fields = fields


class OrganizationFileUploadSerializer(serializers.Serializer):
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

        if uploaded.content_type not in ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Unsupported file type. Allowed types: PDF, JPEG, PNG, DOC, DOCX."
            )

        return uploaded


class OrganizationDocumentSerializer(serializers.ModelSerializer):
    file_count = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationDocument
        fields = [
            "id",
            "organization",
            "created_by",
            "assigned_to",
            "assigned_to_name",
            "title",
            "document_type",
            "issuer",
            "country",
            "issue_date",
            "expiry_date",
            "renewal_date",
            "status",
            "notes",
            "is_archived",
            "archived_at",
            "file_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_by",
            "assigned_to_name",
            "is_archived",
            "archived_at",
            "file_count",
            "created_at",
            "updated_at",
        ]

    def get_file_count(self, obj):
        count = getattr(obj, "file_count", None)
        if count is not None:
            return count
        return obj.files.count()

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return ""
        return obj.assigned_to.user.get_full_name() or obj.assigned_to.user.get_username()

    def validate(self, attrs):
        organization = _context_organization(self)
        assigned_to = attrs.get("assigned_to")
        if organization and assigned_to and assigned_to.organization_id != organization.id:
            raise serializers.ValidationError(
                {"assigned_to": "Assignee must belong to this organization."}
            )
        return attrs


class DocumentRequestSubmissionSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DocumentRequestSubmission
        fields = [
            "id",
            "organization",
            "request",
            "submitted_by_user",
            "submitted_by_name",
            "submitted_by_email",
            "original_filename",
            "content_type",
            "file_size",
            "notes",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "request",
            "submitted_by_user",
            "submitted_by_name",
            "original_filename",
            "content_type",
            "file_size",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]

    def get_submitted_by_name(self, obj):
        if not obj.submitted_by_user:
            return ""
        return obj.submitted_by_user.get_full_name() or obj.submitted_by_user.get_username()

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return ""
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.get_username()


class DocumentRequestSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    public_upload_active = serializers.BooleanField(read_only=True)
    submissions = DocumentRequestSubmissionSerializer(many=True, read_only=True)

    class Meta:
        model = DocumentRequest
        fields = [
            "id",
            "organization",
            "requested_by",
            "requested_by_name",
            "assigned_to_member",
            "assigned_to_name",
            "recipient_email",
            "campaign",
            "title",
            "description",
            "required_file_type",
            "deadline",
            "status",
            "linked_document",
            "public_upload_token",
            "public_upload_expires_at",
            "public_upload_active",
            "rejection_reason",
            "internal_note",
            "last_reminded_at",
            "is_overdue",
            "submissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "requested_by",
            "requested_by_name",
            "assigned_to_name",
            "public_upload_token",
            "public_upload_expires_at",
            "public_upload_active",
            "last_reminded_at",
            "is_overdue",
            "submissions",
            "created_at",
            "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to_member:
            return ""
        return obj.assigned_to_member.user.get_full_name() or obj.assigned_to_member.user.get_username()

    def get_requested_by_name(self, obj):
        if not obj.requested_by:
            return ""
        return obj.requested_by.get_full_name() or obj.requested_by.get_username()

    def validate(self, attrs):
        organization = _context_organization(self)
        if not organization:
            return attrs
        assigned_to = attrs.get("assigned_to_member")
        campaign = attrs.get("campaign")
        linked_document = attrs.get("linked_document")
        errors = {}
        if assigned_to and assigned_to.organization_id != organization.id:
            errors["assigned_to_member"] = "Assignee must belong to this organization."
        if campaign and campaign.organization_id != organization.id:
            errors["campaign"] = "Campaign must belong to this organization."
        if linked_document and linked_document.organization_id != organization.id:
            errors["linked_document"] = "Document must belong to this organization."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class CampaignRequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignRequirement
        fields = [
            "id",
            "campaign",
            "title",
            "description",
            "required_file_type",
            "is_required",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "campaign", "created_at", "updated_at"]


class CampaignTargetMemberSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_email = serializers.EmailField(source="member.user.email", read_only=True)

    class Meta:
        model = CampaignTargetMember
        fields = [
            "id",
            "campaign",
            "member",
            "member_name",
            "member_email",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "campaign",
            "member_name",
            "member_email",
            "created_at",
            "updated_at",
        ]

    def get_member_name(self, obj):
        return obj.member.user.get_full_name() or obj.member.user.get_username()


class DocumentCollectionCampaignSerializer(serializers.ModelSerializer):
    requirements = CampaignRequirementSerializer(many=True, required=False)
    targets = CampaignTargetMemberSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    target_member_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = DocumentCollectionCampaign
        fields = [
            "id",
            "organization",
            "created_by",
            "title",
            "description",
            "deadline",
            "status",
            "target_all_members",
            "instructions",
            "requirements",
            "target_member_ids",
            "targets",
            "progress",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_by",
            "targets",
            "progress",
            "created_at",
            "updated_at",
        ]

    def get_progress(self, obj):
        return campaign_progress(obj)

    def create(self, validated_data):
        requirements = validated_data.pop("requirements", [])
        target_member_ids = validated_data.pop("target_member_ids", [])
        organization = _context_organization(self)
        if organization and target_member_ids:
            found = set(
                OrganizationMembership.objects.filter(
                    organization=organization,
                    id__in=target_member_ids,
                    status=OrganizationMembership.Status.ACTIVE,
                ).values_list("id", flat=True)
            )
            missing = set(target_member_ids) - found
            if missing:
                raise serializers.ValidationError(
                    {"target_member_ids": "All target members must belong to this organization."}
                )
        campaign = super().create(validated_data)
        for order, item in enumerate(requirements):
            CampaignRequirement.objects.create(
                campaign=campaign,
                sort_order=item.get("sort_order", order),
                **{k: v for k, v in item.items() if k != "sort_order"},
            )
        members = OrganizationMembership.objects.filter(
            organization=campaign.organization,
            status=OrganizationMembership.Status.ACTIVE,
        )
        if target_member_ids:
            members = members.filter(id__in=target_member_ids)
        elif not campaign.target_all_members:
            members = OrganizationMembership.objects.none()
        for member in members:
            CampaignTargetMember.objects.get_or_create(campaign=campaign, member=member)
        return campaign


class OrganizationRequestTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationRequestTemplate
        fields = [
            "id",
            "organization",
            "name",
            "description",
            "category",
            "required_file_type",
            "is_system",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "is_system",
            "created_by",
            "created_at",
            "updated_at",
        ]


class OrganizationBundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationBundle
        fields = [
            "id",
            "organization",
            "created_by",
            "title",
            "description",
            "target_date",
            "status",
            "readiness_score",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_by",
            "readiness_score",
            "created_at",
            "updated_at",
        ]


class OrganizationSecureRoomItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSecureRoomItem
        fields = ["id", "room", "document", "file", "notes", "sort_order", "created_at"]
        read_only_fields = ["id", "room", "created_at"]


class OrganizationSecureRoomSerializer(serializers.ModelSerializer):
    items = OrganizationSecureRoomItemSerializer(many=True, required=False)
    public_url = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationSecureRoom
        fields = [
            "id",
            "organization",
            "created_by",
            "title",
            "description",
            "recipient_label",
            "instructions",
            "permission",
            "status",
            "token",
            "public_url",
            "expires_at",
            "revoked_at",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_by",
            "token",
            "public_url",
            "revoked_at",
            "created_at",
            "updated_at",
        ]

    def get_public_url(self, obj):
        return f"/org-room/{obj.token}" if obj.token else ""

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        organization = _context_organization(self)
        for item in items:
            document = item.get("document")
            file = item.get("file")
            if organization and document and document.organization_id != organization.id:
                raise serializers.ValidationError(
                    {"items": "Room documents must belong to this organization."}
                )
            if organization and file and file.organization_id != organization.id:
                raise serializers.ValidationError(
                    {"items": "Room files must belong to this organization."}
                )
        room = super().create(validated_data)
        for order, item in enumerate(items):
            OrganizationSecureRoomItem.objects.create(
                room=room,
                sort_order=item.get("sort_order", order),
                **{k: v for k, v in item.items() if k not in {"room", "sort_order"}},
            )
        return room


class OrganizationActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationActivity
        fields = [
            "id",
            "actor",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "safe_summary",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return ""
        return obj.actor.get_full_name() or obj.actor.get_username()


class PublicDocumentRequestSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = DocumentRequest
        fields = [
            "id",
            "organization_name",
            "title",
            "description",
            "required_file_type",
            "deadline",
            "status",
            "public_upload_active",
        ]
        read_only_fields = fields


class PublicOrganizationSecureRoomSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    items = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationSecureRoom
        fields = [
            "id",
            "organization_name",
            "title",
            "description",
            "recipient_label",
            "instructions",
            "permission",
            "status",
            "expires_at",
            "items",
        ]
        read_only_fields = fields

    def get_items(self, obj):
        return [
            {
                "id": item.id,
                "document_title": item.document.title if item.document else "",
                "document_type": item.document.document_type if item.document else "",
                "file_name": item.file.original_filename if item.file else "",
                "content_type": item.file.content_type if item.file else "",
                "file_size": item.file.file_size if item.file else 0,
                "notes": item.notes,
                "sort_order": item.sort_order,
            }
            for item in obj.items.all()
        ]
