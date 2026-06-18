"""
Tests for the document scanner upload endpoint and helpers.

Covers validation (size/MIME/empty/structure), the encrypted-storage reuse,
malware-scan fail-closed behaviour, lossless PDF compression safety, and the
best-effort OCR fallback. These run without Tesseract/ClamAV installed.
"""

from io import BytesIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from . import scanner
from .models import DocumentExtraction, DocumentFile

User = get_user_model()


def make_pdf_bytes(pages: int = 1) -> bytes:
    """A real, parseable PDF (so structure validation passes)."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def pdf_upload(name="scan.pdf", data: bytes | None = None) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name, data if data is not None else make_pdf_bytes(), content_type="application/pdf"
    )


class ScannerUploadTests(APITestCase):
    def setUp(self):
        self.url = reverse("upload_scanned_document")
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Pw!DueNest123"
        )

    def auth(self):
        self.client.force_authenticate(user=self.alice)

    def test_requires_authentication(self):
        resp = self.client.post(self.url, {"file": pdf_upload()}, format="multipart")
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_successful_pdf_upload_returns_secure_refs(self):
        self.auth()
        resp = self.client.post(self.url, {"file": pdf_upload()}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        body = resp.json()
        self.assertEqual(body["status"], "success")
        self.assertIn("document_id", body)
        self.assertIn("preview_url", body)
        self.assertIn("download_url", body)
        # Never leak a raw storage path / media URL.
        self.assertNotIn("/media/", body["download_url"])
        self.assertNotIn("file_url", body)

        instance = DocumentFile.objects.get(pk=body["document_id"])
        self.assertEqual(instance.uploaded_by, self.alice)
        self.assertIsNone(instance.document_id)  # inbox file
        self.assertEqual(
            instance.encryption_status, DocumentFile.EncryptionStatus.ENCRYPTED
        )

    def test_inbox_scan_stores_ocr_extraction_with_null_document(self):
        # Regression: a scanned inbox file has no parent document, so the OCR
        # extraction must store with document=None (not a NOT NULL violation).
        from types import SimpleNamespace

        self.auth()
        fake = SimpleNamespace(
            status="needs_review",
            raw_text="Passport No 123",
            extracted_fields={},
            confidence_score=0.4,
            provider="local_ocr",
            error_message="",
        )
        with mock.patch(
            "apps.documents.scanner.extract_ocr_text", return_value=fake
        ):
            resp = self.client.post(
                self.url, {"file": pdf_upload()}, format="multipart"
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertTrue(resp.json()["ocr_text_stored"])
        file_id = resp.json()["document_id"]
        extraction = DocumentExtraction.objects.get(file_id=file_id)
        self.assertIsNone(extraction.document_id)
        self.assertEqual(extraction.raw_text, "Passport No 123")

    def test_empty_file_rejected(self):
        self.auth()
        empty = SimpleUploadedFile("scan.pdf", b"", content_type="application/pdf")
        resp = self.client.post(self.url, {"file": empty}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", resp.json())

    def test_unsupported_mime_rejected(self):
        self.auth()
        bad = SimpleUploadedFile("x.txt", b"hello there", content_type="text/plain")
        resp = self.client.post(self.url, {"file": bad}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_non_pdf_posing_as_pdf_rejected(self):
        self.auth()
        fake = SimpleUploadedFile(
            "scan.pdf", b"not really a pdf", content_type="application/pdf"
        )
        resp = self.client.post(self.url, {"file": fake}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(SCANNER_MAX_UPLOAD_MB=1)
    def test_oversized_rejected(self):
        self.auth()
        big = make_pdf_bytes() + b"%" + b"0" * (1024 * 1024 + 1024)
        upload = SimpleUploadedFile("scan.pdf", big, content_type="application/pdf")
        resp = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    @override_settings(CLAMD_ENABLED=True, CLAMD_FAIL_CLOSED=True)
    def test_malware_scan_unavailable_fails_closed(self):
        self.auth()
        # clamd import/daemon unavailable -> fail closed -> 503, nothing stored.
        with mock.patch.dict("sys.modules", {"clamd": None}):
            resp = self.client.post(self.url, {"file": pdf_upload()}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(DocumentFile.objects.count(), 0)

    @override_settings(CLAMD_ENABLED=True, CLAMD_FAIL_CLOSED=False)
    def test_malware_scan_unavailable_fail_open_allows(self):
        self.auth()
        with mock.patch.dict("sys.modules", {"clamd": None}):
            resp = self.client.post(self.url, {"file": pdf_upload()}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

    @override_settings(CLAMD_ENABLED=True)
    def test_malware_found_blocks_and_does_not_store(self):
        self.auth()
        fake_client = mock.Mock()
        fake_client.instream.return_value = {"stream": ("FOUND", "Eicar-Test")}
        fake_clamd = mock.Mock()
        fake_clamd.ClamdUnixSocket.return_value = fake_client
        with mock.patch.dict("sys.modules", {"clamd": fake_clamd}):
            resp = self.client.post(self.url, {"file": pdf_upload()}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentFile.objects.count(), 0)


class ScannerHelperTests(APITestCase):
    def test_compress_pdf_never_corrupts(self):
        original = make_pdf_bytes(pages=2)
        out = scanner.compress_pdf(original)
        self.assertTrue(out.startswith(b"%PDF-"))
        # Output must still parse as a PDF with the same page count.
        from pypdf import PdfReader

        self.assertEqual(len(PdfReader(BytesIO(out)).pages), 2)

    def test_compress_pdf_returns_original_on_garbage(self):
        garbage = b"%PDF- definitely not a pdf body"
        self.assertEqual(scanner.compress_pdf(garbage), garbage)

    def test_validate_pdf_structure_rejects_non_pdf(self):
        with self.assertRaises(scanner.ScanValidationError):
            scanner.validate_pdf_structure(b"nope")

    def test_extract_ocr_text_is_best_effort(self):
        # No Tesseract in CI: a blank PDF yields no text -> None, never raises.
        result = scanner.extract_ocr_text(make_pdf_bytes(), "application/pdf")
        self.assertTrue(result is None or hasattr(result, "raw_text"))

    def test_safe_filename_strips_paths_and_fixes_extension(self):
        name = scanner._safe_filename("../../etc/passwd", "application/pdf")
        self.assertTrue(name.endswith(".pdf"))
        self.assertNotIn("/", name)
        self.assertNotIn("..", name)
