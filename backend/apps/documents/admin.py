from django.contrib import admin

from .models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentCategory,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentChecklistItemTemplate,
    DocumentChecklistTemplate,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentReminderRule,
)


@admin.register(DocumentCategory)
class DocumentCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "created_at"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "owner",
        "category",
        "expiry_date",
        "status",
        "created_at",
    ]
    list_filter = ["status", "category"]
    search_fields = ["title", "issuer", "reference_number", "owner__username"]
    # owner uses raw_id (the custom User model isn't registered for autocomplete);
    # category supports autocomplete via DocumentCategoryAdmin.search_fields.
    raw_id_fields = ["owner"]
    autocomplete_fields = ["category"]
    date_hierarchy = "created_at"


@admin.register(DocumentFile)
class DocumentFileAdmin(admin.ModelAdmin):
    list_display = [
        "original_filename",
        "document",
        "uploaded_by",
        "content_type",
        "file_size",
        "created_at",
    ]
    list_filter = ["content_type"]
    search_fields = ["original_filename", "uploaded_by__username"]
    raw_id_fields = ["document", "uploaded_by"]
    readonly_fields = ["file_size", "checksum", "created_at", "updated_at"]
    date_hierarchy = "created_at"


@admin.register(DocumentFileShareLink)
class DocumentFileShareLinkAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "file",
        "owner",
        "permission",
        "access_code_required",
        "expires_at",
        "revoked_at",
        "created_at",
    ]
    list_filter = ["permission", "access_code_required"]
    search_fields = ["token", "owner__username", "label", "recipient_email"]
    raw_id_fields = ["owner", "document", "file"]
    readonly_fields = [
        "token",
        "access_code_hash",
        "created_at",
        "last_accessed_at",
    ]
    date_hierarchy = "created_at"


@admin.register(DocumentFileActivity)
class DocumentFileActivityAdmin(admin.ModelAdmin):
    list_display = ["id", "file", "owner", "action", "actor_type", "created_at"]
    list_filter = ["action", "actor_type"]
    search_fields = ["owner__username", "action"]
    raw_id_fields = ["owner", "document", "file", "share_link"]
    readonly_fields = [
        "owner",
        "document",
        "file",
        "share_link",
        "action",
        "actor_type",
        "ip_address",
        "user_agent",
        "metadata",
        "created_at",
    ]
    date_hierarchy = "created_at"


@admin.register(DocumentReminderRule)
class DocumentReminderRuleAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "document",
        "owner",
        "trigger_type",
        "days_before",
        "is_enabled",
        "created_at",
    ]
    list_filter = ["trigger_type", "is_enabled"]
    search_fields = ["document__title", "owner__username", "owner__email"]
    raw_id_fields = ["owner", "document"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "created_at"


# ---- Renewal workspace ------------------------------------------------------


class DocumentChecklistItemTemplateInline(admin.TabularInline):
    model = DocumentChecklistItemTemplate
    extra = 0


@admin.register(DocumentChecklistTemplate)
class DocumentChecklistTemplateAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "checklist_type",
        "document_type",
        "is_system_template",
        "is_active",
        "sort_order",
    ]
    list_filter = ["checklist_type", "is_system_template", "is_active"]
    search_fields = ["title", "document_type", "use_case", "slug"]
    prepopulated_fields = {"slug": ("title",)}
    inlines = [DocumentChecklistItemTemplateInline]


class DocumentChecklistItemInline(admin.TabularInline):
    model = DocumentChecklistItem
    extra = 0
    raw_id_fields = ["owner", "linked_document", "linked_file"]


@admin.register(DocumentChecklist)
class DocumentChecklistAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "owner",
        "checklist_type",
        "status",
        "progress_percent",
        "due_date",
        "created_at",
    ]
    list_filter = ["checklist_type", "status"]
    search_fields = ["title", "owner__username"]
    raw_id_fields = ["owner", "document", "bundle", "template"]
    readonly_fields = ["progress_percent", "status", "created_at", "updated_at"]
    inlines = [DocumentChecklistItemInline]
    date_hierarchy = "created_at"


class DocumentBundleRequirementInline(admin.TabularInline):
    model = DocumentBundleRequirement
    extra = 0
    raw_id_fields = ["owner", "linked_document", "linked_file"]


@admin.register(DocumentBundle)
class DocumentBundleAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "owner",
        "bundle_type",
        "status",
        "readiness_score",
        "target_date",
        "created_at",
    ]
    list_filter = ["bundle_type", "status"]
    search_fields = ["title", "owner__username", "authority_or_provider"]
    raw_id_fields = ["owner"]
    readonly_fields = ["readiness_score", "created_at", "updated_at"]
    inlines = [DocumentBundleRequirementInline]
    date_hierarchy = "created_at"


@admin.register(DocumentExtraction)
class DocumentExtractionAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "owner",
        "document",
        "file",
        "extraction_status",
        "provider",
        "applied_at",
        "created_at",
    ]
    list_filter = ["extraction_status", "provider"]
    search_fields = ["owner__username", "document__title"]
    raw_id_fields = ["owner", "document", "file"]
    readonly_fields = [
        "raw_text",
        "extracted_fields",
        "confidence_score",
        "reviewed_at",
        "applied_at",
        "created_at",
        "updated_at",
    ]
    date_hierarchy = "created_at"
