from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .google import GoogleAuthError, verify_google_id_token
from .serializers import GoogleAuthSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


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

        user = self._get_or_create_user(claims, google_id, email)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

    def _get_or_create_user(self, claims, google_id, email):
        first_name = claims.get("given_name", "")
        last_name = claims.get("family_name", "")
        avatar_url = claims.get("picture", "")

        # 1) Already linked to this Google account -> just log them in.
        user = User.objects.filter(google_id=google_id).first()
        if user is not None:
            return user

        # 2) An existing password account shares this email -> link it.
        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            user.google_id = google_id
            if not user.avatar_url:
                user.avatar_url = avatar_url
            user.save(update_fields=["google_id", "avatar_url"])
            return user

        # 3) Brand new user -> create one with an unusable password, since
        #    authentication will always happen through Google for this account.
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
        return user
