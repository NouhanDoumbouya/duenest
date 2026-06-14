import base64
import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document, DocumentFile

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-enc-test-")
_PLAINTEXT = b"%PDF-1.4 top secret passport scan"


def pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, _PLAINTEXT, content_type="application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class FileEncryptionAtRestTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@example.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@example.com", password="StrongPassword123!DN"
        )

    def _upload(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post("/api/v1/files/", {"file": pdf()}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return DocumentFile.objects.get(pk=resp.data["id"])

    def test_api_upload_stores_ciphertext_not_plaintext(self):
        f = self._upload()
        self.assertEqual(f.encryption_status, DocumentFile.EncryptionStatus.ENCRYPTED)
        self.assertTrue(f.kek_version)
        self.assertTrue(f.wrapped_dek)
        self.assertEqual(len(bytes(f.nonce)), 12)
        # The bytes actually on disk must not be the plaintext.
        with f.file.open("rb") as fh:
            stored = fh.read()
        self.assertNotEqual(stored, _PLAINTEXT)
        self.assertNotIn(b"passport", stored)

    def test_owner_download_returns_original_plaintext(self):
        f = self._upload()
        resp = self.client.get(f"/api/v1/files/{f.pk}/download/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = b"".join(resp.streaming_content)
        resp.close()
        self.assertEqual(body, _PLAINTEXT)

    def test_corrupted_ciphertext_fails_safely(self):
        f = self._upload()
        # Tamper with the stored ciphertext.
        with f.file.open("rb") as fh:
            data = bytearray(fh.read())
        data[0] ^= 0xFF
        f.file.save(f.file.name.rsplit("/", 1)[-1], ContentFile(bytes(data)), save=True)
        resp = self.client.get(f"/api/v1/files/{f.pk}/download/")
        self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        # No crypto detail leaked; no plaintext returned.
        self.assertNotIn("dek", str(resp.data).lower())
        self.assertNotIn("passport", str(resp.data).lower())

    def test_cross_user_cannot_download(self):
        f = self._upload()
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/files/{f.pk}/download/")
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="duenest-mig-test-"))
class MigrationCommandTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="m", email="m@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Doc")
        # A legacy plaintext file: created directly, NOT via the encrypting view.
        self.legacy = DocumentFile.objects.create(
            document=self.doc,
            uploaded_by=self.user,
            file=pdf(),
            original_filename="passport.pdf",
            content_type="application/pdf",
            file_size=len(_PLAINTEXT),
        )
        self.assertEqual(
            self.legacy.encryption_status,
            DocumentFile.EncryptionStatus.PLAINTEXT_LEGACY,
        )

    def test_dry_run_changes_nothing(self):
        call_command("encrypt_existing_files", "--dry-run")
        self.legacy.refresh_from_db()
        self.assertEqual(
            self.legacy.encryption_status,
            DocumentFile.EncryptionStatus.PLAINTEXT_LEGACY,
        )

    def test_migration_encrypts_and_verifies(self):
        call_command("encrypt_existing_files", "--verify")
        self.legacy.refresh_from_db()
        self.assertEqual(
            self.legacy.encryption_status, DocumentFile.EncryptionStatus.ENCRYPTED
        )
        self.assertTrue(self.legacy.kek_version)
        # Stored bytes are now ciphertext...
        with self.legacy.file.open("rb") as fh:
            stored = fh.read()
        self.assertNotEqual(stored, _PLAINTEXT)
        # ...but it decrypts back to the original via an authorized download.
        self.client.force_authenticate(self.user)
        resp = self.client.get(
            f"/api/v1/documents/{self.doc.pk}/files/{self.legacy.pk}/download/"
        )
        body = b"".join(resp.streaming_content)
        resp.close()
        self.assertEqual(body, _PLAINTEXT)


_ROT_V1 = base64.b64encode(os.urandom(32)).decode("ascii")
_ROT_V2 = base64.b64encode(os.urandom(32)).decode("ascii")


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(prefix="duenest-rot-test-"),
    DUENEST_ACTIVE_KEK_VERSION="v1",
    DUENEST_KEKS={"v1": _ROT_V1, "v2": _ROT_V2},
)
class KeyRotationCommandTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="r", email="r@example.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        resp = self.client.post("/api/v1/files/", {"file": pdf()}, format="multipart")
        self.file = DocumentFile.objects.get(pk=resp.data["id"])
        self.assertEqual(self.file.kek_version, "v1")

    def test_rewrap_to_new_version_keeps_file_openable(self):
        call_command("rotate_file_keys", "--from-version", "v1", "--to-version", "v2")
        self.file.refresh_from_db()
        self.assertEqual(self.file.kek_version, "v2")
        # Still opens after rewrap (content was never re-encrypted).
        resp = self.client.get(f"/api/v1/files/{self.file.pk}/download/")
        body = b"".join(resp.streaming_content)
        resp.close()
        self.assertEqual(body, _PLAINTEXT)


class ProofNotesFieldEncryptionTests(APITestCase):
    """ProofRecord.notes is encrypted at rest (P1 field encryption)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="p", email="p@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Doc")
        self.client.force_authenticate(self.user)

    def test_notes_stored_encrypted_and_returned_plaintext(self):
        secret = "Submitted via gov portal; ref ABC-999 (private)."
        resp = self.client.post(
            "/api/v1/proof-records/",
            {"title": "Receipt", "document": self.doc.pk, "notes": secret},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # API returns the decrypted notes...
        self.assertEqual(resp.data["notes"], secret)
        from apps.documents.models import ProofRecord

        proof = ProofRecord.objects.get(pk=resp.data["id"])
        # ...but the DB stores ciphertext only, never the plaintext column.
        self.assertEqual(proof.notes, "")
        self.assertTrue(proof.notes_ciphertext)
        self.assertNotIn(b"private", bytes(proof.notes_ciphertext))
        self.assertEqual(proof.decrypt_notes(), secret)

    def test_notes_update_reencrypts(self):
        proof_id = self.client.post(
            "/api/v1/proof-records/",
            {"title": "R", "document": self.doc.pk, "notes": "first"},
            format="json",
        ).data["id"]
        resp = self.client.patch(
            f"/api/v1/proof-records/{proof_id}/",
            {"notes": "second"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["notes"], "second")

    def test_notes_aad_bound_to_record(self):
        from apps.documents.models import ProofRecord

        a = self.client.post(
            "/api/v1/proof-records/",
            {"title": "A", "document": self.doc.pk, "notes": "note A"},
            format="json",
        ).data["id"]
        b = self.client.post(
            "/api/v1/proof-records/",
            {"title": "B", "document": self.doc.pk, "notes": "note B"},
            format="json",
        ).data["id"]
        proof_a = ProofRecord.objects.get(pk=a)
        proof_b = ProofRecord.objects.get(pk=b)
        # Moving A's ciphertext onto B's row must not decrypt (AAD mismatch).
        proof_b.notes_ciphertext = proof_a.notes_ciphertext
        proof_b.save(update_fields=["notes_ciphertext"])
        self.assertEqual(proof_b.decrypt_notes(), "")
