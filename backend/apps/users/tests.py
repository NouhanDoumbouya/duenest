from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.founder.models import InviteCode, InviteCodeUse


User = get_user_model()


class AuthenticationAPITests(APITestCase):
    def test_user_can_register(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "testuser",
                "email": "testuser@example.com",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "testuser")
        self.assertEqual(response.data["email"], "testuser@example.com")
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.filter(username="testuser").exists())

    def test_registered_user_password_is_hashed(self):
        self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "secureuser",
                "email": "secureuser@example.com",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        user = User.objects.get(username="secureuser")

        self.assertNotEqual(user.password, "StrongPassword123!DueNest")
        self.assertTrue(user.check_password("StrongPassword123!DueNest"))

    def test_user_can_login_and_receive_tokens(self):
        User.objects.create_user(
            username="loginuser",
            email="loginuser@example.com",
            password="StrongPassword123!DueNest",
        )

        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "loginuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_user_can_refresh_access_token(self):
        User.objects.create_user(
            username="refreshuser",
            email="refreshuser@example.com",
            password="StrongPassword123!DueNest",
        )

        login_response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "refreshuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        refresh_token = login_response.data["refresh"]

        refresh_response = self.client.post(
            "/api/v1/auth/refresh/",
            {
                "refresh": refresh_token,
            },
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)

    def test_authenticated_user_can_access_current_user_endpoint(self):
        user = User.objects.create_user(
            username="currentuser",
            email="currentuser@example.com",
            password="StrongPassword123!DueNest",
        )

        login_response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "currentuser",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get("/api/v1/users/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], user.username)
        self.assertEqual(response.data["email"], user.email)

    def test_anonymous_user_cannot_access_current_user_endpoint(self):
        response = self.client.get("/api/v1/users/me/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(PRIVATE_BETA_ENABLED=True)
    def test_private_beta_registration_requires_invite_code(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "blockeduser",
                "email": "blocked@example.com",
                "password": "StrongPassword123!DueNest",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invite_code", response.data)
        self.assertFalse(User.objects.filter(username="blockeduser").exists())

    @override_settings(PRIVATE_BETA_ENABLED=True)
    def test_private_beta_registration_consumes_valid_invite_code(self):
        invite = InviteCode.objects.create(
            code="DN-VALID-12345",
            label="Beta cohort",
            max_uses=2,
        )

        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "inviteduser",
                "email": "invited@example.com",
                "password": "StrongPassword123!DueNest",
                "invite_code": "dn-valid-12345",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        invite.refresh_from_db()
        self.assertEqual(invite.used_count, 1)
        self.assertEqual(InviteCodeUse.objects.get().email, "invited@example.com")

    @override_settings(PRIVATE_BETA_ENABLED=True)
    def test_private_beta_registration_rejects_expired_invite_code(self):
        InviteCode.objects.create(
            code="DN-EXPIRED-1",
            label="Expired",
            expires_at=timezone.now() - timedelta(days=1),
        )

        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "expireduser",
                "email": "expired@example.com",
                "password": "StrongPassword123!DueNest",
                "invite_code": "DN-EXPIRED-1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username="expireduser").exists())


# Where verify_google_id_token is *used* (the views module), so patching here
# replaces the real Google call without ever needing a network request.
GOOGLE_VERIFY = "apps.users.views.verify_google_id_token"


def google_claims(**overrides):
    """A realistic, verified Google ID-token payload for tests."""
    claims = {
        "sub": "google-sub-1234567890",
        "email": "googleuser@gmail.com",
        "email_verified": True,
        "given_name": "Google",
        "family_name": "User",
        "picture": "https://example.com/avatar.png",
        "iss": "https://accounts.google.com",
    }
    claims.update(overrides)
    return claims


class GoogleAuthAPITests(APITestCase):
    url = "/api/v1/auth/google/"

    @patch(GOOGLE_VERIFY)
    def test_google_login_creates_new_user(self, mock_verify):
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The fake token is forwarded to verification exactly once.
        mock_verify.assert_called_once_with("fake-token")

        user = User.objects.get(email="googleuser@gmail.com")
        self.assertEqual(user.google_id, "google-sub-1234567890")
        self.assertEqual(user.first_name, "Google")
        self.assertEqual(user.last_name, "User")
        self.assertEqual(user.avatar_url, "https://example.com/avatar.png")
        # Google-only accounts cannot log in with a password.
        self.assertFalse(user.has_usable_password())
        self.assertEqual(response.data["user"]["email"], "googleuser@gmail.com")

    @patch(GOOGLE_VERIFY)
    def test_google_login_links_existing_email_user(self, mock_verify):
        existing = User.objects.create_user(
            username="existing",
            email="googleuser@gmail.com",
            password="StrongPassword123!DueNest",
        )
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # No duplicate user was created; the existing one was linked instead.
        self.assertEqual(User.objects.filter(email="googleuser@gmail.com").count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.google_id, "google-sub-1234567890")
        self.assertEqual(response.data["user"]["id"], existing.id)
        # The original password login still works after linking.
        self.assertTrue(existing.check_password("StrongPassword123!DueNest"))

    @patch(GOOGLE_VERIFY)
    def test_google_login_rejects_unverified_email(self, mock_verify):
        mock_verify.return_value = google_claims(email_verified=False)

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="googleuser@gmail.com").exists())

    @patch(GOOGLE_VERIFY)
    def test_google_login_rejects_incomplete_payload(self, mock_verify):
        # Missing both "sub" and "email".
        mock_verify.return_value = {"email_verified": True}

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 0)

    @patch(GOOGLE_VERIFY)
    def test_google_login_returns_access_and_refresh_tokens(self, mock_verify):
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertTrue(response.data["access"])
        self.assertTrue(response.data["refresh"])

    def test_google_login_requires_id_token(self):
        # No verification mock needed: serializer validation fails first.
        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(PRIVATE_BETA_ENABLED=True)
    @patch(GOOGLE_VERIFY)
    def test_private_beta_google_signup_requires_invite_for_new_user(self, mock_verify):
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="googleuser@gmail.com").exists())

    @override_settings(PRIVATE_BETA_ENABLED=True)
    @patch(GOOGLE_VERIFY)
    def test_private_beta_google_signup_consumes_invite(self, mock_verify):
        InviteCode.objects.create(code="DN-GOOGLE-1", label="Google invite")
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url,
            {"id_token": "fake-token", "invite_code": "dn-google-1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(InviteCodeUse.objects.get().email, "googleuser@gmail.com")

    @override_settings(PRIVATE_BETA_ENABLED=True)
    @patch(GOOGLE_VERIFY)
    def test_private_beta_google_login_existing_user_does_not_require_invite(
        self,
        mock_verify,
    ):
        existing = User.objects.create_user(
            username="existinggoogle",
            email="googleuser@gmail.com",
            password="StrongPassword123!DueNest",
        )
        mock_verify.return_value = google_claims()

        response = self.client.post(
            self.url, {"id_token": "fake-token"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["id"], existing.id)
        self.assertEqual(InviteCodeUse.objects.count(), 0)
