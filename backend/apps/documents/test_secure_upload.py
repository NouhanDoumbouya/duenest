"""
SEC-005 regression tests: server-side content validation + malware scanning on
the primary vault upload (via the shared secure-upload service).
"""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.security import file_validation
from .constants import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-secupload-test-")

INBOX_URL = "/api/v1/files/"


def _validate(uploaded, scan=True):
    return file_validation.validate_secure_upload(
        uploaded,
        allowed_content_types=ALLOWED_CONTENT_TYPES,
        allowed_extensions=ALLOWED_EXTENSIONS,
        max_bytes=MAX_FILE_SIZE,
        scan=scan,
    )


class FileValidationServiceTests(APITestCase):
    def test_valid_pdf_accepted_and_type_trusted(self):
        f = SimpleUploadedFile("a.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        self.assertEqual(_validate(f), "application/pdf")

    def test_valid_png_accepted(self):
        f = SimpleUploadedFile(
            "a.png", b"\x89PNG\r\n\x1a\n....", content_type="image/png"
        )
        self.assertEqual(_validate(f), "image/png")

    def test_html_disguised_as_png_rejected(self):
        # Declares image/png + .png extension but the bytes are HTML.
        evil = SimpleUploadedFile(
            "x.png", b"<html><script>alert(1)</script></html>",
            content_type="image/png",
        )
        with self.assertRaises(file_validation.SecureUploadError):
            _validate(evil)

    def test_pdf_bytes_with_png_extension_rejected(self):
        f = SimpleUploadedFile("x.png", b"%PDF-1.4 hi", content_type="image/png")
        with self.assertRaises(file_validation.SecureUploadError):
            _validate(f)

    def test_disallowed_extension_rejected(self):
        f = SimpleUploadedFile("x.exe", b"MZ......", content_type="application/pdf")
        with self.assertRaises(file_validation.SecureUploadError):
            _validate(f)

    def test_oversized_rejected(self):
        big = SimpleUploadedFile(
            "big.pdf", b"%PDF-" + b"0" * (MAX_FILE_SIZE + 1),
            content_type="application/pdf",
        )
        with self.assertRaises(file_validation.SecureUploadError) as ctx:
            _validate(big)
        self.assertEqual(ctx.exception.status_code, 413)

    @override_settings(CLAMD_ENABLED=True, CLAMD_FAIL_CLOSED=True)
    def test_malware_scan_required_but_unavailable_fails_closed(self):
        # clamd is not installed/running locally -> engine error -> 503.
        f = SimpleUploadedFile("a.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        with self.assertRaises(file_validation.MalwareScanUnavailable) as ctx:
            _validate(f, scan=True)
        self.assertEqual(ctx.exception.status_code, 503)

    @override_settings(CLAMD_ENABLED=False)
    def test_scan_disabled_is_noop(self):
        f = SimpleUploadedFile("a.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        self.assertEqual(_validate(f, scan=True), "application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA, CLAMD_ENABLED=False)
class VaultUploadValidationTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@example.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)

    def test_inbox_upload_accepts_valid_pdf(self):
        f = SimpleUploadedFile("ok.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(INBOX_URL, {"file": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_inbox_upload_rejects_content_extension_mismatch(self):
        evil = SimpleUploadedFile(
            "x.png", b"<html>nope</html>", content_type="image/png"
        )
        resp = self.client.post(INBOX_URL, {"file": evil}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(CLAMD_ENABLED=True, CLAMD_FAIL_CLOSED=True)
    def test_inbox_upload_fails_closed_when_scanner_unavailable(self):
        f = SimpleUploadedFile("ok.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(INBOX_URL, {"file": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
