"""
SEC-001 regression tests: per-resource access-code lockout on public routes.

Verifies that a brute-force attacker who holds a valid share/emergency/room link
but not the access code is locked out after a configurable number of wrong
attempts — through the metadata/preview/download routes, not only the dedicated
verify endpoint — and that a correct code resets the counter. Also checks that
generated codes are strong and weak owner-supplied codes are rejected.
"""

import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.security import public_access
from .models import Document, DocumentFile, DocumentFileShareLink

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-lockout-test-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


def public_meta(t):
    return f"/api/v1/share/files/{t}/"


def public_preview(t):
    return f"/api/v1/share/files/{t}/preview/"


@override_settings(
    MEDIA_ROOT=_TEMP_MEDIA,
    PUBLIC_ACCESS_CODE_MAX_ATTEMPTS=3,
    PUBLIC_ACCESS_CODE_LOCKOUT_MINUTES=15,
    PUBLIC_ACCESS_CODE_BACKOFF_ENABLED=True,
)
class PublicAccessLockoutTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.owner, title="Doc")
        self.file = DocumentFile.objects.create(
            document=self.doc,
            uploaded_by=self.owner,
            file=make_pdf(),
            original_filename="passport.pdf",
            content_type="application/pdf",
            file_size=10,
        )
        self.link = DocumentFileShareLink.objects.create(
            file=self.file,
            document=self.doc,
            owner=self.owner,
            permission=DocumentFileShareLink.Permission.VIEW_ONLY,
            expires_at=timezone.now() + timedelta(days=7),
            access_code_required=True,
            access_code_hash=make_password("CORRECTHORSE"),
        )

    def tearDown(self):
        cache.clear()

    # ---- lockout via the non-verify (preview) route ----------------------

    def test_wrong_code_on_preview_locks_after_max_attempts(self):
        url = public_preview(self.link.token)
        for _ in range(2):
            resp = self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(resp.data["state"], "wrong_code")
        # 3rd wrong attempt trips the lockout.
        locked = self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
        self.assertEqual(locked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(locked.data["state"], "locked")

    def test_lockout_blocks_even_correct_code(self):
        url = public_preview(self.link.token)
        for _ in range(3):
            self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
        # Even the *correct* code is blocked while the resource is locked.
        resp = self.client.get(url, HTTP_X_ACCESS_CODE="CORRECTHORSE")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_metadata_route_shares_the_same_lockout(self):
        # Burn attempts on preview, then confirm metadata is also locked.
        for _ in range(3):
            self.client.get(
                public_preview(self.link.token), HTTP_X_ACCESS_CODE="NOPE12345"
            )
        meta = self.client.get(
            public_meta(self.link.token), HTTP_X_ACCESS_CODE="CORRECTHORSE"
        )
        self.assertEqual(meta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_correct_code_resets_failures(self):
        url = public_preview(self.link.token)
        self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
        self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
        # A correct code resets the counter…
        ok = self.client.get(url, HTTP_X_ACCESS_CODE="CORRECTHORSE")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        ok.close() if getattr(ok, "streaming", False) else None
        # …so two more wrong attempts do not lock (counter started over).
        r = self.client.get(url, HTTP_X_ACCESS_CODE="WRONGCODE1")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_revoked_link_blocked_even_with_correct_code(self):
        self.link.revoked_at = timezone.now()
        self.link.save(update_fields=["revoked_at"])
        resp = self.client.get(
            public_preview(self.link.token), HTTP_X_ACCESS_CODE="CORRECTHORSE"
        )
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_expired_link_blocked_even_with_correct_code(self):
        self.link.expires_at = timezone.now() - timedelta(hours=1)
        self.link.save(update_fields=["expires_at"])
        resp = self.client.get(
            public_preview(self.link.token), HTTP_X_ACCESS_CODE="CORRECTHORSE"
        )
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)


class AccessCodeHelperTests(APITestCase):
    def test_generated_code_is_strong(self):
        code = public_access.generate_strong_access_code()
        self.assertGreaterEqual(len(code), 8)
        self.assertFalse(code.isdigit())
        # Ambiguity-safe alphabet excludes 0/O/1/I/L.
        self.assertFalse(set(code) & set("01OIL"))

    def test_weak_owner_codes_rejected(self):
        for weak in ("123456", "000000", "aaaaaa", "12345"):
            ok, _ = public_access.validate_access_code_strength(weak)
            self.assertFalse(ok, f"expected {weak!r} to be rejected")

    def test_reasonable_owner_code_accepted(self):
        ok, _ = public_access.validate_access_code_strength("Tr4vel-2026")
        self.assertTrue(ok)

    @override_settings(PUBLIC_ACCESS_CODE_MAX_ATTEMPTS=2)
    def test_legacy_hashed_code_still_verifies(self):
        cache.clear()
        # A legacy 6-digit code stored as a hash must keep working on verify.
        result = public_access.check_public_access_code(
            kind="share",
            identifier="legacy-token-xyz",
            supplied_code="482913",
            access_code_hash=make_password("482913"),
            required=True,
        )
        self.assertTrue(result.ok)
        cache.clear()
