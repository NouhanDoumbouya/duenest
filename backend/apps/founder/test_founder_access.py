"""
SEC-009 regression tests: founder console is no longer granted to every staff
account by default — production requires the FOUNDER_EMAILS allowlist (or
superuser). Sensitive founder actions are audited.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .permissions import is_founder

User = get_user_model()
DASH = "/api/v1/founder/dashboard/"


def _user(username, **kw):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com",
        password="StrongPassword123!DN", **kw,
    )


@override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=["boss@duenest.com"])
class FounderAccessTests(APITestCase):
    def test_normal_user_blocked(self):
        self.client.force_authenticate(_user("normal"))
        self.assertEqual(self.client.get(DASH).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_without_allowlist_blocked(self):
        staff = _user("staffer", is_staff=True)
        self.assertFalse(is_founder(staff))
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(DASH).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_on_allowlist_allowed(self):
        boss = User.objects.create_user(
            username="boss", email="boss@duenest.com",
            password="StrongPassword123!DN", is_staff=True,
        )
        self.assertTrue(is_founder(boss))
        self.client.force_authenticate(boss)
        self.assertEqual(self.client.get(DASH).status_code, status.HTTP_200_OK)

    def test_superuser_always_allowed(self):
        su = _user("root", is_staff=True, is_superuser=True)
        self.assertTrue(is_founder(su))
        self.client.force_authenticate(su)
        self.assertEqual(self.client.get(DASH).status_code, status.HTTP_200_OK)

    def test_anonymous_blocked(self):
        self.assertIn(
            self.client.get(DASH).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


@override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=["boss@duenest.com"])
class FounderExportAuditTests(APITestCase):
    def test_export_blocked_for_staff_without_allowlist(self):
        staff = _user("staffer2", is_staff=True)
        self.client.force_authenticate(staff)
        resp = self.client.get("/api/v1/founder/growth/export/?type=campaigns")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_audited_for_founder(self):
        boss = User.objects.create_user(
            username="boss2", email="boss@duenest.com",
            password="StrongPassword123!DN", is_staff=True,
        )
        self.client.force_authenticate(boss)
        with self.assertLogs("duenest.founder.audit", level="INFO") as cm:
            resp = self.client.get("/api/v1/founder/growth/export/?type=campaigns")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(any("growth_export" in line for line in cm.output))
