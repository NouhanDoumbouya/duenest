"""
Tests for cookie-based JWT auth: login/refresh/logout cookie handling, cookie
authentication on protected endpoints, CSRF enforcement on the cookie path, and
secure-flag configuration.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()

ACCESS = "duenest_access"
REFRESH = "duenest_refresh"
CSRF = "duenest_csrftoken"
PASSWORD = "StrongPassword123!DueNest"


class CookieAuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com", password=PASSWORD
        )

    def login(self):
        return self.client.post(
            "/api/v1/auth/login/",
            {"username": "alice", "password": PASSWORD},
            format="json",
        )

    def test_login_sets_httponly_auth_cookies_and_csrf_cookie(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Body still carries tokens (backward compatible).
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        # Cookies are set and HttpOnly for the tokens.
        self.assertIn(ACCESS, response.cookies)
        self.assertIn(REFRESH, response.cookies)
        self.assertTrue(response.cookies[ACCESS]["httponly"])
        self.assertTrue(response.cookies[REFRESH]["httponly"])
        # CSRF cookie is present and readable by JS (not HttpOnly).
        self.assertIn(CSRF, response.cookies)
        self.assertFalse(response.cookies[CSRF]["httponly"])

    def test_protected_endpoint_works_with_cookie_only(self):
        self.login()  # client now holds the cookies
        # No Authorization header — authenticate via the access cookie (GET=safe).
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "alice@example.com")

    def test_protected_endpoint_fails_without_any_auth(self):
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cookie_unsafe_request_requires_csrf(self):
        # A CSRF-enforcing client mimics a real browser (the default DRF test
        # client bypasses CSRF, which would hide this behaviour).
        client = APIClient(enforce_csrf_checks=True)
        client.post(
            "/api/v1/auth/login/",
            {"username": "alice", "password": PASSWORD},
            format="json",
        )
        # Unsafe POST via cookie WITHOUT the CSRF header → rejected.
        denied = client.post("/api/v1/onboarding/dismiss/", {}, format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        # With the CSRF header echoing the cookie → allowed.
        token = client.cookies[CSRF].value
        ok = client.post(
            "/api/v1/onboarding/dismiss/", {}, format="json", HTTP_X_CSRFTOKEN=token
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_header_auth_still_works_without_csrf(self):
        # Backward-compatible Bearer path is not subject to CSRF.
        access = self.login().data["access"]
        self.client.cookies.clear()  # drop cookies so only the header is used
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post("/api/v1/onboarding/dismiss/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_refresh_uses_cookie_and_rotates(self):
        self.login()
        # No body — refresh token comes from the cookie.
        response = self.client.post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn(ACCESS, response.cookies)
        # Rotation issues a new refresh cookie too.
        self.assertIn(REFRESH, response.cookies)

    def test_logout_clears_cookies_and_blacklists_refresh(self):
        login = self.login()
        original_refresh = login.data["refresh"]
        logout = self.client.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(logout.status_code, status.HTTP_205_RESET_CONTENT)
        # Cookies are cleared (expired).
        self.assertEqual(logout.cookies[ACCESS].value, "")
        self.assertEqual(logout.cookies[REFRESH].value, "")
        # The blacklisted refresh token can no longer be used.
        self.client.cookies.clear()
        reuse = self.client.post(
            "/api/v1/auth/refresh/", {"refresh": original_refresh}, format="json"
        )
        self.assertEqual(reuse.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(AUTH_COOKIE_SECURE=True)
    def test_secure_flag_is_set_when_configured(self):
        response = self.login()
        self.assertTrue(response.cookies[ACCESS]["secure"])
        self.assertTrue(response.cookies[REFRESH]["secure"])
