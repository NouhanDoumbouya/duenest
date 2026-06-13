from django.contrib import admin

from .models import AppErrorLog, FeedbackItem, ProductEvent


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
