"""Personal external (non-DueNest) document collection: gate + public upload."""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.features.models import FeatureFlag, Visibility
from apps.users import plans

from .file_encryption import read_share_submission_file
from .models import ShareRequest, ShareRequestSubmission

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-share-ext-")

_MARKER = b"SECRET-MARKER-XYZ"


def _pdf():
    return SimpleUploadedFile(
        "doc.pdf", b"%PDF-1.4 " + _MARKER + b" trailer", content_type="application/pdf"
    )


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class ExternalShareUploadTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        FeatureFlag.objects.update_or_create(
            key="share_requests", defaults={"visibility": Visibility.ENABLED}
        )
        self.free = User.objects.create_user(
            username="free", email="free@x.com", password="StrongPassword123!DN"
        )
        self.pro = User.objects.create_user(
            username="pro", email="pro@x.com", password="StrongPassword123!DN"
        )
        self.pro.plan = plans.PLAN_PRO_PLACEHOLDER
        self.pro.save(update_fields=["plan"])

    def _create(self, user, *, external):
        self.client.force_authenticate(user)
        resp = self.client.post(
            "/api/v1/share-requests/",
            {
                "title": "Rental application",
                "allow_external_upload": external,
                "items": [{"label": "Payslip", "is_required": True}],
            },
            format="json",
        )
        self.client.force_authenticate(None)
        return resp

    def _upload_url(self, token):
        return f"/api/v1/public/share-requests/{token}/upload/"

    def test_free_user_cannot_enable_external_upload(self):
        resp = self._create(self.free, external=True)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data.get("code"), "plan_limit_exceeded")

    def test_pro_user_can_enable_external_upload(self):
        resp = self._create(self.pro, external=True)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["allow_external_upload"])

    def test_public_upload_encrypts_at_rest(self):
        token = self._create(self.pro, external=True).data["token"]
        resp = self.client.post(
            self._upload_url(token),
            {"file": _pdf(), "email": "applicant@x.com"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        submission = ShareRequestSubmission.objects.get(request__token=token)
        self.assertTrue(submission.is_encrypted)
        self.assertEqual(submission.submitted_by_email, "applicant@x.com")
        # Stored bytes are ciphertext (the plaintext marker must be absent)...
        with submission.file.open("rb") as fh:
            stored = fh.read()
        self.assertNotIn(_MARKER, stored)
        # ...but decrypt round-trips for the owner.
        self.assertIn(_MARKER, read_share_submission_file(submission))

    def test_public_upload_rejected_when_not_external(self):
        # A normal (non-external) request must not accept anonymous uploads.
        token = self._create(self.pro, external=False).data["token"]
        resp = self.client.post(
            self._upload_url(token), {"file": _pdf()}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_upload_rejects_disallowed_file_type(self):
        token = self._create(self.pro, external=True).data["token"]
        bad = SimpleUploadedFile("x.txt", b"hello", content_type="text/plain")
        resp = self.client.post(
            self._upload_url(token), {"file": bad}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_downloads_submission_non_owner_blocked(self):
        created = self._create(self.pro, external=True).data
        token, request_id = created["token"], created["id"]
        self.client.post(
            self._upload_url(token), {"file": _pdf()}, format="multipart"
        )
        submission = ShareRequestSubmission.objects.get(request__token=token)
        url = (
            f"/api/v1/share-requests/{request_id}"
            f"/submissions/{submission.id}/download/"
        )
        # Owner can download (decrypted).
        self.client.force_authenticate(self.pro)
        ok = self.client.get(url)
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn(_MARKER, b"".join(ok.streaming_content))
        # A different user cannot.
        self.client.force_authenticate(self.free)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
