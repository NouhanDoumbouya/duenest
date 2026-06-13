from django.contrib import admin

from .models import AccountDeletionRequest, UserOnboardingState


@admin.register(UserOnboardingState)
class UserOnboardingStateAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "has_completed_document_onboarding",
        "dismissed_onboarding_at",
        "updated_at",
    ]
    search_fields = ["user__username", "user__email"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(AccountDeletionRequest)
class AccountDeletionRequestAdmin(admin.ModelAdmin):
    list_display = ["owner", "status", "requested_at", "scheduled_for"]
    list_filter = ["status"]
    search_fields = ["owner__username", "owner__email"]
    readonly_fields = ["created_at", "updated_at"]
