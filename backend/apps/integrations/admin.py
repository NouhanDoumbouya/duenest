"""
Admin registration.

Encrypted token columns are NEVER shown or editable in admin — they are excluded
from the form and not part of any display. Admin is read-mostly here.
"""

from __future__ import annotations

from django.contrib import admin

from .models import ConnectedIntegrationAccount, IntegrationOAuthState

# Token ciphertext columns must never surface in admin.
_HIDDEN_TOKEN_FIELDS = ("access_token_ciphertext", "refresh_token_ciphertext")


@admin.register(ConnectedIntegrationAccount)
class ConnectedIntegrationAccountAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user", "provider", "provider_email", "status",
        "token_expires_at", "created_at",
    )
    list_filter = ("provider", "status")
    search_fields = ("provider_email", "provider_account_id", "display_name")
    exclude = _HIDDEN_TOKEN_FIELDS
    readonly_fields = (
        "user", "organization", "provider", "provider_account_id", "provider_email",
        "display_name", "scopes", "scope_groups", "status", "token_expires_at",
        "last_refresh_at", "last_checked_at", "last_error_code", "last_error_at",
        "created_at", "updated_at", "disconnected_at",
    )

    def has_add_permission(self, request):
        return False


@admin.register(IntegrationOAuthState)
class IntegrationOAuthStateAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "provider", "expires_at", "consumed_at", "created_at")
    list_filter = ("provider",)
    readonly_fields = (
        "user", "organization", "provider", "state_hash", "redirect_path",
        "scopes", "scope_groups", "expires_at", "consumed_at", "created_at",
    )

    def has_add_permission(self, request):
        return False
