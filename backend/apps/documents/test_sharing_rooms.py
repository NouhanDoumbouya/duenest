"""
Sharing Rooms V1 — secure workspaces around a pack/application.

Hermetic: no AI is ever called. Covers owner auth + ownership isolation, linked
pack/application ownership, the public token resolve (valid / revoked / expired),
selected-item-only + no-storage-URL public payload, the public file proxy
(download gated by allow_download), add/remove items (incl. request links) with
ownership checks, create-from-pack/application auto-population, revoke/archive,
the active plan limit (Free 3; terminal states don't count), Life Radar counts,
and the no-AI / no-credit / no-public-URL guarantees.
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from rest_framework.test import APITestCase

from apps.billing.models import Plan, UserSubscription
from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
    DocumentRequestLink,
    SharingRoom,
    SharingRoomItem,
    TrackedApplication,
)

User = get_user_model()

LIST_URL = "/api/v1/sharing-rooms/"


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


def _file(owner, name="passport.pdf"):
    """An encrypted owner-owned inbox DocumentFile."""
    from apps.documents.file_encryption import encrypt_bytes_into_record

    f = DocumentFile(uploaded_by=owner, original_filename=name,
                     content_type="application/pdf", file_size=20)
    encrypt_bytes_into_record(f, b"%PDF-1.4 bytes", name)
    f.save()
    return f


class _Base(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN", first_name="Aisha",
        )
        self.client.force_authenticate(self.user)

    def _create(self, **extra):
        return self.client.post(LIST_URL, {"title": "Scholarship Room", **extra}, format="json")


class CreateAndAccessTests(_Base):
    def test_list_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_owner_creates_room(self):
        resp = self._create(room_type="pack", description="For the committee")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "active")
        self.assertEqual(resp.data["room_type"], "pack")
        self.assertTrue(resp.data["token"])
        self.assertIn("/room/", resp.data["public_url"])

    def test_create_requires_title(self):
        resp = self.client.post(LIST_URL, {"title": ""}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_link_another_users_pack(self):
        other = User.objects.create_user(username="x", email="x@x.com", password="StrongPass123!DN")
        foreign = DocumentBundle.objects.create(owner=other, title="Theirs")
        resp = self._create(linked_bundle=foreign.id)
        self.assertEqual(resp.status_code, 400)

    def test_other_user_cannot_access_room(self):
        room = SharingRoom.objects.create(owner=self.user, title="R")
        other = User.objects.create_user(username="y", email="y@x.com", password="StrongPass123!DN")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"{LIST_URL}{room.id}/").status_code, 404)


class PublicResolveTests(_Base):
    def test_public_resolves_active_room_and_marks_opened(self):
        room = SharingRoom.objects.create(owner=self.user, title="Visa Room",
                                          description="Docs for visa")
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/sharing-rooms/{room.token}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["title"], "Visa Room")
        self.assertEqual(resp.data["state"], "ok")
        # Owner identity/email never exposed.
        blob = json.dumps(resp.data).lower()
        self.assertNotIn("o@x.com", blob)
        room.refresh_from_db()
        self.assertIsNotNone(room.opened_at)
        self.assertEqual(room.open_count, 1)

    def test_revoked_room_cannot_be_opened(self):
        room = SharingRoom.objects.create(
            owner=self.user, title="R", status=SharingRoom.Status.REVOKED,
            revoked_at=timezone.now(),
        )
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/sharing-rooms/{room.token}/")
        self.assertEqual(resp.status_code, 410)
        self.assertEqual(resp.data["state"], "revoked")

    def test_expired_room_cannot_be_opened(self):
        room = SharingRoom.objects.create(
            owner=self.user, title="R", expires_at=timezone.now() - timedelta(days=1),
        )
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/sharing-rooms/{room.token}/")
        self.assertEqual(resp.status_code, 410)
        self.assertEqual(resp.data["state"], "expired")

    def test_public_payload_exposes_only_selected_items_and_no_storage_url(self):
        room = SharingRoom.objects.create(owner=self.user, title="R")
        shared = _file(self.user, "shared.pdf")
        secret = _file(self.user, "secret.pdf")  # NOT added to the room
        SharingRoomItem.objects.create(
            room=room, item_type=SharingRoomItem.ItemType.FILE, file=shared,
        )
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/sharing-rooms/{room.token}/")
        names = [d["name"] for d in resp.data["documents"]]
        self.assertIn("shared.pdf", names)
        self.assertNotIn("secret.pdf", names)
        # File entries carry a file_id (for the proxy), never a storage URL.
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "amazonaws", "https://", "/media/"):
            self.assertNotIn(marker, blob)
        self.assertIn("file_id", resp.data["documents"][0])


class PublicFileProxyTests(_Base):
    def _room_with_file(self, allow_download=True):
        room = SharingRoom.objects.create(owner=self.user, title="R", allow_download=allow_download)
        f = _file(self.user, "doc.pdf")
        SharingRoomItem.objects.create(
            room=room, item_type=SharingRoomItem.ItemType.FILE, file=f,
        )
        return room, f

    def test_public_download_streams_decrypted_bytes(self):
        room, f = self._room_with_file(allow_download=True)
        self.client.force_authenticate(None)
        resp = self.client.get(
            f"/api/v1/public/sharing-rooms/{room.token}/files/{f.id}/download/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(b"".join(resp.streaming_content).startswith(b"%PDF"))

    def test_download_blocked_when_allow_download_false(self):
        room, f = self._room_with_file(allow_download=False)
        self.client.force_authenticate(None)
        resp = self.client.get(
            f"/api/v1/public/sharing-rooms/{room.token}/files/{f.id}/download/"
        )
        self.assertEqual(resp.status_code, 403)

    def test_cannot_proxy_file_not_in_room(self):
        room, f = self._room_with_file()
        other_file = _file(self.user, "other.pdf")  # owned but not in the room
        self.client.force_authenticate(None)
        resp = self.client.get(
            f"/api/v1/public/sharing-rooms/{room.token}/files/{other_file.id}/download/"
        )
        self.assertEqual(resp.status_code, 404)


class ItemTests(_Base):
    def setUp(self):
        super().setUp()
        self.room = SharingRoom.objects.create(owner=self.user, title="R")

    def _add(self, **data):
        return self.client.post(f"{LIST_URL}{self.room.id}/add-item/", data, format="json")

    def test_add_owned_file(self):
        f = _file(self.user)
        resp = self._add(item_type="file", file=f.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(self.room.items.count(), 1)

    def test_cannot_add_another_users_file(self):
        other = User.objects.create_user(username="z", email="z@x.com", password="StrongPass123!DN")
        foreign = _file(other)
        resp = self._add(item_type="file", file=foreign.id)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.room.items.count(), 0)

    def test_add_owned_request_link(self):
        link = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="Transcript",
        )
        resp = self._add(item_type="request", request_link=link.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(
            self.room.items.filter(item_type="request").count(), 1
        )

    def test_cannot_add_another_users_request_link(self):
        other = User.objects.create_user(username="z2", email="z2@x.com", password="StrongPass123!DN")
        foreign = DocumentRequestLink.objects.create(owner=other, requested_document_title="X")
        resp = self._add(item_type="request", request_link=foreign.id)
        self.assertEqual(resp.status_code, 400)

    def test_remove_item(self):
        f = _file(self.user)
        item = SharingRoomItem.objects.create(
            room=self.room, item_type=SharingRoomItem.ItemType.FILE, file=f,
        )
        resp = self.client.post(
            f"{LIST_URL}{self.room.id}/remove-item/", {"item_id": item.id}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.room.items.count(), 0)

    def test_request_item_in_public_payload_routes_upload(self):
        link = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="Transcript",
        )
        SharingRoomItem.objects.create(
            room=self.room, item_type=SharingRoomItem.ItemType.REQUEST, request_link=link,
        )
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/sharing-rooms/{self.room.token}/")
        self.assertEqual(len(resp.data["requests"]), 1)
        self.assertEqual(resp.data["requests"][0]["upload_token"], link.token)


class LifecycleTests(_Base):
    def test_revoke(self):
        room = SharingRoom.objects.create(owner=self.user, title="R")
        resp = self.client.post(f"{LIST_URL}{room.id}/revoke/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "revoked")

    def test_archive(self):
        room = SharingRoom.objects.create(owner=self.user, title="R")
        resp = self.client.post(f"{LIST_URL}{room.id}/archive/")
        self.assertEqual(resp.data["status"], "archived")

    def test_expire_sweep(self):
        SharingRoom.objects.create(
            owner=self.user, title="R", expires_at=timezone.now() - timedelta(days=1),
        )
        from apps.documents.sharing_rooms import expire_sharing_rooms

        self.assertEqual(expire_sharing_rooms(), 1)


class FromPackApplicationTests(_Base):
    def test_create_room_from_pack_links_and_populates(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        f = _file(self.user, "transcript.pdf")
        DocumentBundleRequirement.objects.create(
            owner=self.user, bundle=bundle, title="Transcript",
            status=DocumentBundleRequirement.Status.ATTACHED, linked_file=f,
        )
        resp = self.client.post(f"{LIST_URL}from-pack/{bundle.id}/", {}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["linked_bundle"], bundle.id)
        # The attached file was auto-added as a room item.
        self.assertEqual(resp.data["item_count"], 1)

    def test_create_room_from_application_links_pack(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Pack")
        app = TrackedApplication.objects.create(
            owner=self.user, title="PhD App", linked_bundle=bundle,
        )
        resp = self.client.post(f"{LIST_URL}from-application/{app.id}/", {}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["linked_application"], app.id)
        self.assertEqual(resp.data["linked_bundle"], bundle.id)


class PlanLimitTests(_Base):
    def test_free_plan_caps_active_rooms_at_3(self):
        for _ in range(3):
            self.assertEqual(self._create().status_code, 201)
        resp = self._create()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "plan_limit_exceeded")
        self.assertEqual(resp.data["resource"], "sharing_rooms")

    def test_terminal_states_do_not_count(self):
        for st in (SharingRoom.Status.REVOKED, SharingRoom.Status.EXPIRED,
                   SharingRoom.Status.ARCHIVED):
            SharingRoom.objects.create(owner=self.user, title="R", status=st)
        # 3 terminal rooms don't consume the active allowance.
        self.assertEqual(self._create().status_code, 201)

    def test_pro_plan_allows_more(self):
        _grant_pro(self.user)
        self.user.plan = "pro_placeholder"
        self.user.save(update_fields=["plan"])
        for _ in range(4):
            self.assertEqual(self._create().status_code, 201)


class LifeRadarAndNoAiTests(_Base):
    def test_life_radar_includes_room_counts(self):
        SharingRoom.objects.create(owner=self.user, title="A")
        link = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="T",
            status=DocumentRequestLink.Status.REQUESTED,
        )
        room2 = SharingRoom.objects.create(owner=self.user, title="B")
        SharingRoomItem.objects.create(
            room=room2, item_type=SharingRoomItem.ItemType.REQUEST, request_link=link,
        )
        from apps.documents.life_radar import build_life_radar

        summary = build_life_radar(self.user)["summary"]
        self.assertEqual(summary["active_sharing_rooms"], 2)
        self.assertEqual(summary["rooms_with_pending_requests"], 1)
        self.assertIn("expiring_sharing_rooms", summary)

    def test_no_ai_call_across_room_lifecycle(self):
        with mock.patch("apps.ai.client.generate") as g:
            resp = self._create()
            room_id = resp.data["id"]
            f = _file(self.user)
            self.client.post(f"{LIST_URL}{room_id}/add-item/",
                             {"item_type": "file", "file": f.id}, format="json")
            self.client.post(f"{LIST_URL}{room_id}/revoke/")
        g.assert_not_called()
