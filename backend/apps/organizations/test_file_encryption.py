"""
SEC-002 regression tests: organization files & public submissions are encrypted
at rest, served only through authorized scoped views, and never as raw URLs.
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
    DocumentRequestSubmission,
    Organization,
    OrganizationDocument,
    OrganizationDocumentFile,
    OrganizationMembership,
    generate_org_token,
)

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-orgenc-test-")
_PLAINTEXT = b"%PDF-1.4 sensitive passport scan"


def make_pdf(name="passport.pdf", content=_PLAINTEXT):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA, CLAMD_ENABLED=False)
class OrgFileEncryptionTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def _user(self, name):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com",
            password="StrongPassword123!DN",
        )

    def setUp(self):
        self.owner = self._user("owner")
        self.member = self._user("member")
        self.outsider = self._user("outsider")
        self.org = Organization.objects.create(name="Club", created_by=self.owner)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.owner,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        OrganizationMembership.objects.create(
            organization=self.org, user=self.member,
            role=OrganizationMembership.Role.MEMBER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        self.doc = OrganizationDocument.objects.create(
            organization=self.org, created_by=self.owner, title="Passport"
        )

    def _upload(self):
        self.client.force_authenticate(self.owner)
        return self.client.post(
            f"/api/v1/organizations/{self.org.id}/documents/{self.doc.id}/files/",
            {"file": make_pdf()}, format="multipart",
        )

    def test_uploaded_org_file_is_encrypted_at_rest(self):
        resp = self._upload()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        df = OrganizationDocumentFile.objects.get(id=resp.data["id"])
        self.assertTrue(df.is_encrypted)
        with df.file.open("rb") as fh:
            stored = fh.read()
        # Ciphertext on disk must NOT equal the plaintext.
        self.assertNotIn(b"passport scan", stored)
        self.assertNotEqual(stored, _PLAINTEXT)

    def test_member_can_download_and_decrypt(self):
        up = self._upload()
        df_id = up.data["id"]
        self.client.force_authenticate(self.member)
        resp = self.client.get(
            f"/api/v1/organizations/{self.org.id}"
            f"/documents/{self.doc.id}/files/{df_id}/download/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = b"".join(resp.streaming_content)
        resp.close()
        self.assertEqual(body, _PLAINTEXT)

    def test_outsider_cannot_download(self):
        up = self._upload()
        df_id = up.data["id"]
        self.client.force_authenticate(self.outsider)
        resp = self.client.get(
            f"/api/v1/organizations/{self.org.id}"
            f"/documents/{self.doc.id}/files/{df_id}/download/"
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_other_org_member_cannot_reach_file(self):
        up = self._upload()
        df_id = up.data["id"]
        # A second org whose owner is the outsider.
        other = Organization.objects.create(name="Other", created_by=self.outsider)
        OrganizationMembership.objects.create(
            organization=other, user=self.outsider,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        self.client.force_authenticate(self.outsider)
        resp = self.client.get(
            f"/api/v1/organizations/{other.id}"
            f"/documents/{self.doc.id}/files/{df_id}/download/"
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_serializer_exposes_scoped_download_url_not_raw_path(self):
        up = self._upload()
        self.assertIn("download_url", up.data)
        self.assertTrue(up.data["download_url"].startswith("/api/v1/organizations/"))
        self.assertNotIn("file", up.data)

    def test_public_submission_is_encrypted_and_downloadable_by_reviewer(self):
        req = DocumentRequest.objects.create(
            organization=self.org, title="Send ID",
            public_upload_token=generate_org_token(),
            public_upload_expires_at=timezone.now() + timedelta(days=3),
        )
        self.client.force_authenticate(None)
        sub_resp = self.client.post(
            f"/api/v1/public/document-requests/{req.public_upload_token}/upload/",
            {"file": make_pdf("id.pdf")}, format="multipart",
        )
        self.assertEqual(sub_resp.status_code, status.HTTP_201_CREATED)
        submission = DocumentRequestSubmission.objects.get(request=req)
        self.assertTrue(submission.is_encrypted)
        with submission.file.open("rb") as fh:
            self.assertNotIn(b"passport scan", fh.read())
        # Reviewer (owner) can download + decrypt.
        self.client.force_authenticate(self.owner)
        dl = self.client.get(
            f"/api/v1/organizations/{self.org.id}"
            f"/document-requests/{req.id}/submissions/{submission.id}/download/"
        )
        self.assertEqual(dl.status_code, status.HTTP_200_OK)
        body = b"".join(dl.streaming_content)
        dl.close()
        self.assertEqual(body, _PLAINTEXT)


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class LegacyOrgFileMigrationTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def test_legacy_plaintext_file_can_be_detected_and_encrypted(self):
        from django.core.management import call_command
        from io import StringIO

        owner = User.objects.create_user(
            username="o2", email="o2@example.com", password="StrongPassword123!DN"
        )
        org = Organization.objects.create(name="Legacy", created_by=owner)
        doc = OrganizationDocument.objects.create(
            organization=org, created_by=owner, title="Old"
        )
        # Simulate a legacy plaintext row (is_encrypted=False, raw bytes stored).
        legacy = OrganizationDocumentFile.objects.create(
            organization=org, document=doc, uploaded_by=owner,
            file=make_pdf("legacy.pdf"), original_filename="legacy.pdf",
            content_type="application/pdf", file_size=len(_PLAINTEXT),
            is_encrypted=False,
        )
        out = StringIO()
        call_command("encrypt_legacy_org_files", "--dry-run", stdout=out)
        self.assertIn("would encrypt", out.getvalue())

        out = StringIO()
        call_command("encrypt_legacy_org_files", "--confirm", stdout=out)
        legacy.refresh_from_db()
        self.assertTrue(legacy.is_encrypted)
        with legacy.file.open("rb") as fh:
            self.assertNotIn(b"passport scan", fh.read())
        # And it still decrypts back to the original.
        from .file_encryption import read_org_document_file
        self.assertEqual(read_org_document_file(legacy), _PLAINTEXT)
