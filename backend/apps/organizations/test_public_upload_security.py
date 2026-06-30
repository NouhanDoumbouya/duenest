"""
SEC-003 regression tests: public document-request upload hardening
(validation, malware scan, per-request caps). Throttle wiring is covered by the
``get_throttles`` POST-only behaviour and the DRF throttle settings.
"""

import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    DocumentRequest,
    Organization,
    OrganizationMembership,
    generate_org_token,
)

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-puptest-")


def upload_url(token):
    return f"/api/v1/public/document-requests/{token}/upload/"


@override_settings(MEDIA_ROOT=_TEMP_MEDIA, CLAMD_ENABLED=False)
class PublicUploadSecurityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username="orgowner", email="o@example.com", password="StrongPassword123!DN"
        )
        self.org = Organization.objects.create(name="Club", created_by=self.owner)
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        self.req = DocumentRequest.objects.create(
            organization=self.org,
            title="Upload your passport",
            public_upload_token=generate_org_token(),
            public_upload_expires_at=timezone.now() + timedelta(days=7),
        )

    def test_valid_pdf_upload_accepted(self):
        f = SimpleUploadedFile("p.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token), {"file": f}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # No raw storage path is exposed in the response.
        self.assertNotIn("file", resp.data)

    def test_content_extension_mismatch_rejected(self):
        evil = SimpleUploadedFile(
            "x.png", b"<html>bad</html>", content_type="image/png"
        )
        resp = self.client.post(
            upload_url(self.req.public_upload_token), {"file": evil}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disallowed_extension_rejected(self):
        f = SimpleUploadedFile("x.exe", b"MZbad", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token), {"file": f}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_link_rejected(self):
        self.req.public_upload_expires_at = timezone.now() - timedelta(hours=1)
        self.req.save(update_fields=["public_upload_expires_at"])
        f = SimpleUploadedFile("p.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token), {"file": f}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS=1)
    def test_submission_cap_enforced(self):
        url = upload_url(self.req.public_upload_token)
        first = self.client.post(
            url, {"file": SimpleUploadedFile("a.pdf", b"%PDF-1.4 a",
                                             content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post(
            url, {"file": SimpleUploadedFile("b.pdf", b"%PDF-1.4 b",
                                             content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @override_settings(CLAMD_ENABLED=True, CLAMD_FAIL_CLOSED=True)
    def test_fails_closed_when_scanner_unavailable(self):
        f = SimpleUploadedFile("p.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token), {"file": f}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_submitter_email_and_notes_are_validated_and_bounded(self):
        # SEC-017: an anonymous submitter cannot store an oversized notes blob or
        # an invalid email. Invalid email falls back to the request recipient.
        from .models import DocumentRequestSubmission

        self.req.recipient_email = "recipient@example.com"
        self.req.save(update_fields=["recipient_email"])
        f = SimpleUploadedFile("p.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token),
            {"file": f, "email": "not-an-email", "notes": "x" * 5000},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        sub = DocumentRequestSubmission.objects.get(request=self.req)
        self.assertEqual(sub.submitted_by_email, "recipient@example.com")  # fallback
        self.assertLessEqual(len(sub.notes), 1000)

    def test_valid_submitter_email_and_notes_are_stored(self):
        from .models import DocumentRequestSubmission

        f = SimpleUploadedFile("p.pdf", b"%PDF-1.4 hi", content_type="application/pdf")
        resp = self.client.post(
            upload_url(self.req.public_upload_token),
            {"file": f, "email": "submitter@example.com", "notes": "Here is my passport."},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        sub = DocumentRequestSubmission.objects.get(request=self.req)
        self.assertEqual(sub.submitted_by_email, "submitter@example.com")
        self.assertEqual(sub.notes, "Here is my passport.")
