from django.contrib import admin

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    LaunchChecklistItem,
    ProductEvent,
)


@admin.register(ProductEvent)
class ProductEventAdmin(admin.ModelAdmin):
    list_display = ["id", "event_type", "event_source", "user", "created_at"]
    list_filter = ["event_type", "event_source", "created_at"]
    search_fields = ["user__username", "user__email", "object_type", "object_id"]
    raw_id_fields = ["user"]
    readonly_fields = [
        "user",
        "event_type",
        "event_source",
        "object_type",
        "object_id",
        "session_id",
        "path",
        "method",
        "status_code",
        "ip_address",
        "country",
        "region",
        "city",
        "user_agent",
        "metadata",
        "created_at",
    ]
    date_hierarchy = "created_at"


@admin.register(FeedbackItem)
class FeedbackItemAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "category", "status", "priority", "created_at"]
    list_filter = ["category", "status", "priority", "source"]
    search_fields = ["title", "message", "email", "user__email", "related_feature"]
    raw_id_fields = ["user"]
    date_hierarchy = "created_at"


@admin.register(AppErrorLog)
class AppErrorLogAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "severity",
        "source",
        "error_type",
        "resolved",
        "created_at",
    ]
    list_filter = ["severity", "source", "resolved"]
    search_fields = ["error_type", "message", "path", "user__email"]
    raw_id_fields = ["user"]
    readonly_fields = ["created_at"]
    date_hierarchy = "created_at"


@admin.register(FeatureCompletionItem)
class FeatureCompletionItemAdmin(admin.ModelAdmin):
    list_display = [
        "feature_name",
        "module",
        "status",
        "priority",
        "backend_done",
        "frontend_done",
        "tests_done",
        "docs_done",
        "polished",
    ]
    list_filter = ["module", "status", "priority", "polished"]
    search_fields = ["feature_name", "module", "notes"]
    ordering = ["sort_order", "feature_name"]


@admin.register(LaunchChecklistItem)
class LaunchChecklistItemAdmin(admin.ModelAdmin):
    list_display = ["label", "is_complete", "priority", "completed_at"]
    list_filter = ["is_complete", "priority"]
    search_fields = ["label", "description", "notes"]
    ordering = ["sort_order", "label"]


@admin.register(BetaUserProfile)
class BetaUserProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "invite_status", "persona", "updated_at"]
    list_filter = ["invite_status", "persona"]
    search_fields = ["user__email", "user__username", "notes"]
    raw_id_fields = ["user"]


@admin.register(FounderAuditLog)
class FounderAuditLogAdmin(admin.ModelAdmin):
    list_display = ["id", "action", "actor", "object_type", "created_at"]
    list_filter = ["action", "object_type", "created_at"]
    search_fields = ["actor__email", "action", "object_type", "object_id"]
    raw_id_fields = ["actor"]
    readonly_fields = [
        "actor",
        "action",
        "object_type",
        "object_id",
        "path",
        "method",
        "metadata",
        "created_at",
    ]
    date_hierarchy = "created_at"
