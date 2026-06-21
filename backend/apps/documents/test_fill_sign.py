"""Tests for Fill & Sign + Signature Audit Trail (real PDF overlay, no mocks)."""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.file_encryption import (
    encrypt_bytes_into_record,
    read_plaintext,
    sha256_hex,
)
from apps.documents.models import (
    Document,
    DocumentFile,
    DocumentSignatureRecord,
    PreparedDocument,
)

User = get_user_model()

_MEDIA = tempfile.mkdtemp(prefix="duenest-fillsign-")


def _real_pdf(text="Original document") -> bytes:
    """A genuinely parseable one-page PDF (pypdf can read its pages)."""
    from fpdf import FPDF

    pdf = FPDF(unit="pt", format=(300, 400))
    pdf.set_auto_page_break(False)
    pdf.add_page()
    pdf.set_font("Helvetica", size=14)
    pdf.text(40, 60, text)
    return bytes(pdf.output())


def _make_file(user, *, document=None, data, name="form.pdf", ct="application/pdf"):
    instance = DocumentFile(
        document=document,
        uploaded_by=user,
        original_filename=name,
        content_type=ct,
        file_size=len(data),
        checksum=sha256_hex(data),
    )
    encrypt_bytes_into_record(instance, data, name)
    instance.save()
    return instance


@override_settings(MEDIA_ROOT=_MEDIA)
class FillSignTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@example.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.alice, title="Application form")
        self.original_bytes = _real_pdf()
        self.file = _make_file(self.alice, document=self.doc, data=self.original_bytes)

    def _url(self, file_id):
        return f"/api/v1/files/{file_id}/fill-sign/"

    def test_prepare_signed_copy_creates_encrypted_prepared_file(self):
        self.client.force_authenticate(self.alice)
        payload = {
            "annotations": [
                {"page": 0, "x": 0.1, "y": 0.1, "type": "text", "value": "John Doe"},
                {"page": 0, "x": 0.6, "y": 0.5, "type": "check"},
            ],
            "signer_name": "John Doe",
            "signature_method": "typed",
        }
        res = self.client.post(self._url(self.file.id), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)
        body = res.json()

        # A new prepared file, distinct from the original.
        prepared_file_id = body["prepared_file"]["id"]
        self.assertNotEqual(prepared_file_id, self.file.id)
        self.assertEqual(body["prepared_file"]["content_type"], "application/pdf")
        self.assertIn("signed copy", body["prepared_file"]["original_filename"])

        # The prepared copy is a real, larger-or-different PDF starting with %PDF.
        prepared_file = DocumentFile.objects.get(pk=prepared_file_id)
        prepared_bytes = read_plaintext(prepared_file)
        self.assertTrue(prepared_bytes.startswith(b"%PDF"))

        # Original is preserved byte-for-byte.
        self.file.refresh_from_db()
        self.assertEqual(read_plaintext(self.file), self.original_bytes)

        # Audit record links hashes of both files; original/prepared differ.
        prepared = PreparedDocument.objects.get(pk=body["id"])
        record = prepared.signature_records.get()
        self.assertEqual(record.original_file_hash, sha256_hex(self.original_bytes))
        self.assertEqual(record.prepared_file_hash, sha256_hex(prepared_bytes))
        self.assertNotEqual(record.original_file_hash, record.prepared_file_hash)
        self.assertEqual(record.signature_method, "typed")
        self.assertEqual(record.signer_name, "John Doe")

    def test_empty_annotations_rejected(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            self._url(self.file.id), {"annotations": []}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_pdf_rejected_without_faking(self):
        self.client.force_authenticate(self.alice)
        png = _make_file(
            self.alice,
            document=self.doc,
            data=b"\x89PNG\r\n\x1a\nnot-a-pdf",
            name="scan.png",
            ct="image/png",
        )
        res = self.client.post(
            self._url(png.id),
            {"annotations": [{"page": 0, "x": 0.1, "y": 0.1, "type": "text", "value": "x"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("PDF", res.json()["detail"])

    def test_out_of_range_page_rejected(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            self._url(self.file.id),
            {"annotations": [{"page": 5, "x": 0.1, "y": 0.1, "type": "text", "value": "x"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_isolation(self):
        self.client.force_authenticate(self.bob)
        res = self.client.post(
            self._url(self.file.id),
            {"annotations": [{"page": 0, "x": 0.1, "y": 0.1, "type": "text", "value": "x"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(PreparedDocument.objects.exists())

    def test_list_prepared_documents_owner_scoped(self):
        self.client.force_authenticate(self.alice)
        self.client.post(
            self._url(self.file.id),
            {"annotations": [{"page": 0, "x": 0.1, "y": 0.1, "type": "text", "value": "x"}]},
            format="json",
        )
        res = self.client.get("/api/v1/fill-sign/prepared/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)

        # Filter by original_file works.
        res = self.client.get(f"/api/v1/fill-sign/prepared/?original_file={self.file.id}")
        self.assertEqual(len(res.json()), 1)

        # Bob sees none of Alice's prepared copies.
        self.client.force_authenticate(self.bob)
        res = self.client.get("/api/v1/fill-sign/prepared/")
        self.assertEqual(res.json(), [])

    def test_requires_authentication(self):
        res = self.client.post(
            self._url(self.file.id),
            {"annotations": [{"page": 0, "x": 0, "y": 0, "type": "text", "value": "x"}]},
            format="json",
        )
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
