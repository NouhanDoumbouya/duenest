from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
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

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class GoogleAuthSerializer(serializers.Serializer):
    """
    Validates the request body for the Google sign-in endpoint.

    The frontend only sends the Google ID token; everything else is derived
    from the verified token on the server, so this serializer is intentionally
    just a single required field.
    """

    id_token = serializers.CharField(write_only=True, trim_whitespace=True)


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
