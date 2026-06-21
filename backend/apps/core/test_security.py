"""
Cross-cutting security regression tests: IDOR prevention, founder-permission
enforcement, public-token-route response headers, serializer non-leakage, and
log redaction. Feature-specific blocking (revoked/expired/wrong-code/deleted)
is covered in the per-feature suites (test_emergency_public, test_share_rooms,
test_preview_sharing, quick_share.tests).
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.logging import redact
from apps.documents.models import (
    Document,
    EmergencyAccessPack,
)
from apps.documents.views import (
    PublicEmergencyPackVerifyCodeView,
    PublicSharedFileVerifyCodeView,
    PublicShareRoomVerifyCodeView,
)
from apps.features.models import FeatureFlag, Visibility
from apps.subscriptions.models import Subscription

User = get_user_model()


class IDORTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@example.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@example.com", password="StrongPassword123!DN"
        )
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.alice_sub = Subscription.objects.create(
            owner=self.alice, name="Netflix", amount="9.99", currency="USD"
        )
        self.alice_pack = EmergencyAccessPack.objects.create(
            owner=self.alice, title="Alice pack"
        )

    def test_cannot_read_another_users_document(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(f"/api/v1/documents/{self.alice_doc.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_cannot_update_or_delete_another_users_document(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/documents/{self.alice_doc.id}/", {"title": "hijack"}
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/v1/documents/{self.alice_doc.id}/"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.alice_doc.refresh_from_db()
        self.assertFalse(self.alice_doc.is_trashed)

    def test_cannot_read_another_users_subscription(self):
        # Subscription Radar is deprecated (flag off by default). Enable it so
        # this test exercises owner-scoping (404) rather than the 503 gate.
        FeatureFlag.objects.update_or_create(
            key="subscriptions", defaults={"visibility": Visibility.ENABLED}
        )
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(
                f"/api/v1/subscriptions/{self.alice_sub.id}/"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_cannot_read_another_users_emergency_pack(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(
                f"/api/v1/emergency-packs/{self.alice_pack.id}/"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_owner_list_excludes_other_users_rows(self):
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/v1/documents/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 0)


class FounderPermissionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reg", email="r@example.com", password="StrongPassword123!DN"
        )
        self.founder = User.objects.create_user(
            username="founder",
            email="f@example.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )

    def test_non_founder_blocked_from_security_overview(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/founder/security-overview/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_blocked_from_security_overview(self):
        resp = self.client.get("/api/v1/founder/security-overview/")
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_founder_allowed(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.get("/api/v1/founder/security-overview/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # The encryption summary is aggregate-only — no key material.
        body = str(resp.data)
        self.assertNotIn("wrapped_dek", body)
        self.assertNotIn("DUENEST_KEK", body)


class PublicRouteHeaderTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="o", email="o@example.com", password="StrongPassword123!DN"
        )
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner,
            title="Pack",
            status=EmergencyAccessPack.Status.ACTIVE,
            access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
            token="header-test-token",
        )

    def test_public_emergency_route_sets_protective_headers(self):
        resp = self.client.get(f"/api/v1/share/emergency-packs/{self.pack.token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp["X-Robots-Tag"], "noindex, nofollow")
        self.assertEqual(resp["Referrer-Policy"], "no-referrer")
        self.assertEqual(resp["Cache-Control"], "no-store")

    def test_public_token_error_routes_still_set_protective_headers(self):
        for path in (
            "/api/v1/share/files/not-real/",
            "/api/v1/public/rooms/not-real/",
            "/api/v1/quick-share/claim/not-real/",
        ):
            resp = self.client.get(path)
            self.assertEqual(resp["X-Robots-Tag"], "noindex, nofollow")
            self.assertEqual(resp["Referrer-Policy"], "no-referrer")
            self.assertEqual(resp["Cache-Control"], "no-store")


class PublicCodeThrottleTests(APITestCase):
    def test_public_access_code_views_use_scoped_throttles(self):
        expected = (
            (PublicSharedFileVerifyCodeView, "share_file_code"),
            (PublicEmergencyPackVerifyCodeView, "emergency_code"),
            (PublicShareRoomVerifyCodeView, "room_code"),
        )
        for view, scope in expected:
            self.assertEqual(view.throttle_scope, scope)


class SerializerLeakTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="o2", email="o2@example.com", password="StrongPassword123!DN"
        )
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner,
            title="Pack",
            status=EmergencyAccessPack.Status.ACTIVE,
            access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
            token="secret-owner-token",
            access_code_required=True,
            access_code_hash="argon-or-pbkdf2-hash-value",
        )

    def test_owner_serializer_never_returns_access_code_hash(self):
        # The owner DOES receive the shareable link (which contains the token) —
        # that is how they share it. But the access code hash must never appear.
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f"/api/v1/emergency-packs/{self.pack.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn("access_code_hash", resp.data)
        self.assertNotIn("access_code", resp.data)
        self.assertNotIn("argon-or-pbkdf2-hash-value", str(resp.data))

    def test_founder_views_do_not_leak_token_or_code(self):
        founder = User.objects.create_user(
            username="founder2",
            email="f2@example.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )
        self.client.force_authenticate(founder)
        body = str(self.client.get("/api/v1/founder/security-overview/").data)
        self.assertNotIn("secret-owner-token", body)
        self.assertNotIn("argon-or-pbkdf2-hash-value", body)


class LogRedactionTests(APITestCase):
    def test_redacts_tokens_codes_and_headers(self):
        self.assertNotIn("supersecret", redact("access_code=supersecret extra"))
        self.assertNotIn(
            "eyJhbGc", redact("Authorization: Bearer eyJhbGc.payload.sig")
        )
        self.assertIn("[REDACTED]", redact("token=abc123"))
        # Ordinary text is preserved.
        self.assertEqual(redact("user opened file 12"), "user opened file 12")
