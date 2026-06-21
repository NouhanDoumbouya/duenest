import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document, DocumentFile
from apps.features.models import FeatureFlag, Visibility
from apps.notifications.models import Notification
from apps.quick_share.models import QuickShareClaim, QuickShareSession

from .models import ShareRequest, ShareRequestItem

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp()


def make_pdf(name="doc.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class ShareRequestBaseTest(APITestCase):
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
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf("payslip.pdf"),
            original_filename="payslip.pdf",
            content_type="application/pdf",
            file_size=13,
        )
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.alice_file = DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf("alice.pdf"),
            original_filename="alice.pdf",
            content_type="application/pdf",
            file_size=13,
        )

    def enable_flag(self):
        FeatureFlag.objects.update_or_create(
            key="share_requests", defaults={"visibility": Visibility.ENABLED}
        )

    def make_request(self, *, required=True):
        """Alice creates a request with one item via the API."""
        self.enable_flag()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/share-requests/",
            {
                "title": "Rental application",
                "message": "Please provide these.",
                "items": [{"label": "Payslip", "is_required": required}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.client.force_authenticate(None)
        return resp.data


class CreateRequestTests(ShareRequestBaseTest):
    def test_create_request_with_items(self):
        data = self.make_request()
        self.assertEqual(data["status"], "open")
        self.assertEqual(len(data["items"]), 1)
        self.assertTrue(data["token"])
        self.assertEqual(data["respond_path"], f"/request/{data['token']}")

    def test_create_requires_flag(self):
        # Pin the feature OFF (it now defaults to beta_only) so the
        # "blocked when paused" path is tested for a normal user.
        FeatureFlag.objects.update_or_create(
            key="share_requests", defaults={"visibility": Visibility.DISABLED}
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/share-requests/",
            {"title": "X", "items": [{"label": "Payslip"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_create_rejects_no_items(self):
        self.enable_flag()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/share-requests/",
            {"title": "X", "items": []},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class PublicMetadataTests(ShareRequestBaseTest):
    def test_metadata_exposes_checklist_only(self):
        data = self.make_request()
        # Public, no auth required.
        resp = self.client.get(f"/api/v1/share-requests/respond/{data['token']}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["requester_name"], "alice")
        self.assertEqual(resp.data["title"], "Rental application")
        self.assertTrue(resp.data["is_open"])
        self.assertEqual(len(resp.data["items"]), 1)
        # No vault / owner internals leak.
        self.assertNotIn("owner", resp.data)
        self.assertNotIn("token", resp.data)

    def test_unknown_token_404(self):
        resp = self.client.get("/api/v1/share-requests/respond/nope/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class FulfilmentTests(ShareRequestBaseTest):
    def _respond(self, token, item_id, file_ids):
        self.client.force_authenticate(self.bob)
        return self.client.post(
            f"/api/v1/share-requests/respond/{token}/submit/",
            {"items": [{"item_id": item_id, "file_ids": file_ids}]},
            format="json",
        )

    def test_fulfilment_delivers_to_requester_shared_with_me(self):
        data = self.make_request()
        item_id = data["items"][0]["id"]
        resp = self._respond(data["token"], item_id, [self.bob_file.id])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        # A session owned by bob with a pre-accepted claim for alice.
        session = QuickShareSession.objects.get(owner=self.bob)
        claim = QuickShareClaim.objects.get(session=session, receiver_user=self.alice)
        self.assertEqual(claim.status, QuickShareClaim.Status.ACCEPTED)

        # It surfaces in alice's Shared with me.
        self.client.force_authenticate(self.alice)
        swm = self.client.get("/api/v1/shared-with-me/")
        self.assertEqual(swm.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["id"] == claim.id for row in swm.data))

        # The request records the response and stays open; the requester is notified.
        share_request = ShareRequest.objects.get(id=data["id"])
        self.assertEqual(share_request.responses.count(), 1)
        self.assertTrue(share_request.is_open)
        self.assertTrue(
            Notification.objects.filter(
                user=self.alice, source_type="share_request"
            ).exists()
        )

    def test_cannot_attach_foreign_file(self):
        data = self.make_request()
        item_id = data["items"][0]["id"]
        resp = self._respond(data["token"], item_id, [self.alice_file.id])
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_required_item_must_be_filled(self):
        data = self.make_request(required=True)
        item_id = data["items"][0]["id"]
        resp = self._respond(data["token"], item_id, [])
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_respond_to_own_request(self):
        data = self.make_request()
        item_id = data["items"][0]["id"]
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            f"/api/v1/share-requests/respond/{data['token']}/submit/",
            {"items": [{"item_id": item_id, "file_ids": [self.alice_file.id]}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_respond_twice(self):
        data = self.make_request()
        item_id = data["items"][0]["id"]
        self.assertEqual(
            self._respond(data["token"], item_id, [self.bob_file.id]).status_code,
            status.HTTP_201_CREATED,
        )
        again = self._respond(data["token"], item_id, [self.bob_file.id])
        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)

    def test_closed_request_rejects_response(self):
        data = self.make_request()
        item_id = data["items"][0]["id"]
        self.client.force_authenticate(self.alice)
        self.client.post(f"/api/v1/share-requests/{data['id']}/")  # close
        resp = self._respond(data["token"], item_id, [self.bob_file.id])
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
