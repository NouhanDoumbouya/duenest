from django.contrib import admin

from .models import Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "type",
        "severity",
        "status",
        "scheduled_for",
        "delivered_email_at",
        "created_at",
    )
    list_filter = ("type", "severity", "status", "delivered_email_at")
    search_fields = ("dedupe_key", "title", "user__email", "source_type", "source_id")
    readonly_fields = ("dedupe_key", "created_at", "updated_at")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "in_app_enabled",
        "email_enabled",
        "timezone",
        "updated_at",
    )
    search_fields = ("user__email", "user__username", "timezone")
