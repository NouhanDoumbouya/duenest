from django.contrib import admin

from .models import (
    EmailLog,
    Notification,
    NotificationPreference,
    PushWebSubscription,
    SuppressedEmail,
)


@admin.register(SuppressedEmail)
class SuppressedEmailAdmin(admin.ModelAdmin):
    list_display = ("email", "scope", "reason", "created_at")
    list_filter = ("scope", "reason")
    search_fields = ("email",)


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ("email_type", "category", "recipient", "status", "created_at")
    list_filter = ("status", "category", "email_type")
    search_fields = ("recipient", "email_type", "provider_message_id")
    readonly_fields = ("created_at",)


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


@admin.register(PushWebSubscription)
class PushWebSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "device_label", "failure_count", "last_used_at", "created_at")
    search_fields = ("user__email", "user__username", "device_label")
    readonly_fields = ("endpoint", "p256dh", "auth", "created_at", "last_used_at")
