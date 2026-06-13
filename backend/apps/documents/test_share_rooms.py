"""
Tests for Secure Rooms / Shared Packs: owner management, strict owner isolation,
token-gated public access, access codes, view-only download blocking, access
limits, and the guarantee that a room never exposes more than its explicit items.
"""

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

from .models import Document, DocumentFile, ShareRoom, ShareRoomItem

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-rooms-test-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class ShareRoomBaseTest(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@x.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@x.com", password="StrongPassword123!DN"
        )
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.alice_file = DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf(),
            original_filename="passport.pdf",
            content_type="application/pdf",
            file_size=12,
        )
        self.bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf("bob.pdf"),
            original_filename="bob.pdf",
            content_type="application/pdf",
            file_size=12,
        )

    def consume(self, response):
        if getattr(response, "streaming", False):
            b"".join(response.streaming_content)
            response.close()
        return response

    def make_room(self, owner=None, **kwargs):
        owner = owner or self.alice
        defaults = dict(owner=owner, title="Visa room")
        defaults.update(kwargs)
        return ShareRoom.objects.create(**defaults)


class RoomOwnerTests(ShareRoomBaseTest):
    def test_owner_can_create_room(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/share-rooms/",
            {"title": "Scholarship pack", "permission": "view_only"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", resp.data)

    def test_create_with_code_returns_code_once(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/share-rooms/",
            {"title": "R", "access_code_required": True, "access_code": "778899"},
            format="json",
        )
        self.assertEqual(resp.data["access_code"], "778899")
        room = ShareRoom.objects.get(id=resp.data["id"])
        self.assertNotEqual(room.access_code_hash, "778899")

    def test_owner_can_add_and_remove_items(self):
        room = self.make_room()
        self.client.force_authenticate(self.alice)
        add = self.client.post(
            f"/api/v1/share-rooms/{room.id}/items/",
            {"file": self.alice_file.id},
            format="json",
        )
        self.assertEqual(add.status_code, status.HTTP_201_CREATED)
        item = ShareRoomItem.objects.get(room=room)
        delete = self.client.delete(
            f"/api/v1/share-rooms/{room.id}/items/{item.id}/"
        )
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ShareRoomItem.objects.filter(room=room).count(), 0)

    def test_cannot_add_other_users_file(self):
        room = self.make_room()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            f"/api/v1/share-rooms/{room.id}/items/",
            {"file": self.bob_file.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_owner_cannot_manage_room(self):
        room = self.make_room()
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(f"/api/v1/share-rooms/{room.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/share-rooms/{room.id}/items/",
                {"file": self.bob_file.id},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_owner_can_revoke(self):
        room = self.make_room()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(f"/api/v1/share-rooms/{room.id}/revoke/")
        self.assertEqual(resp.data["status"], "revoked")


class RoomPublicAccessTests(ShareRoomBaseTest):
    def _room_with_file(self, **kwargs):
        room = self.make_room(**kwargs)
        ShareRoomItem.objects.create(room=room, file=self.alice_file)
        return room

    def test_public_exposes_only_included_items(self):
        room = self._room_with_file()
        # A second, NOT-included file in Alice's vault.
        DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf("secret.pdf"),
            original_filename="secret.pdf",
            content_type="application/pdf",
            file_size=12,
        )
        resp = self.client.get(f"/api/v1/public/rooms/{room.token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {f["name"] for f in resp.data["files"]}
        self.assertEqual(names, {"passport.pdf"})
        # No tokens / codes / owner identity leak.
        body = str(resp.data)
        self.assertNotIn(room.token, body)
        self.assertNotIn("access_code_hash", body)

    def test_invalid_token_clean_response(self):
        resp = self.client.get("/api/v1/public/rooms/not-a-real-token/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_revoked_room_blocked(self):
        room = self._room_with_file(revoked_at=timezone.now())
        resp = self.client.get(f"/api/v1/public/rooms/{room.token}/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_expired_room_blocked(self):
        room = self._room_with_file(expires_at=timezone.now() - timedelta(days=1))
        resp = self.client.get(f"/api/v1/public/rooms/{room.token}/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_access_code_required_then_grant_unlocks(self):
        room = self._room_with_file(
            access_code_required=True, access_code_hash=make_password("112233")
        )
        blocked = self.client.get(f"/api/v1/public/rooms/{room.token}/")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        verify = self.client.post(
            f"/api/v1/public/rooms/{room.token}/verify-code/",
            {"access_code": "112233"},
            format="json",
        )
        grant = verify.data["grant"]
        ok = self.client.get(f"/api/v1/public/rooms/{room.token}/?grant={grant}")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_wrong_room_code_blocked(self):
        room = self._room_with_file(
            access_code_required=True, access_code_hash=make_password("112233")
        )
        resp = self.client.post(
            f"/api/v1/public/rooms/{room.token}/verify-code/",
            {"access_code": "000000"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_view_only_blocks_download_serverside(self):
        room = self._room_with_file(permission="view_only")
        preview = self.consume(
            self.client.get(
                f"/api/v1/public/rooms/{room.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        download = self.client.get(
            f"/api/v1/public/rooms/{room.token}/files/{self.alice_file.id}/download/"
        )
        self.assertEqual(download.status_code, status.HTTP_403_FORBIDDEN)

    def test_download_allowed_room_can_download_and_zip(self):
        room = self._room_with_file(permission="download_allowed")
        dl = self.consume(
            self.client.get(
                f"/api/v1/public/rooms/{room.token}/files/{self.alice_file.id}/download/"
            )
        )
        self.assertEqual(dl.status_code, status.HTTP_200_OK)
        zip_resp = self.consume(
            self.client.get(f"/api/v1/public/rooms/{room.token}/download-zip/")
        )
        self.assertEqual(zip_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(zip_resp["Content-Type"], "application/zip")

    def test_cannot_access_file_not_in_room(self):
        room = self._room_with_file(permission="download_allowed")
        # Bob's file id is not part of the room.
        resp = self.client.get(
            f"/api/v1/public/rooms/{room.token}/files/{self.bob_file.id}/preview/"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_one_time_room_blocks_second_view(self):
        room = self._room_with_file(access_limit_type="one_time")
        first = self.consume(
            self.client.get(
                f"/api/v1/public/rooms/{room.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        second = self.client.get(
            f"/api/v1/public/rooms/{room.token}/files/{self.alice_file.id}/preview/"
        )
        self.assertEqual(second.status_code, status.HTTP_410_GONE)
