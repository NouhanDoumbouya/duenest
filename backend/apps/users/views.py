from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.documents.serializers import DocumentExportRequestSerializer

from .cookie_auth import (
    clear_auth_cookies,
    ensure_csrf_cookie,
    get_refresh_from_cookie,
    set_auth_cookies,
)
from .google import GoogleAuthError, verify_google_id_token
from . import account_recovery
from .serializers import (
    AccountDeletionRequestCreateSerializer,
    AccountDeletionRequestSerializer,
    EmailVerificationConfirmSerializer,
    GoogleAuthSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileDetailsSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserOnboardingStateSerializer,
    UserSerializer,
)
from .avatars import AvatarProcessingError, build_avatar_data_url
from .models import UserProfileDetails
from .services import (
    ExportGenerationError,
    build_account_data_summary,
    build_document_setup_checklist,
    build_security_summary,
    cancel_account_deletion,
    clear_document_demo_data,
    create_document_demo_data,
    get_onboarding_state,
    mark_metadata_timestamp,
    request_account_data_export,
    request_account_deletion,
    sync_onboarding_state_from_documents,
)

User = get_user_model()


def _track_product_event(
    request,
    event_type: str,
    *,
    user=None,
    object_type: str = "",
    object_id: int | str = "",
    metadata: dict | None = None,
) -> None:
    try:
        from apps.founder.services import track_product_event

        track_product_event(
            event_type=event_type,
            user=user or getattr(request, "user", None),
            request=request,
            object_type=object_type,
            object_id=object_id,
            metadata=metadata,
        )
    except Exception:
        return


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def perform_create(self, serializer):
        user = serializer.save()
        # Password signups start unverified; send a verification email (SEC-007).
        try:
            account_recovery.send_email_verification(user)
        except Exception:  # noqa: BLE001 — never block signup on email delivery
            pass
        # Capture acquisition attribution from the signup payload (UTM params the
        # SPA collected on landing). Best-effort — never breaks signup.
        utm_keys = (
            "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        )
        data = self.request.data if hasattr(self.request, "data") else {}
        attribution = {k: data.get(k) for k in utm_keys if data.get(k)}
        if data.get("referrer"):
            attribution["referrer"] = data.get("referrer")
        if data.get("landing_page"):
            attribution["landing_page"] = data.get("landing_page")
        try:
            from apps.founder.growth_modules import (
                capture_attribution,
                record_referral_signup,
            )

            capture_attribution(user, attribution)
            if data.get("referral_code"):
                record_referral_signup(user, data.get("referral_code"))
        except Exception:  # noqa: BLE001 — attribution must not block signup
            pass
        event_metadata = {"method": "password"}
        event_metadata.update({k: attribution[k] for k in utm_keys if k in attribution})
        _track_product_event(
            self.request,
            "user_signed_up",
            user=user,
            object_type="user",
            object_id=user.id,
            metadata=event_metadata,
        )


class LoginView(TokenObtainPairView):
    """SimpleJWT login with best-effort product/security event tracking."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            _track_product_event(
                request,
                "security_event_recorded",
                metadata={
                    "event_kind": "failed_login_attempt",
                    "label": "Failed login attempt",
                },
            )
            raise
        user = serializer.user
        _track_product_event(
            request,
            "user_logged_in",
            user=user,
            object_type="user",
            object_id=user.id,
            metadata={"method": "password"},
        )
        # Tokens are returned in the body (backward compatible) AND set as
        # HttpOnly cookies — the cookie path is primary for the browser SPA.
        data = serializer.validated_data
        response = Response(data, status=status.HTTP_200_OK)
        set_auth_cookies(response, access=data.get("access"), refresh=data.get("refresh"))
        ensure_csrf_cookie(request, response)
        return response


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        """Edit basic identity (name only). Email/username are intentionally not
        editable here — they're identity-sensitive and have their own flows."""
        serializer = ProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class CurrentUserAvatarView(APIView):
    """Upload (POST, multipart 'avatar') or remove (DELETE) the signed-in user's
    profile picture. The image is downscaled and re-encoded server-side and kept
    inline as a data URL (see User.avatar_image), so it never relies on a public
    storage URL. Returns the updated user payload."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get("avatar")
        if upload is None:
            return Response(
                {"detail": "No image was uploaded (field 'avatar')."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data_url = build_avatar_data_url(upload.read())
        except AvatarProcessingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        request.user.avatar_image = data_url
        request.user.save(update_fields=["avatar_image"])
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        if request.user.avatar_image:
            request.user.avatar_image = ""
            request.user.save(update_fields=["avatar_image"])
        return Response(UserSerializer(request.user).data)


class CurrentUserProfileDetailsView(APIView):
    """Owner-scoped personal details the user opts to save for pre-filling their
    own forms. Stored encrypted at rest (see UserProfileDetails); returned only
    to the owner and never shared.

    GET    returns all fields (unset ones as empty strings).
    PATCH  partially updates fields (send "" to clear one).
    DELETE clears every saved detail.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        details, _ = UserProfileDetails.objects.get_or_create(user=request.user)
        return Response(details.get_details())

    def patch(self, request):
        serializer = ProfileDetailsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        details, _ = UserProfileDetails.objects.get_or_create(user=request.user)
        merged = {**details.get_details(), **serializer.validated_data}
        details.set_details(merged)
        details.save()
        return Response(details.get_details())

    def delete(self, request):
        details = UserProfileDetails.objects.filter(user=request.user).first()
        if details and details.data_ciphertext is not None:
            details.data_ciphertext = None
            details.save(update_fields=["data_ciphertext", "updated_at"])
        return Response(
            {key: "" for key in UserProfileDetails.PROFILE_FIELDS}
        )


class CookieTokenRefreshView(TokenRefreshView):
    """
    Refresh access using the refresh-token cookie (falling back to the request
    body). Rotates tokens (SimpleJWT ROTATE_REFRESH_TOKENS + blacklist) and sets
    the new tokens as cookies. Tokens are still returned in the body for
    backward-compatible header clients.
    """

    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if not data.get("refresh"):
            cookie_refresh = get_refresh_from_cookie(request)
            if cookie_refresh:
                data["refresh"] = cookie_refresh

        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        tokens = serializer.validated_data
        response = Response(tokens, status=status.HTTP_200_OK)
        set_auth_cookies(
            response, access=tokens.get("access"), refresh=tokens.get("refresh")
        )
        ensure_csrf_cookie(request, response)
        return response


class LogoutView(APIView):
    """
    Log out: blacklist the refresh token (cookie or body) where possible and
    clear the auth cookies. Always succeeds from the client's perspective so
    logout feels immediate even if the token is already expired/invalid.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = get_refresh_from_cookie(request) or request.data.get("refresh")
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass  # already expired/blacklisted — nothing to do
        response = Response(status=status.HTTP_205_RESET_CONTENT)
        clear_auth_cookies(response)
        return response


class CsrfTokenView(APIView):
    """Set/refresh the CSRF cookie so the SPA can send X-CSRFToken on writes."""

    permission_classes = [AllowAny]

    def get(self, request):
        response = Response({"detail": "ok"})
        ensure_csrf_cookie(request, response)
        return response


# ---- Password reset / email verification (SEC-007) -------------------------

_GENERIC_RESET_MESSAGE = (
    "If an account exists for that email, we've sent password reset instructions."
)


class PasswordResetRequestView(APIView):
    """Request a password reset email. Always returns a generic success so the
    endpoint can't be used to enumerate which emails have accounts."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account_recovery.request_password_reset(serializer.validated_data["email"])
        _track_product_event(
            request,
            "security_event_recorded",
            metadata={
                "event_kind": "password_reset_requested",
                "label": "Password reset requested",
            },
        )
        return Response({"detail": _GENERIC_RESET_MESSAGE})


class PasswordResetConfirmView(APIView):
    """Confirm a password reset with a single-use, time-limited token."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = account_recovery.confirm_password_reset(
            data["uid"], data["token"], data["new_password"]
        )
        if user is None:
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Your password has been reset. You can now sign in."})


class EmailVerificationSendView(APIView):
    """Send (or resend) the current user's email verification link."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        if request.user.email_verified:
            return Response({"detail": "Your email is already verified.", "verified": True})
        account_recovery.send_email_verification(request.user)
        return Response({"detail": "Verification email sent.", "verified": False})


class EmailVerificationConfirmView(APIView):
    """Confirm an email verification token."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = account_recovery.confirm_email_verification(
            serializer.validated_data["token"]
        )
        if user is None:
            return Response(
                {"detail": "This verification link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Your email is verified.", "verified": True})


def _truthy(value):
    """Google may send email_verified as a bool or the string 'true'."""
    return value is True or str(value).lower() == "true"


def _unique_username_from_email(email):
    """
    Build a username that does not collide with an existing one.

    Google accounts have no username, so we derive a starting point from the
    email local-part and append a counter until it is free.
    """
    base = email.split("@")[0] or "user"
    username = base
    suffix = 1
    while User.objects.filter(username=username).exists():
        suffix += 1
        username = f"{base}{suffix}"
    return username


class GoogleAuthView(APIView):
    """
    POST /api/v1/auth/google/

    Exchange a verified Google ID token for DueNest Simple JWT tokens.

    This sits alongside the normal username/password login; it does not
    replace it. The flow is: verify the Google token -> find or create the
    matching local user -> issue our own access/refresh tokens.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            claims = verify_google_id_token(serializer.validated_data["id_token"])
        except GoogleAuthError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED
            )

        google_id = claims.get("sub")
        email = claims.get("email")
        invite_code = serializer.validated_data.get("invite_code", "")

        # Reject an incomplete Google payload: without these two claims we
        # cannot safely identify or create a user.
        if not google_id or not email:
            return Response(
                {"detail": "Incomplete Google account information."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reject accounts whose email Google has not verified, otherwise
        # someone could claim an email address they do not own.
        if not _truthy(claims.get("email_verified")):
            return Response(
                {"detail": "Google email is not verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user, created = self._get_or_create_user(
                claims,
                google_id,
                email,
                invite_code=invite_code,
                request=request,
            )
        except Exception as exc:
            from apps.founder.services import InviteCodeError

            if isinstance(exc, InviteCodeError):
                return Response(
                    {"invite_code": [str(exc)]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise
        if created:
            _track_product_event(
                request,
                "user_signed_up",
                user=user,
                object_type="user",
                object_id=user.id,
                metadata={"method": "google"},
            )
        _track_product_event(
            request,
            "user_logged_in",
            user=user,
            object_type="user",
            object_id=user.id,
            metadata={"method": "google"},
        )

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        refresh_str = str(refresh)
        response = Response(
            {
                "refresh": refresh_str,
                "access": access,
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access=access, refresh=refresh_str)
        ensure_csrf_cookie(request, response)
        return response

    def _get_or_create_user(self, claims, google_id, email, *, invite_code="", request=None):
        first_name = claims.get("given_name", "")
        last_name = claims.get("family_name", "")
        avatar_url = claims.get("picture", "")

        # 1) Already linked to this Google account -> just log them in.
        user = User.objects.filter(google_id=google_id).first()
        if user is not None:
            account_recovery.mark_email_verified(user)
            return user, False

        # 2) An existing password account shares this email -> link it. Google has
        #    verified this email, so the account is now email-verified (SEC-007).
        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            user.google_id = google_id
            if not user.avatar_url:
                user.avatar_url = avatar_url
            user.email_verified = True
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.save(update_fields=[
                "google_id", "avatar_url", "email_verified", "email_verified_at",
            ])
            return user, False

        # 3) Brand new user -> create one with an unusable password, since
        #    authentication will always happen through Google for this account.
        if settings.PRIVATE_BETA_ENABLED and not invite_code:
            from apps.founder.services import InviteCodeError

            raise InviteCodeError("Private beta registration requires an invite code.")

        with transaction.atomic():
            if settings.PRIVATE_BETA_ENABLED:
                from apps.founder.services import get_usable_invite_code

                get_usable_invite_code(invite_code)
            user = User(
                username=_unique_username_from_email(email),
                email=email,
                first_name=first_name,
                last_name=last_name,
                google_id=google_id,
                avatar_url=avatar_url,
                email_verified=True,
                email_verified_at=timezone.now(),
            )
            user.set_unusable_password()
            user.save()
            if settings.PRIVATE_BETA_ENABLED:
                from apps.founder.services import consume_invite_code_for_signup

                consume_invite_code_for_signup(
                    code=invite_code,
                    user=user,
                    email=email,
                    request=request,
                    metadata={"method": "google"},
                )
        return user, True


class OnboardingStateView(APIView):
    """GET/PATCH the authenticated user's onboarding state."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        state = sync_onboarding_state_from_documents(request.user)
        return Response(UserOnboardingStateSerializer(state).data)

    def patch(self, request):
        state = sync_onboarding_state_from_documents(request.user)
        serializer = UserOnboardingStateSerializer(
            state,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class OnboardingCompleteView(APIView):
    """Mark the document onboarding flow as completed."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        state = get_onboarding_state(request.user)
        metadata = dict(state.metadata or {})
        metadata["document_onboarding_completed_at"] = timezone.now().isoformat()
        state.has_completed_document_onboarding = True
        state.metadata = metadata
        state.save(
            update_fields=[
                "has_completed_document_onboarding",
                "metadata",
                "updated_at",
            ]
        )
        _track_product_event(
            request,
            "onboarding_completed",
            object_type="onboarding_state",
            object_id=state.id,
        )
        return Response(UserOnboardingStateSerializer(state).data)


class OnboardingDismissView(APIView):
    """Dismiss the onboarding card/wizard without marking setup complete."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        state = get_onboarding_state(request.user)
        state.dismissed_onboarding_at = timezone.now()
        state.save(update_fields=["dismissed_onboarding_at", "updated_at"])
        return Response(UserOnboardingStateSerializer(state).data)


class DocumentSetupChecklistView(APIView):
    """Computed guided document setup checklist for the signed-in user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_document_setup_checklist(request.user))


class OnboardingAttentionReviewedView(APIView):
    """Record that the user reviewed the Attention Needed view."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        state = mark_metadata_timestamp(request.user, "attention_reviewed_at")
        _track_product_event(
            request,
            "attention_needed_viewed",
            object_type="onboarding_state",
            object_id=state.id,
            metadata={"source": "onboarding_attention_reviewed"},
        )
        return Response(UserOnboardingStateSerializer(state).data)


class OnboardingTrustReviewedView(APIView):
    """Record that the user reviewed the Trust Center."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        state = mark_metadata_timestamp(request.user, "trust_center_reviewed_at")
        return Response(UserOnboardingStateSerializer(state).data)


class DemoDocumentDataCreateView(APIView):
    """Create labeled, owner-scoped fake document module data."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            create_document_demo_data(request.user),
            status=status.HTTP_201_CREATED,
        )


class DemoDocumentDataClearView(APIView):
    """Clear only the caller's labeled demo document module data."""

    permission_classes = [IsAuthenticated]

    def delete(self, request):
        return Response(clear_document_demo_data(request.user))


class TrustSecuritySummaryView(APIView):
    """Safe security capability summary for the signed-in user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_security_summary())


class AccountDataSummaryView(APIView):
    """Owner-scoped account data counts and request status."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_account_data_summary(request.user))


class AccountRequestDataExportView(APIView):
    """Request a secret-free structured data export."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            export = request_account_data_export(request.user)
        except ExportGenerationError:
            return Response(
                {"detail": "Export generation failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_export",
            object_id=export.id,
            metadata={"export_type": export.export_type},
        )
        return Response(
            DocumentExportRequestSerializer(
                export,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AccountRequestDeletionView(APIView):
    """Create or return the active account deletion request."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AccountDeletionRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deletion, created = request_account_deletion(
            request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        if created:
            _track_product_event(
                request,
                "account_deletion_requested",
                object_type="account_deletion_request",
                object_id=deletion.id,
            )
        return Response(
            AccountDeletionRequestSerializer(deletion).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AccountCancelDeletionView(APIView):
    """Cancel a pending account deletion request."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        deletion = cancel_account_deletion(request.user)
        if deletion is None:
            return Response(
                {"detail": "No pending deletion request is available to cancel."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AccountDeletionRequestSerializer(deletion).data)
