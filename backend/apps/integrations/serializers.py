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


# ---- Google Drive Import V1 ------------------------------------------------


class DriveFileRefSerializer(serializers.Serializer):
    """A selected Drive file reference (no tokens, no URLs)."""

    provider_file_id = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    mime_type = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    size = serializers.IntegerField(required=False, allow_null=True, default=None)


class DriveDestinationSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=["file_inbox", "vault", "folder", "pack", "org_case", "org_folder", "org_pack"],
        default="file_inbox",
    )
    folder_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    pack_id = serializers.IntegerField(required=False, allow_null=True, default=None)


class DriveImportRequestSerializer(serializers.Serializer):
    account_id = serializers.IntegerField()
    files = DriveFileRefSerializer(many=True)
    destination = DriveDestinationSerializer()

    def validate_files(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one file to import.")
        return value
