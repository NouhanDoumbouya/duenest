"""
Redaction + Watermarking V1 — protected copies.

Hermetic: no AI is ever called; the feature flag is forced on. Covers owner auth +
ownership isolation, draft creation, ORIGINAL-UNCHANGED guarantee, a brand-new
ENCRYPTED protected file, SECURE redaction (redacted PDF text is NOT extractable;
image pixels are burned), watermark generation, unsupported-format 400, storage/
file plan-limit enforcement, add-to-room (protected file, not the original) with
ownership checks, no raw storage URLs, and the no-AI guarantee.
"""

from __future__ import annotations

import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.documents.file_encryption import encrypt_bytes_into_record, read_plaintext
from apps.documents.models import (
    DocumentFile,
    ProtectedDocumentCopy,
    SharingRoom,
)

User = get_user_model()

LIST_URL = "/api/v1/protected-copies/"


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


def _pdf_with_text(text="SECRET123 passport", size=(400, 400)) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(unit="pt", format=size)
    pdf.add_page()
    pdf.set_font("Helvetica", size=24)
    pdf.text(40, size[1] / 2, text)
    return bytes(pdf.output())


def _png(size=(200, 200), color=(255, 255, 255)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def _store(owner, data: bytes, *, filename, content_type) -> DocumentFile:
    f = DocumentFile(uploaded_by=owner, original_filename=filename,
                     content_type=content_type, file_size=len(data))
    encrypt_bytes_into_record(f, data, filename)
    f.save()
    return f


@override_settings()
class _Base(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN", first_name="Aisha",
        )
        self.client.force_authenticate(self.user)


class CreateTests(_Base):
    def test_list_requires_auth(self):
        self.client.force_authenticate(None)
        with _flag_on():
            self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_create_draft_from_owned_file(self):
        f = _store(self.user, _pdf_with_text(), filename="passport.pdf", content_type="application/pdf")
        with _flag_on():
            resp = self.client.post(LIST_URL, {
                "original_file": f.id, "title": "Passport (protected)",
                "protection_type": "watermark", "watermark_text": "For ABC University",
            }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "draft")
        self.assertEqual(resp.data["protection_type"], "watermark")

    def test_cannot_create_from_another_users_file(self):
        other = User.objects.create_user(username="x", email="x@x.com", password="StrongPass123!DN")
        foreign = _store(other, _png(), filename="id.png", content_type="image/png")
        with _flag_on():
            resp = self.client.post(LIST_URL, {"original_file": foreign.id,
                                               "protection_type": "redaction",
                                               "redactions": [{"page_number": 1, "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}]},
                                    format="json")
        self.assertEqual(resp.status_code, 404)

    def test_unsupported_format_rejected(self):
        f = _store(self.user, b"PK fake docx", filename="cv.docx",
                   content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        with _flag_on():
            resp = self.client.post(LIST_URL, {"original_file": f.id,
                                               "protection_type": "watermark",
                                               "watermark_text": "x"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("PDF", resp.data["detail"])

    def test_watermark_requires_text(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        with _flag_on():
            resp = self.client.post(LIST_URL, {"original_file": f.id,
                                               "protection_type": "watermark"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_redaction_requires_boxes(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        with _flag_on():
            resp = self.client.post(LIST_URL, {"original_file": f.id,
                                               "protection_type": "redaction",
                                               "redactions": []}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_other_user_cannot_access_copy(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        copy = ProtectedDocumentCopy.objects.create(
            owner=self.user, original_file=f, title="x", protection_type="watermark",
            watermark_text="c",
        )
        other = User.objects.create_user(username="y", email="y@x.com", password="StrongPass123!DN")
        self.client.force_authenticate(other)
        with _flag_on():
            self.assertEqual(self.client.get(f"{LIST_URL}{copy.id}/").status_code, 404)


class GenerateSecurityTests(_Base):
    def _create_and_generate(self, f, body):
        with _flag_on():
            created = self.client.post(LIST_URL, {"original_file": f.id, **body}, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            cid = created.data["id"]
            gen = self.client.post(f"{LIST_URL}{cid}/generate/")
        return cid, gen

    def test_pdf_redaction_destroys_extractable_text(self):
        original_bytes = _pdf_with_text("SECRET123 passport number")
        f = _store(self.user, original_bytes, filename="passport.pdf", content_type="application/pdf")
        cid, gen = self._create_and_generate(f, {
            "protection_type": "redaction_watermark",
            "watermark_text": "For ABC University only",
            "redactions": [{"page_number": 1, "x": 0.0, "y": 0.4, "width": 1.0, "height": 0.25}],
        })
        self.assertEqual(gen.status_code, 200, gen.data)
        self.assertEqual(gen.data["status"], "ready")

        copy = ProtectedDocumentCopy.objects.get(pk=cid)
        protected_bytes = read_plaintext(copy.protected_file)
        self.assertTrue(protected_bytes.startswith(b"%PDF"))

        # CRITICAL: the redacted secret must NOT be extractable from the output.
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(protected_bytes))
        extracted = " ".join((p.extract_text() or "") for p in reader.pages)
        self.assertNotIn("SECRET123", extracted)

        # And the ORIGINAL file is untouched (still has the extractable text).
        f.refresh_from_db()
        original_now = read_plaintext(f)
        self.assertEqual(original_now, original_bytes)
        orig_reader = pypdf.PdfReader(io.BytesIO(original_now))
        self.assertIn("SECRET123", orig_reader.pages[0].extract_text())

    def test_protected_file_is_a_new_encrypted_file(self):
        f = _store(self.user, _pdf_with_text(), filename="p.pdf", content_type="application/pdf")
        cid, gen = self._create_and_generate(f, {
            "protection_type": "watermark", "watermark_text": "Confidential",
        })
        copy = ProtectedDocumentCopy.objects.get(pk=cid)
        self.assertIsNotNone(copy.protected_file_id)
        self.assertNotEqual(copy.protected_file_id, f.id)  # brand-new file
        self.assertEqual(copy.protected_file.encryption_status, "encrypted")
        self.assertEqual(copy.protected_file.uploaded_by_id, self.user.id)

    def test_image_redaction_burns_pixels(self):
        f = _store(self.user, _png(color=(255, 255, 255)), filename="id.png", content_type="image/png")
        cid, gen = self._create_and_generate(f, {
            "protection_type": "redaction",
            "redactions": [{"page_number": 1, "x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5}],
        })
        copy = ProtectedDocumentCopy.objects.get(pk=cid)
        from PIL import Image

        img = Image.open(io.BytesIO(read_plaintext(copy.protected_file))).convert("RGB")
        self.assertEqual(img.getpixel((100, 100)), (0, 0, 0))   # redacted center
        self.assertEqual(img.getpixel((5, 5)), (255, 255, 255))  # untouched corner

    def test_pdf_watermark_only_succeeds(self):
        f = _store(self.user, _pdf_with_text("hello"), filename="p.pdf", content_type="application/pdf")
        cid, gen = self._create_and_generate(f, {
            "protection_type": "watermark", "watermark_text": "Confidential",
        })
        self.assertEqual(gen.data["status"], "ready")
        copy = ProtectedDocumentCopy.objects.get(pk=cid)
        self.assertTrue(read_plaintext(copy.protected_file).startswith(b"%PDF"))

    def test_no_storage_urls_in_payloads(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        cid, gen = self._create_and_generate(f, {
            "protection_type": "watermark", "watermark_text": "x",
        })
        blob = json.dumps(gen.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "amazonaws", "https://", "/media/"):
            self.assertNotIn(marker, blob)
        # The protected file is referenced by the private owner download route only.
        self.assertEqual(
            gen.data["protected_file_info"]["download_url"],
            f"/api/v1/files/{gen.data['protected_file']}/download/",
        )

    def test_no_ai_call_during_generation(self):
        f = _store(self.user, _pdf_with_text(), filename="p.pdf", content_type="application/pdf")
        with mock.patch("apps.ai.client.generate") as g:
            self._create_and_generate(f, {"protection_type": "watermark", "watermark_text": "x"})
        g.assert_not_called()

    def test_storage_limit_enforced_on_generate(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        with _flag_on():
            created = self.client.post(LIST_URL, {"original_file": f.id,
                                                  "protection_type": "watermark",
                                                  "watermark_text": "x"}, format="json")
            cid = created.data["id"]
            with mock.patch(
                "apps.documents.plan_usage.get_user_storage_limit_bytes", return_value=1
            ):
                gen = self.client.post(f"{LIST_URL}{cid}/generate/")
        self.assertEqual(gen.status_code, 403)
        self.assertEqual(gen.data["code"], "plan_limit_exceeded")


class RoomIntegrationTests(_Base):
    def _ready_copy(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        with _flag_on():
            created = self.client.post(LIST_URL, {"original_file": f.id,
                                                  "protection_type": "watermark",
                                                  "watermark_text": "x"}, format="json")
            self.client.post(f"{LIST_URL}{created.data['id']}/generate/")
        return ProtectedDocumentCopy.objects.get(pk=created.data["id"]), f

    def test_add_protected_copy_to_owner_room(self):
        copy, original = self._ready_copy()
        room = SharingRoom.objects.create(owner=self.user, title="R")
        with _flag_on():
            resp = self.client.post(f"{LIST_URL}{copy.id}/add-to-room/",
                                    {"sharing_room": room.id}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        # The PROTECTED file is in the room — not the original.
        item_files = list(room.items.values_list("file_id", flat=True))
        self.assertIn(copy.protected_file_id, item_files)
        self.assertNotIn(original.id, item_files)

    def test_cannot_add_to_another_users_room(self):
        copy, _ = self._ready_copy()
        other = User.objects.create_user(username="z", email="z@x.com", password="StrongPass123!DN")
        foreign_room = SharingRoom.objects.create(owner=other, title="Theirs")
        with _flag_on():
            resp = self.client.post(f"{LIST_URL}{copy.id}/add-to-room/",
                                    {"sharing_room": foreign_room.id}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_cannot_add_unready_copy_to_room(self):
        f = _store(self.user, _png(), filename="id.png", content_type="image/png")
        copy = ProtectedDocumentCopy.objects.create(
            owner=self.user, original_file=f, title="x", protection_type="watermark",
            watermark_text="c", status=ProtectedDocumentCopy.Status.DRAFT,
        )
        room = SharingRoom.objects.create(owner=self.user, title="R")
        with _flag_on():
            resp = self.client.post(f"{LIST_URL}{copy.id}/add-to-room/",
                                    {"sharing_room": room.id}, format="json")
        self.assertEqual(resp.status_code, 400)
