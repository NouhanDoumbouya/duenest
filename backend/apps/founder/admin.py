from django.contrib import admin

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    InviteCode,
    InviteCodeUse,
    LaunchChecklistItem,
    ProductEvent,
    WaitlistEntry,
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


@admin.register(WaitlistEntry)
class WaitlistEntryAdmin(admin.ModelAdmin):
    list_display = ["email", "full_name", "persona", "status", "country", "created_at"]
    list_filter = ["status", "persona", "country", "created_at"]
    search_fields = ["email", "full_name", "message", "referral_source"]
    raw_id_fields = ["invite_code", "invited_by", "accepted_user"]
    readonly_fields = ["created_at", "updated_at", "invited_at", "accepted_at"]
    date_hierarchy = "created_at"


@admin.register(InviteCode)
class InviteCodeAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "label",
        "is_active",
        "used_count",
        "max_uses",
        "expires_at",
        "created_at",
    ]
    list_filter = ["is_active", "persona_target", "expires_at", "created_at"]
    search_fields = ["code", "label", "notes", "created_by__email"]
    raw_id_fields = ["created_by"]
    readonly_fields = ["used_count", "created_at", "updated_at"]
    date_hierarchy = "created_at"


@admin.register(InviteCodeUse)
class InviteCodeUseAdmin(admin.ModelAdmin):
    list_display = ["id", "invite_code", "email", "user", "used_at"]
    list_filter = ["used_at"]
    search_fields = ["email", "invite_code__code", "user__email"]
    raw_id_fields = ["invite_code", "user", "waitlist_entry"]
    readonly_fields = ["invite_code", "user", "waitlist_entry", "email", "metadata", "used_at"]
    date_hierarchy = "used_at"


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
