from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.documents.serializers import DocumentExportRequestSerializer

from .google import GoogleAuthError, verify_google_id_token
from .serializers import (
    AccountDeletionRequestCreateSerializer,
    AccountDeletionRequestSerializer,
    GoogleAuthSerializer,
    RegisterSerializer,
    UserOnboardingStateSerializer,
    UserSerializer,
)
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
        _track_product_event(
            self.request,
            "user_signed_up",
            user=user,
            object_type="user",
            object_id=user.id,
            metadata={"method": "password"},
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
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


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
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

    def _get_or_create_user(self, claims, google_id, email, *, invite_code="", request=None):
        first_name = claims.get("given_name", "")
        last_name = claims.get("family_name", "")
        avatar_url = claims.get("picture", "")

        # 1) Already linked to this Google account -> just log them in.
        user = User.objects.filter(google_id=google_id).first()
        if user is not None:
            return user, False

        # 2) An existing password account shares this email -> link it.
        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            user.google_id = google_id
            if not user.avatar_url:
                user.avatar_url = avatar_url
            user.save(update_fields=["google_id", "avatar_url"])
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
