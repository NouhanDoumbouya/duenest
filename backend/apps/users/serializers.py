from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import AccountDeletionRequest, UserOnboardingState


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "plan"]
        read_only_fields = ["id", "plan"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    invite_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=80,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
            "invite_code",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        invite_code = attrs.get("invite_code", "")
        if settings.PRIVATE_BETA_ENABLED:
            if not invite_code:
                raise serializers.ValidationError(
                    {"invite_code": "Private beta registration requires an invite code."}
                )
            try:
                from apps.founder.services import InviteCodeError, get_usable_invite_code

                get_usable_invite_code(invite_code)
            except InviteCodeError as exc:
                raise serializers.ValidationError({"invite_code": str(exc)}) from exc
        return attrs

    def create(self, validated_data):
        invite_code = validated_data.pop("invite_code", "")
        password = validated_data.pop("password")
        with transaction.atomic():
            user = User(**validated_data)
            user.set_password(password)
            user.save()
            if settings.PRIVATE_BETA_ENABLED:
                try:
                    from apps.founder.services import (
                        InviteCodeError,
                        consume_invite_code_for_signup,
                    )

                    request = self.context.get("request")
                    consume_invite_code_for_signup(
                        code=invite_code,
                        user=user,
                        email=user.email,
                        request=request,
                        metadata={"method": "password"},
                    )
                except InviteCodeError as exc:
                    raise serializers.ValidationError(
                        {"invite_code": str(exc)}
                    ) from exc
        return user


class GoogleAuthSerializer(serializers.Serializer):
    """
    Validates the request body for the Google sign-in endpoint.

    The frontend only sends the Google ID token; everything else is derived
    from the verified token on the server, so this serializer is intentionally
    just a single required field.
    """

    id_token = serializers.CharField(write_only=True, trim_whitespace=True)
    invite_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=80,
    )


class UserOnboardingStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserOnboardingState
        fields = [
            "id",
            "user",
            "has_completed_document_onboarding",
            "first_document_created_at",
            "first_file_uploaded_at",
            "first_expiry_date_added_at",
            "first_reminder_created_at",
            "first_share_link_created_at",
            "first_checklist_created_at",
            "checklist_completed_at",
            "dismissed_onboarding_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "first_document_created_at",
            "first_file_uploaded_at",
            "first_expiry_date_added_at",
            "first_reminder_created_at",
            "first_share_link_created_at",
            "first_checklist_created_at",
            "checklist_completed_at",
            "dismissed_onboarding_at",
            "created_at",
            "updated_at",
        ]

    def validate_metadata(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        return value


class AccountDeletionRequestSerializer(serializers.ModelSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        model = AccountDeletionRequest
        fields = [
            "id",
            "owner",
            "status",
            "requested_at",
            "scheduled_for",
            "cancelled_at",
            "completed_at",
            "reason",
            "metadata",
            "can_cancel",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AccountDeletionRequestCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=2000,
    )
