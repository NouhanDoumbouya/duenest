from django.contrib import admin

from .models import (
    Document,
    DocumentCategory,
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
