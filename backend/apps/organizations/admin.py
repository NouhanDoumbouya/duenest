from django.contrib import admin

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


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "organization_type", "created_by", "archived_at")
    search_fields = ("name", "slug", "country")
    raw_id_fields = ("created_by",)


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "status", "joined_at")
    list_filter = ("role", "status")
    raw_id_fields = ("organization", "user")


@admin.register(OrganizationInvite)
class OrganizationInviteAdmin(admin.ModelAdmin):
    list_display = ("organization", "email", "role", "status", "expires_at")
    list_filter = ("role", "status")
    raw_id_fields = ("organization", "invited_by", "accepted_by")


@admin.register(OrganizationActivity)
class OrganizationActivityAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "safe_summary", "actor", "created_at")
    list_filter = ("action",)
    raw_id_fields = ("organization", "actor")


@admin.register(OrganizationDocument)
class OrganizationDocumentAdmin(admin.ModelAdmin):
    list_display = ("organization", "title", "status", "expiry_date", "is_archived")
    list_filter = ("status", "is_archived")
    raw_id_fields = ("organization", "created_by", "assigned_to")


@admin.register(OrganizationDocumentFile)
class OrganizationDocumentFileAdmin(admin.ModelAdmin):
    list_display = ("organization", "document", "original_filename", "file_size")
    raw_id_fields = ("organization", "document", "uploaded_by")


class CampaignRequirementInline(admin.TabularInline):
    model = CampaignRequirement
    extra = 0


class CampaignTargetInline(admin.TabularInline):
    model = CampaignTargetMember
    extra = 0
    raw_id_fields = ("member",)


@admin.register(DocumentCollectionCampaign)
class DocumentCollectionCampaignAdmin(admin.ModelAdmin):
    list_display = ("organization", "title", "status", "deadline")
    list_filter = ("status",)
    raw_id_fields = ("organization", "created_by")
    inlines = [CampaignRequirementInline, CampaignTargetInline]


@admin.register(DocumentRequest)
class DocumentRequestAdmin(admin.ModelAdmin):
    list_display = ("organization", "title", "status", "deadline", "assigned_to_member")
    list_filter = ("status",)
    raw_id_fields = (
        "organization",
        "requested_by",
        "assigned_to_member",
        "campaign",
        "linked_document",
    )


@admin.register(DocumentRequestSubmission)
class DocumentRequestSubmissionAdmin(admin.ModelAdmin):
    list_display = ("organization", "request", "status", "submitted_by_email")
    list_filter = ("status",)
    raw_id_fields = ("organization", "request", "submitted_by_user", "reviewed_by")


@admin.register(OrganizationRequestTemplate)
class OrganizationRequestTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "organization", "is_system")
    list_filter = ("is_system", "category")
    raw_id_fields = ("organization", "created_by")


@admin.register(OrganizationBundle)
class OrganizationBundleAdmin(admin.ModelAdmin):
    list_display = ("organization", "title", "status", "target_date", "readiness_score")
    list_filter = ("status",)
    raw_id_fields = ("organization", "created_by")


class OrganizationSecureRoomItemInline(admin.TabularInline):
    model = OrganizationSecureRoomItem
    extra = 0
    raw_id_fields = ("document", "file")


@admin.register(OrganizationSecureRoom)
class OrganizationSecureRoomAdmin(admin.ModelAdmin):
    list_display = ("organization", "title", "status", "permission", "expires_at")
    list_filter = ("status", "permission")
    raw_id_fields = ("organization", "created_by")
    inlines = [OrganizationSecureRoomItemInline]
