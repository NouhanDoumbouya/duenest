"""
SEC-013 / M-1 — CHECK_REVOKE_TOKEN binds every JWT to the user's password hash,
so changing the password (e.g. a reset after a suspected compromise) immediately
invalidates ALL previously issued tokens instead of leaving them valid until the
short access-token lifetime elapses.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()

PASSWORD = "StrongPassword123!DueNest"
NEW_PASSWORD = "EvenStronger456!DueNest"
ME = "/api/v1/users/me/"


class TokenRevocationOnPasswordChangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bob", email="bob@example.com", password=PASSWORD
        )

    def _login_access_token(self):
        resp = self.client.post(
            "/api/v1/auth/login/",
            {"username": "bob", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data["access"]

    def test_old_token_is_rejected_after_password_change(self):
        access = self._login_access_token()

        # A clean client carrying only the bearer token (no refreshed cookie).
        bearer = APIClient()
        bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(bearer.get(ME).status_code, status.HTTP_200_OK)

        # Password changes (as a reset would do).
        self.user.set_password(NEW_PASSWORD)
        self.user.save(update_fields=["password"])

        # The previously valid access token must no longer authenticate.
        self.assertEqual(bearer.get(ME).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_fresh_token_after_change_still_works(self):
        self._login_access_token()  # warm up
        self.user.set_password(NEW_PASSWORD)
        self.user.save(update_fields=["password"])

        resp = self.client.post(
            "/api/v1/auth/login/",
            {"username": "bob", "password": NEW_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        bearer = APIClient()
        bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.assertEqual(bearer.get(ME).status_code, status.HTTP_200_OK)
