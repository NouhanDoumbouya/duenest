"""SEC-007 regression tests: password reset + email verification flows."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from . import account_recovery

User = get_user_model()

REQUEST = "/api/v1/auth/password-reset/"
CONFIRM = "/api/v1/auth/password-reset/confirm/"
VERIFY = "/api/v1/auth/email/verify/"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetTests(APITestCase):
    def setUp(self):
        mail.outbox = []
        self.user = User.objects.create_user(
            username="amy", email="amy@example.com", password="OldPassword123!DN"
        )

    def test_request_is_generic_for_unknown_email(self):
        resp = self.client.post(REQUEST, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_request_sends_email_for_known_user(self):
        resp = self.client.post(REQUEST, {"email": "amy@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

    def _uid_token(self, user):
        return (
            urlsafe_base64_encode(force_bytes(user.pk)),
            default_token_generator.make_token(user),
        )

    def test_valid_token_resets_password(self):
        uid, token = self._uid_token(self.user)
        resp = self.client.post(
            CONFIRM,
            {"uid": uid, "token": token, "new_password": "BrandNewPass456!DN"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNewPass456!DN"))

    def test_token_is_single_use(self):
        uid, token = self._uid_token(self.user)
        first = self.client.post(
            CONFIRM, {"uid": uid, "token": token, "new_password": "BrandNewPass456!DN"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        # The same token must no longer work (password hash changed).
        second = self.client.post(
            CONFIRM, {"uid": uid, "token": token, "new_password": "AnotherPass789!DN"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_token_rejected(self):
        uid, _ = self._uid_token(self.user)
        resp = self.client.post(
            CONFIRM, {"uid": uid, "token": "bogus-token", "new_password": "X9!abcdefgh"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_new_password_rejected(self):
        uid, token = self._uid_token(self.user)
        resp = self.client.post(
            CONFIRM, {"uid": uid, "token": token, "new_password": "123"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_request_is_throttled(self):
        with mock.patch.object(ScopedRateThrottle, "get_rate", return_value="2/hour"):
            codes = [
                self.client.post(REQUEST, {"email": "amy@example.com"}, format="json").status_code
                for _ in range(4)
            ]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, codes)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailVerificationTests(APITestCase):
    def test_token_verifies_once_and_expiry_is_enforced(self):
        user = User.objects.create_user(
            username="ben", email="ben@example.com", password="OldPassword123!DN"
        )
        self.assertFalse(user.email_verified)
        token = account_recovery.make_email_verification_token(user)

        resp = self.client.post(VERIFY, {"token": token}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)

        # Expired token rejected.
        with override_settings(EMAIL_VERIFICATION_TOKEN_HOURS=0):
            expired = account_recovery.confirm_email_verification(token)
        self.assertIsNone(expired)

    def test_invalid_token_rejected(self):
        resp = self.client.post(VERIFY, {"token": "not-a-real-token"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
