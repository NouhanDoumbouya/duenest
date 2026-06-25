"""
Serializers for the integrations API.

Token fields are deliberately absent from every serializer — the encrypted token
columns (``access_token_ciphertext`` / ``refresh_token_ciphertext``) are never
exposed. Only safe account metadata is returned.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import ConnectedIntegrationAccount


class ConnectedIntegrationAccountSerializer(serializers.ModelSerializer):
    is_token_expired = serializers.BooleanField(read_only=True)
    needs_attention = serializers.BooleanField(read_only=True)

    class Meta:
        model = ConnectedIntegrationAccount
        fields = [
            "id",
            "provider",
            "provider_account_id",
            "provider_email",
            "display_name",
            "scopes",
            "scope_groups",
            "status",
            "token_expires_at",
            "last_refresh_at",
            "last_checked_at",
            "last_error_code",
            "last_error_at",
            "created_at",
            "updated_at",
            "disconnected_at",
            "is_token_expired",
            "needs_attention",
        ]
        read_only_fields = fields


class OAuthStartSerializer(serializers.Serializer):
    """Input for starting a Google OAuth connect."""

    scope_groups = serializers.ListField(
        child=serializers.CharField(max_length=40),
        required=False,
        default=list,
    )
    redirect_path = serializers.CharField(required=False, allow_blank=True, default="")
