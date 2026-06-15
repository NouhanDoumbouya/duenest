"""
Tests for the Emergency Protocol layer: locked unlock requests (owner-approval
and delayed), selected-only public access gating, optional off-by-default
location, trusted contacts, and the activity log.

These complement test_emergency_public.py (which covers the legacy instant
share-link viewer) and assert the new request-gated behaviour does not leak the
vault before access is granted.
"""

import shutil
import tempfile

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
    EmergencyActivityEvent,
    EmergencyTrustedContact,
    EmergencyUnlockRequest,
)

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-emergency-protocol-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


def meta_url(token):
    return f"/api/v1/share/emergency-packs/{token}/"


def request_url(token):
    return f"/api/v1/share/emergency-packs/{token}/request/"


def request_status_url(token, request_token):
    return f"/api/v1/share/emergency-packs/{token}/request/{request_token}/"


def preview_url(token, item_id):
    return f"/api/v1/share/emergency-packs/{token}/items/{item_id}/preview/"


def download_url(token, item_id):
    return f"/api/v1/share/emergency-packs/{token}/items/{item_id}/download/"


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class EmergencyUnlockFlowTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.owner, title="Passport")
        self.secret_doc = Document.objects.create(owner=self.owner, title="Secret")
        upload = make_pdf()
        self.file = DocumentFile.objects.create(
            document=self.doc,
            uploaded_by=self.owner,
            file=upload,
            original_filename=upload.name,
            content_type=upload.content_type,
            file_size=upload.size,
        )

    def _make_pack(self, unlock_mode, **kwargs):
        pack = EmergencyAccessPack.objects.create(
            owner=self.owner,
            title="If something happens",
            status=EmergencyAccessPack.Status.ACTIVE,
            access_mode=EmergencyAccessPack.AccessMode.SHARE_LINK,
            unlock_mode=unlock_mode,
            token=kwargs.pop("token", f"tok-{unlock_mode}"),
            **kwargs,
        )
        EmergencyAccessPackItem.objects.create(
            owner=self.owner, pack=pack, document=self.doc, file=self.file
        )
        return pack

    def _consume(self, response):
        if getattr(response, "streaming", False):
            b"".join(response.streaming_content)
            response.close()
        return response

    # ---- Gating: items hidden until unlocked --------------------------------

    def test_owner_approval_pack_hides_items_before_request(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.OWNER_APPROVAL)
        resp = self.client.get(meta_url(pack.token))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["access_state"], "request_required")
        self.assertEqual(resp.data["items"], [])

    def test_item_preview_blocked_without_unlock(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.OWNER_APPROVAL)
        item = pack.items.first()
        resp = self.client.get(preview_url(pack.token, item.id))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "locked")

    def test_owner_approval_flow_unlocks_after_approve(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.OWNER_APPROVAL)
        item = pack.items.first()
        # Public request.
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Sister"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        request_token = resp.data["request_token"]

        # Still locked while pending.
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(status_resp.data["request"]["status"], "pending")
        self.assertEqual(status_resp.data["items"], [])

        # Owner approves.
        self.client.force_authenticate(self.owner)
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        approve = self.client.post(
            f"/api/v1/emergency-packs/{pack.id}/unlock-requests/{req.id}/approve/"
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data["status"], "unlocked")
        self.client.force_authenticate(None)

        # Now items + preview/download are available with the request token.
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(status_resp.data["request"]["status"], "unlocked")
        self.assertEqual(len(status_resp.data["items"]), 1)
        preview = self._consume(
            self.client.get(
                preview_url(pack.token, item.id),
                HTTP_X_REQUEST_TOKEN=request_token,
            )
        )
        self.assertEqual(preview.status_code, status.HTTP_200_OK)

    def test_delayed_unlock_opens_after_delay(self):
        pack = self._make_pack(
            EmergencyAccessPack.UnlockMode.DELAYED, unlock_delay_hours=24
        )
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Friend"}, format="json"
        )
        self.assertEqual(resp.data["status"], "countdown")
        request_token = resp.data["request_token"]

        # Before the delay elapses, still locked.
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(status_resp.data["items"], [])

        # Move the unlock time into the past to simulate the elapsed countdown.
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        req.unlock_at = timezone.now() - timezone.timedelta(minutes=1)
        req.save(update_fields=["unlock_at"])

        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(status_resp.data["request"]["status"], "unlocked")
        self.assertEqual(len(status_resp.data["items"]), 1)

    def test_owner_deny_keeps_documents_locked(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.DELAYED)
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Stranger"}, format="json"
        )
        request_token = resp.data["request_token"]
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)

        self.client.force_authenticate(self.owner)
        self.client.post(
            f"/api/v1/emergency-packs/{pack.id}/unlock-requests/{req.id}/deny/"
        )
        self.client.force_authenticate(None)

        # Even past the original unlock time, a denied request never opens.
        req.refresh_from_db()
        self.assertEqual(req.status, EmergencyUnlockRequest.Status.DENIED)
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(status_resp.data["items"], [])

    def test_wrong_access_code_blocks_request(self):
        pack = self._make_pack(
            EmergencyAccessPack.UnlockMode.OWNER_APPROVAL,
            access_code_required=True,
            access_code_hash=make_password("DN-123456"),
        )
        resp = self.client.post(
            request_url(pack.token),
            {"requester_name": "Sister", "access_code": "wrong"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "wrong_code")
        self.assertFalse(EmergencyUnlockRequest.objects.filter(pack=pack).exists())

    def test_downloads_disabled_blocks_download(self):
        pack = self._make_pack(
            EmergencyAccessPack.UnlockMode.OWNER_APPROVAL, allow_downloads=False
        )
        item = pack.items.first()
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Sister"}, format="json"
        )
        request_token = resp.data["request_token"]
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        req.status = EmergencyUnlockRequest.Status.UNLOCKED
        req.save(update_fields=["status"])

        download = self.client.get(
            download_url(pack.token, item.id), HTTP_X_REQUEST_TOKEN=request_token
        )
        self.assertEqual(download.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(download.data["state"], "downloads_disabled")

    # ---- Privacy: full vault never exposed ----------------------------------

    def test_secret_document_never_exposed(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.OWNER_APPROVAL)
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Sister"}, format="json"
        )
        request_token = resp.data["request_token"]
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        req.status = EmergencyUnlockRequest.Status.UNLOCKED
        req.save(update_fields=["status"])
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        titles = [i["title"] for i in status_resp.data["items"]]
        self.assertIn("Passport", titles)
        self.assertNotIn("Secret", titles)

    # ---- Location: off by default, revealed only after unlock ---------------

    def test_location_off_by_default_not_revealed(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.OWNER_APPROVAL)
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Sister"}, format="json"
        )
        request_token = resp.data["request_token"]
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        req.status = EmergencyUnlockRequest.Status.UNLOCKED
        req.save(update_fields=["status"])
        status_resp = self.client.get(request_status_url(pack.token, request_token))
        self.assertIsNone(status_resp.data["location"])

    def test_location_revealed_only_after_unlock_and_hides_precise_coords(self):
        pack = self._make_pack(
            EmergencyAccessPack.UnlockMode.OWNER_APPROVAL,
            location_enabled=True,
            location_precision=EmergencyAccessPack.LocationPrecision.APPROXIMATE,
            last_known_location={"label": "Berlin", "lat": 52.52, "lng": 13.40},
            last_known_location_at=timezone.now(),
        )
        # Before unlock: hidden.
        before = self.client.get(meta_url(pack.token))
        self.assertIsNone(before.data["location"])
        # After unlock: shown, but approximate hides exact coordinates.
        resp = self.client.post(
            request_url(pack.token), {"requester_name": "Sister"}, format="json"
        )
        request_token = resp.data["request_token"]
        req = EmergencyUnlockRequest.objects.get(request_token=request_token)
        req.status = EmergencyUnlockRequest.Status.UNLOCKED
        req.save(update_fields=["status"])
        after = self.client.get(request_status_url(pack.token, request_token))
        self.assertEqual(after.data["location"]["label"], "Berlin")
        self.assertIsNone(after.data["location"]["lat"])
        self.assertIsNone(after.data["location"]["lng"])

    # ---- Activity log -------------------------------------------------------

    def test_activity_records_request_and_unlock(self):
        pack = self._make_pack(EmergencyAccessPack.UnlockMode.DELAYED)
        self.client.get(meta_url(pack.token))  # scan
        self.client.post(
            request_url(pack.token), {"requester_name": "Friend"}, format="json"
        )
        events = set(
            pack.activity_events.values_list("event_type", flat=True)
        )
        self.assertIn(EmergencyActivityEvent.EventType.QR_SCANNED, events)
        self.assertIn(EmergencyActivityEvent.EventType.REQUEST_SUBMITTED, events)
        self.assertIn(EmergencyActivityEvent.EventType.COUNTDOWN_STARTED, events)


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class EmergencyOwnerEndpointsTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner2", email="o2@example.com", password="StrongPassword123!DN"
        )
        self.other = User.objects.create_user(
            username="intruder", email="x@example.com", password="StrongPassword123!DN"
        )
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.owner, title="Pack", status=EmergencyAccessPack.Status.DRAFT
        )

    def test_create_pack_defaults_to_delayed_unlock(self):
        # A fresh owner with no existing packs (avoids the free-plan pack limit).
        fresh = User.objects.create_user(
            username="fresh", email="fresh@example.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(fresh)
        resp = self.client.post(
            "/api/v1/emergency-packs/", {"title": "New pack"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["unlock_mode"], "delayed")

    def test_trusted_contact_crud(self):
        self.client.force_authenticate(self.owner)
        create = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/contacts/",
            {"name": "Mum", "relationship": "parent", "is_primary": True},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        contact_id = create.data["id"]
        listing = self.client.get(
            f"/api/v1/emergency-packs/{self.pack.id}/contacts/"
        )
        self.assertEqual(len(listing.data), 1)
        delete = self.client.delete(
            f"/api/v1/emergency-packs/{self.pack.id}/contacts/{contact_id}/"
        )
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EmergencyTrustedContact.objects.filter(pack=self.pack).exists())

    def test_other_user_cannot_touch_pack(self):
        self.client.force_authenticate(self.other)
        resp = self.client.get(
            f"/api/v1/emergency-packs/{self.pack.id}/contacts/"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_location_toggle_and_update(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            f"/api/v1/emergency-packs/{self.pack.id}/location/",
            {"location_enabled": True, "label": "Home", "lat": 1.0, "lng": 2.0},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["location_enabled"])
        self.pack.refresh_from_db()
        self.assertEqual(self.pack.last_known_location["label"], "Home")
        self.assertIn(
            EmergencyActivityEvent.EventType.LOCATION_TOGGLED,
            set(self.pack.activity_events.values_list("event_type", flat=True)),
        )
