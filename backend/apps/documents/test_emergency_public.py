import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Document,
    DocumentFile,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
)

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-emergency-test-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


def meta_url(token):
    return f"/api/v1/share/emergency-packs/{token}/"


def verify_url(token):
    return f"/api/v1/share/emergency-packs/{token}/verify-code/"


def preview_url(token, item_id):
    return f"/api/v1/share/emergency-packs/{token}/items/{item_id}/preview/"


def download_url(token, item_id):
    return f"/api/v1/share/emergency-packs/{token}/items/{item_id}/download/"


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class EmergencyPublicViewerTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.owner, title="Passport")
        self.other_doc = Document.objects.create(owner=self.owner, title="Secret")
        self.file = self._upload(self.doc)
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner,
            title="If something happens",
            description="Key documents for my family.",
            status=EmergencyAccessPack.Status.ACTIVE,
            access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
            token="emergency-token-123",
        )
        self.item = EmergencyAccessPackItem.objects.create(
            owner=self.owner,
            pack=self.pack,
            document=self.doc,
            file=self.file,
            notes="My passport",
        )

    def _upload(self, document, name="passport.pdf"):
        upload = make_pdf(name)
        return DocumentFile.objects.create(
            document=document,
            uploaded_by=self.owner,
            file=upload,
            original_filename=upload.name,
            content_type=upload.content_type,
            file_size=upload.size,
        )

    def _consume(self, response):
        if getattr(response, "streaming", False):
            b"".join(response.streaming_content)
            response.close()
        return response

    # ---- Valid access -------------------------------------------------------

    def test_valid_token_returns_only_selected_items(self):
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["title"], "If something happens")
        self.assertEqual(len(resp.data["items"]), 1)
        self.assertEqual(resp.data["items"][0]["title"], "Passport")
        # Unselected vault document must never appear.
        titles = [i["title"] for i in resp.data["items"]]
        self.assertNotIn("Secret", titles)

    def test_metadata_does_not_leak_token_or_owner_identity(self):
        resp = self.client.get(meta_url(self.pack.token))
        body = str(resp.data)
        self.assertNotIn(self.pack.token, body)
        self.assertNotIn("o@example.com", body)
        self.assertNotIn("owner", resp.data)

    def test_public_preview_and_download_work(self):
        preview = self._consume(self.client.get(preview_url(self.pack.token, self.item.id)))
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        download = self._consume(
            self.client.get(download_url(self.pack.token, self.item.id))
        )
        self.assertEqual(download.status_code, status.HTTP_200_OK)

    # ---- Blocked states -----------------------------------------------------

    def test_invalid_token_blocked(self):
        resp = self.client.get(meta_url("not-a-real-token"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data["state"], "invalid")

    def test_disabled_pack_blocked(self):
        self.pack.status = EmergencyAccessPack.Status.DISABLED
        self.pack.save(update_fields=["status"])
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "unavailable")

    def test_expired_pack_blocked(self):
        self.pack.expires_at = timezone.now() - timedelta(days=1)
        self.pack.save(update_fields=["expires_at"])
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "unavailable")

    def test_owner_only_pack_is_not_publicly_shareable(self):
        self.pack.access_mode = EmergencyAccessPack.AccessMode.OWNER_ONLY_PREVIEW
        self.pack.save(update_fields=["access_mode"])
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    # ---- Trashed content ----------------------------------------------------

    def test_trashed_document_not_returned_in_metadata(self):
        self.doc.is_trashed = True
        self.doc.save(update_fields=["is_trashed"])
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["items"]), 0)

    def test_trashed_file_blocks_preview(self):
        self.file.is_trashed = True
        self.file.save(update_fields=["is_trashed"])
        resp = self.client.get(preview_url(self.pack.token, self.item.id))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    # ---- Access code --------------------------------------------------------

    def _protect(self, code="1234"):
        self.pack.access_code_required = True
        self.pack.access_code_hash = make_password(code)
        self.pack.save(update_fields=["access_code_required", "access_code_hash"])

    def test_access_code_required_blocks_metadata(self):
        self._protect()
        resp = self.client.get(meta_url(self.pack.token))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "requires_code")

    def test_wrong_access_code_rejected(self):
        self._protect()
        resp = self.client.get(meta_url(self.pack.token), HTTP_X_ACCESS_CODE="9999")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "wrong_code")

    def test_correct_access_code_grants_metadata(self):
        self._protect()
        resp = self.client.get(meta_url(self.pack.token), HTTP_X_ACCESS_CODE="1234")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["items"]), 1)

    def test_verify_endpoint_validates_code(self):
        self._protect()
        ok = self.client.post(verify_url(self.pack.token), {"access_code": "1234"})
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        bad = self.client.post(verify_url(self.pack.token), {"access_code": "0000"})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_protected_preview_requires_code(self):
        self._protect()
        blocked = self.client.get(preview_url(self.pack.token, self.item.id))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        allowed = self._consume(
            self.client.get(
                preview_url(self.pack.token, self.item.id), HTTP_X_ACCESS_CODE="1234"
            )
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    # ---- Query efficiency ---------------------------------------------------

    def test_owner_list_query_count_is_stable_as_packs_grow(self):
        """The owner pack list must not issue more queries as packs are added
        (no N+1 from item_count or item serialization)."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.client.force_authenticate(self.owner)

        def add_pack(suffix):
            pack = EmergencyAccessPack.objects.create(
                owner=self.owner,
                title=f"Pack {suffix}",
                status=EmergencyAccessPack.Status.ACTIVE,
                access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
                token=f"tok-{suffix}",
            )
            EmergencyAccessPackItem.objects.create(
                owner=self.owner, pack=pack, document=self.doc, file=self.file
            )

        def list_query_count():
            with CaptureQueriesContext(connection) as ctx:
                resp = self.client.get("/api/v1/emergency-packs/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            return len(ctx)

        add_pack("a")
        baseline = list_query_count()
        add_pack("b")
        add_pack("c")
        # Same query count with more packs proves there is no per-row N+1.
        self.assertEqual(list_query_count(), baseline)
