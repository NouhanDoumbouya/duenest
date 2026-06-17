import json
import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Document,
    DocumentExportRequest,
    DocumentFile,
    DocumentFileShareLink,
    DocumentVersion,
    EmergencyAccessPack,
    ProofRecord,
)

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-vault-maturity-test-")


def make_pdf(name="passport.pdf", content=b"%PDF-1.4 fake pdf bytes"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


def document_url(document_id):
    return f"/api/v1/documents/{document_id}/"


def file_url(document_id, file_id):
    return f"/api/v1/documents/{document_id}/files/{file_id}/"


def future():
    return timezone.now() + timedelta(days=7)


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class VaultMaturityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="StrongPassword123!DueNest",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="StrongPassword123!DueNest",
        )
        self.alice_doc = Document.objects.create(
            owner=self.alice,
            title="Alice Passport",
            document_type="passport",
            expiry_date=timezone.localdate() + timedelta(days=90),
        )
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def make_file(self, document=None, owner=None, upload=None):
        upload = upload or make_pdf()
        document = document or self.alice_doc
        return DocumentFile.objects.create(
            document=document,
            uploaded_by=owner or document.owner,
            file=upload,
            original_filename=upload.name,
            content_type=upload.content_type,
            file_size=upload.size,
        )

    def read_stream(self, response):
        if getattr(response, "streaming", False):
            content = b"".join(response.streaming_content)
            response.close()
            return content
        return response.content

    def test_document_trash_restore_and_permanent_delete_flow(self):
        self.auth(self.alice)

        blocked = self.client.delete(
            f"/api/v1/documents/{self.alice_doc.id}/permanent-delete/"
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

        deleted = self.client.delete(document_url(self.alice_doc.id))
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.alice_doc.refresh_from_db()
        self.assertTrue(self.alice_doc.is_trashed)
        self.assertIsNotNone(self.alice_doc.trashed_at)

        active = self.client.get("/api/v1/documents/")
        self.assertNotIn(
            self.alice_doc.id,
            {item["id"] for item in active.data["results"]},
        )
        trash = self.client.get("/api/v1/documents/trash/")
        self.assertIn(
            self.alice_doc.id,
            {item["id"] for item in trash.data["results"]},
        )

        restored = self.client.post(f"/api/v1/documents/{self.alice_doc.id}/restore/")
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        self.alice_doc.refresh_from_db()
        self.assertFalse(self.alice_doc.is_trashed)

        self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}/trash/",
            {"reason": "duplicate"},
            format="json",
        )
        purged = self.client.delete(
            f"/api/v1/documents/{self.alice_doc.id}/permanent-delete/"
        )
        self.assertEqual(purged.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Document.objects.filter(id=self.alice_doc.id).exists())

    def test_file_trash_restore_cuts_off_public_share_access(self):
        file = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=file,
            permission=DocumentFileShareLink.Permission.DOWNLOAD_ALLOWED,
            expires_at=future(),
        )
        self.auth(self.alice)

        deleted = self.client.delete(file_url(self.alice_doc.id, file.id))
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        file.refresh_from_db()
        self.assertTrue(file.is_trashed)

        files = self.client.get(f"/api/v1/documents/{self.alice_doc.id}/files/")
        self.assertNotIn(file.id, {item["id"] for item in files.data["results"]})
        trash = self.client.get(
            f"/api/v1/documents/{self.alice_doc.id}/files/trash/"
        )
        self.assertIn(file.id, {item["id"] for item in trash.data["results"]})

        unavailable = self.client.get(f"/api/v1/share/files/{link.token}/")
        self.assertEqual(unavailable.status_code, status.HTTP_410_GONE)
        self.assertEqual(unavailable.data["state"], "unavailable")

        restored = self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}/files/{file.id}/restore/"
        )
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        available = self.client.get(f"/api/v1/share/files/{link.token}/")
        self.assertEqual(available.status_code, status.HTTP_200_OK)

        blocked = self.client.delete(
            f"/api/v1/documents/{self.alice_doc.id}/files/{file.id}/permanent-delete/"
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.post(f"/api/v1/documents/{self.alice_doc.id}/files/{file.id}/trash/")
        purged = self.client.delete(
            f"/api/v1/documents/{self.alice_doc.id}/files/{file.id}/permanent-delete/"
        )
        self.assertEqual(purged.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DocumentFile.objects.filter(id=file.id).exists())

    def test_document_versions_are_created_and_can_restore_metadata(self):
        self.auth(self.alice)
        created = self.client.post(
            "/api/v1/documents/",
            {"title": "Original Passport", "issuer": "Original Office"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        document_id = created.data["id"]
        first_version = DocumentVersion.objects.get(
            document_id=document_id, version_number=1
        )

        updated = self.client.patch(
            document_url(document_id),
            {"title": "Updated Passport", "issuer": "Updated Office"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(
            DocumentVersion.objects.filter(document_id=document_id).count(), 2
        )

        restored = self.client.post(
            f"/api/v1/documents/{document_id}/versions/{first_version.id}/restore-metadata/"
        )
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        self.assertEqual(restored.data["title"], "Original Passport")
        self.assertEqual(
            DocumentVersion.objects.filter(document_id=document_id).count(), 3
        )

    def test_export_generates_secret_free_json_and_skips_trash(self):
        file = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=file,
            expires_at=future(),
            access_code_required=True,
            access_code_hash="hash-that-must-not-export",
        )
        Document.objects.create(
            owner=self.alice,
            title="Trashed Document",
            is_trashed=True,
            trashed_at=timezone.now(),
        )
        self.auth(self.alice)

        response = self.client.post(
            "/api/v1/document-exports/",
            {"export_type": DocumentExportRequest.ExportType.FULL_VAULT_METADATA},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], DocumentExportRequest.Status.COMPLETED)
        self.assertTrue(response.data["download_url"])

        downloaded = self.client.get(response.data["download_url"])
        self.assertEqual(downloaded.status_code, status.HTTP_200_OK)
        payload = json.loads(self.read_stream(downloaded).decode("utf-8"))
        body = json.dumps(payload)

        self.assertIn("Alice Passport", body)
        self.assertNotIn("Trashed Document", body)
        self.assertNotIn(link.token, body)
        self.assertNotIn("hash-that-must-not-export", body)
        self.assertNotIn(file.file.name, body)

    def test_emergency_pack_access_code_and_public_flow(self):
        file = self.make_file()
        self.auth(self.alice)

        no_code = self.client.post(
            "/api/v1/emergency-packs/",
            {
                "title": "Emergency pack",
                "access_mode": "share_link",
                "access_code_required": True,
            },
            format="json",
        )
        self.assertEqual(no_code.status_code, status.HTTP_400_BAD_REQUEST)

        # This test exercises the INSTANT_CODE flow (a correct code immediately
        # unlocks items). The API now defaults new packs to the safer DELAYED
        # unlock mode (which starts an owner-approval/countdown request instead),
        # so the instant-code mode must be requested explicitly here.
        created = self.client.post(
            "/api/v1/emergency-packs/",
            {
                "title": "Emergency pack",
                "access_mode": "share_link",
                "unlock_mode": "instant_code",
                "access_code_required": True,
                "access_code": "246810",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("access_code", created.data)
        self.assertNotIn("access_code_hash", created.data)
        pack = EmergencyAccessPack.objects.get(id=created.data["id"])
        self.assertTrue(check_password("246810", pack.access_code_hash))

        item = self.client.post(
            f"/api/v1/emergency-packs/{pack.id}/items/",
            {"linked_document": self.alice_doc.id, "linked_file": file.id},
            format="json",
        )
        self.assertEqual(item.status_code, status.HTTP_201_CREATED)

        enabled = self.client.post(f"/api/v1/emergency-packs/{pack.id}/enable/")
        self.assertEqual(enabled.status_code, status.HTTP_200_OK)
        self.assertTrue(enabled.data["share_url_path"])
        pack.refresh_from_db()

        locked = self.client.get(f"/api/v1/share/emergency-packs/{pack.token}/")
        self.assertEqual(locked.status_code, status.HTTP_403_FORBIDDEN)
        wrong = self.client.post(
            f"/api/v1/share/emergency-packs/{pack.token}/verify-code/",
            {"access_code": "000000"},
            format="json",
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)

        public = self.client.get(
            f"/api/v1/share/emergency-packs/{pack.token}/",
            HTTP_X_ACCESS_CODE="246810",
        )
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data["items"][0]["title"], "Alice Passport")
        self.assertNotIn("owner", str(public.data))
        self.assertNotIn("token", str(public.data))

        preview = self.client.get(
            f"/api/v1/share/emergency-packs/{pack.token}/items/{item.data['id']}/preview/",
            HTTP_X_ACCESS_CODE="246810",
        )
        self.assertEqual(self.read_stream(preview)[:4], b"%PDF")

        self.client.post(f"/api/v1/emergency-packs/{pack.id}/disable/")
        unavailable = self.client.get(
            f"/api/v1/share/emergency-packs/{pack.token}/",
            HTTP_X_ACCESS_CODE="246810",
        )
        self.assertEqual(unavailable.status_code, status.HTTP_410_GONE)

    def test_proof_records_are_owner_scoped(self):
        self.auth(self.alice)

        foreign = self.client.post(
            "/api/v1/proof-records/",
            {"title": "Wrong owner", "document": self.bob_doc.id},
            format="json",
        )
        self.assertEqual(foreign.status_code, status.HTTP_400_BAD_REQUEST)

        created = self.client.post(
            "/api/v1/proof-records/",
            {
                "title": "Submission receipt",
                "proof_type": "submission_confirmation",
                "document": self.alice_doc.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProofRecord.objects.count(), 1)

        listed = self.client.get(f"/api/v1/documents/{self.alice_doc.id}/proof-records/")
        self.assertEqual(listed.data["results"][0]["title"], "Submission receipt")

        self.auth(self.bob)
        detail = self.client.get(f"/api/v1/proof-records/{created.data['id']}/")
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_document_activity_timeline_is_owner_only_and_secret_free(self):
        self.auth(self.alice)
        created = self.client.post(
            "/api/v1/documents/",
            {"title": "Activity Doc", "document_type": "passport"},
            format="json",
        )
        document_id = created.data["id"]
        uploaded = self.client.post(
            f"/api/v1/documents/{document_id}/files/",
            {"file": make_pdf()},
            format="multipart",
        )
        file_id = uploaded.data["id"]
        preview = self.client.get(f"/api/v1/documents/{document_id}/files/{file_id}/preview/")
        self.assertEqual(self.read_stream(preview)[:4], b"%PDF")

        timeline = self.client.get(f"/api/v1/documents/{document_id}/activity/")
        self.assertEqual(timeline.status_code, status.HTTP_200_OK)
        actions = {item["action"] for item in timeline.data["items"]}
        self.assertIn("document_created", actions)
        self.assertIn("file_uploaded", actions)
        self.assertIn("file_previewed", actions)
        self.assertNotIn("ip_address", str(timeline.data))
        self.assertNotIn("user_agent", str(timeline.data))

        self.auth(self.bob)
        other_user = self.client.get(f"/api/v1/documents/{document_id}/activity/")
        self.assertEqual(other_user.status_code, status.HTTP_404_NOT_FOUND)
