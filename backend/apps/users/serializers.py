from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import AccountDeletionRequest, UserOnboardingState


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    # Effective avatar to display: an uploaded picture wins, then the Google
    # picture, else empty (the client renders a default human avatar). Uploaded
    # avatars are returned inline as a data URL (see User.avatar_image).
    profile_image_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "plan",
            "email_verified", "profile_image_url",
        ]
        read_only_fields = ["id", "plan", "email_verified", "profile_image_url"]

    def get_profile_image_url(self, obj) -> str:
        return obj.avatar_image or obj.avatar_url or ""


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Editable identity fields for the profile page. Deliberately excludes
    email/username (identity-sensitive) and everything read-only."""

    class Meta:
        model = User
        fields = ["first_name", "last_name"]


class ProfileDetailsSerializer(serializers.Serializer):
    """Validates the optional personal details a user saves for pre-filling their
    own forms. Not model-bound — values are persisted encrypted in
    ``UserProfileDetails`` (a single ciphertext blob). Every field is optional."""

    legal_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    preferred_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    date_of_birth = serializers.CharField(required=False, allow_blank=True, max_length=32)
    nationality = serializers.CharField(required=False, allow_blank=True, max_length=120)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=40)
    address_street = serializers.CharField(required=False, allow_blank=True, max_length=200)
    address_city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    address_region = serializers.CharField(required=False, allow_blank=True, max_length=120)
    address_postal_code = serializers.CharField(required=False, allow_blank=True, max_length=32)
    address_country = serializers.CharField(required=False, allow_blank=True, max_length=120)
    passport_number = serializers.CharField(required=False, allow_blank=True, max_length=64)
    national_id = serializers.CharField(required=False, allow_blank=True, max_length=64)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class EmailVerificationConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()


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


# ---- Smart Profile V1 serializers ------------------------------------------

from .models import (  # noqa: E402  (grouped with the Smart Profile section)
    SmartProfile,
    SmartProfileAchievement,
    SmartProfileCommonAnswer,
    SmartProfileEducation,
    SmartProfileSkill,
    SmartProfileWork,
)


class SmartProfileExtrasSerializer(serializers.ModelSerializer):
    """The reusable scalar extras on SmartProfile (identity/document numbers live
    in the encrypted UserProfileDetails and are edited via its own endpoint)."""

    class Meta:
        model = SmartProfile
        fields = [
            "email_for_applications",
            "country_of_residence",
            "current_address",
            "permanent_address",
            "passport_expiry_date",
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone",
        ]


class _OwnerScopedEntrySerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)


class SmartProfileEducationSerializer(_OwnerScopedEntrySerializer):
    class Meta:
        model = SmartProfileEducation
        fields = [
            "id", "owner", "institution_name", "degree_or_program",
            "field_of_study", "start_date", "end_date", "currently_studying",
            "grade_or_cgpa", "country", "description", "sort_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


class SmartProfileWorkSerializer(_OwnerScopedEntrySerializer):
    class Meta:
        model = SmartProfileWork
        fields = [
            "id", "owner", "organization_name", "role_title", "start_date",
            "end_date", "currently_working", "location", "description",
            "achievements", "sort_order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


class SmartProfileSkillSerializer(_OwnerScopedEntrySerializer):
    class Meta:
        model = SmartProfileSkill
        fields = [
            "id", "owner", "name", "category", "proficiency", "sort_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


class SmartProfileAchievementSerializer(_OwnerScopedEntrySerializer):
    class Meta:
        model = SmartProfileAchievement
        fields = [
            "id", "owner", "title", "category", "date", "description",
            "related_document", "sort_order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def validate_related_document(self, value):
        # A document may only be linked if it belongs to the requesting user.
        request = self.context.get("request")
        if value is not None and request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Document not found.")
        return value


class SmartProfileCommonAnswerSerializer(_OwnerScopedEntrySerializer):
    class Meta:
        model = SmartProfileCommonAnswer
        fields = [
            "id", "owner", "prompt", "answer", "category", "sort_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]
