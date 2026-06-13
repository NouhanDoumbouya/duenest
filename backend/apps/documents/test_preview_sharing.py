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

from .models import Document, DocumentFile, DocumentFileActivity, DocumentFileShareLink

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-preview-test-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


def make_png(name="scan.png"):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n", content_type="image/png")


def make_jpeg(name="photo.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8\xff\xe0jpeg", content_type="image/jpeg")


def make_docx(name="cv.docx"):
    return SimpleUploadedFile(
        name,
        b"PK docx",
        content_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
    )


def preview_url(d, f):
    return f"/api/v1/documents/{d}/files/{f}/preview/"


def download_url(d, f):
    return f"/api/v1/documents/{d}/files/{f}/download/"


def share_links_url(d, f):
    return f"/api/v1/documents/{d}/files/{f}/share-links/"


def share_link_url(d, f, s):
    return f"/api/v1/documents/{d}/files/{f}/share-links/{s}/"


def revoke_url(d, f, s):
    return f"/api/v1/documents/{d}/files/{f}/share-links/{s}/revoke/"


def activity_url(d, f):
    return f"/api/v1/documents/{d}/files/{f}/activity/"


def public_meta(t):
    return f"/api/v1/share/files/{t}/"


def public_verify(t):
    return f"/api/v1/share/files/{t}/verify-code/"


def public_preview(t):
    return f"/api/v1/share/files/{t}/preview/"


def public_download(t):
    return f"/api/v1/share/files/{t}/download/"


def future():
    return (timezone.now() + timedelta(days=7)).isoformat()


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class PreviewSharingBaseTest(APITestCase):
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
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")

    def upload(self, document, owner, upload):
        return DocumentFile.objects.create(
            document=document,
            uploaded_by=owner,
            file=upload,
            original_filename=upload.name,
            content_type=upload.content_type,
            file_size=upload.size,
        )

    def consume(self, response):
        """Drain a streaming FileResponse so the test does not leak handles."""
        if getattr(response, "streaming", False):
            b"".join(response.streaming_content)
            response.close()
        return response


class PreviewTests(PreviewSharingBaseTest):
    def test_anonymous_cannot_preview(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.assertEqual(
            self.client.get(preview_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_owner_can_preview_pdf_jpeg_png(self):
        self.client.force_authenticate(self.alice)
        for upload in (make_pdf(), make_jpeg(), make_png()):
            f = self.upload(self.alice_doc, self.alice, upload)
            resp = self.consume(
                self.client.get(preview_url(self.alice_doc.id, f.id))
            )
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertEqual(resp["Content-Type"], upload.content_type)
            self.assertIn("inline", resp["Content-Disposition"])

    def test_cannot_preview_other_users_file(self):
        f = self.upload(self.bob_doc, self.bob, make_pdf())
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get(preview_url(self.bob_doc.id, f.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_cannot_preview_file_through_another_users_document_id(self):
        f = self.upload(self.bob_doc, self.bob, make_pdf())
        self.client.force_authenticate(self.alice)
        # Alice's own doc id with Bob's file id -> not in queryset -> 404.
        self.assertEqual(
            self.client.get(preview_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_unsupported_docx_preview_rejected(self):
        f = self.upload(self.alice_doc, self.alice, make_docx())
        self.client.force_authenticate(self.alice)
        resp = self.client.get(preview_url(self.alice_doc.id, f.id))
        self.assertEqual(resp.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        self.assertIn("Preview is not available", resp.data["detail"])

    def test_preview_requires_supported_content_type_and_extension(self):
        spoofed = SimpleUploadedFile(
            "passport.exe",
            b"%PDF-1.4 fake",
            content_type="application/pdf",
        )
        f = self.upload(self.alice_doc, self.alice, spoofed)
        self.client.force_authenticate(self.alice)
        resp = self.client.get(preview_url(self.alice_doc.id, f.id))
        self.assertEqual(resp.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_missing_physical_file_returns_clean_404(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        f.file.storage.delete(f.file.name)
        self.client.force_authenticate(self.alice)
        resp = self.client.get(preview_url(self.alice_doc.id, f.id))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("no longer available", resp.data["detail"])

    def test_download_still_works(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.client.force_authenticate(self.alice)
        resp = self.consume(self.client.get(download_url(self.alice_doc.id, f.id)))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", resp["Content-Disposition"])


class ShareLinkTests(PreviewSharingBaseTest):
    def make_file(self, doc=None, owner=None, upload=None):
        return self.upload(
            doc or self.alice_doc, owner or self.alice, upload or make_pdf()
        )

    def test_owner_can_create_share_link(self):
        f = self.make_file()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            share_links_url(self.alice_doc.id, f.id),
            {"permission": "view_only", "expires_at": future()},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["token"])
        self.assertEqual(DocumentFileShareLink.objects.count(), 1)

    def test_cannot_create_share_link_for_other_users_file(self):
        f = self.make_file(self.bob_doc, self.bob)
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            share_links_url(self.bob_doc.id, f.id),
            {"permission": "view_only", "expires_at": future()},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DocumentFileShareLink.objects.count(), 0)

    def test_token_is_securely_generated(self):
        f = self.make_file()
        self.client.force_authenticate(self.alice)
        tokens = set()
        for _ in range(3):
            resp = self.client.post(
                share_links_url(self.alice_doc.id, f.id),
                {"permission": "view_only", "expires_at": future()},
                format="json",
            )
            tokens.add(resp.data["token"])
            self.assertGreaterEqual(len(resp.data["token"]), 30)
        self.assertEqual(len(tokens), 3)  # unique, not sequential

    def test_owner_can_list_and_revoke(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.client.force_authenticate(self.alice)
        listed = self.client.get(share_links_url(self.alice_doc.id, f.id))
        self.assertEqual(len(listed.data), 1)

        revoked = self.client.post(revoke_url(self.alice_doc.id, f.id, link.id))
        self.assertEqual(revoked.status_code, status.HTTP_200_OK)
        self.assertEqual(revoked.data["status"], "revoked")
        link.refresh_from_db()
        self.assertIsNotNone(link.revoked_at)

    def test_revoked_link_cannot_be_used(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() + timedelta(days=1),
            revoked_at=timezone.now(),
        )
        resp = self.client.get(public_meta(link.token))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "revoked")

    def test_expired_link_cannot_be_used(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() - timedelta(days=1),
        )
        resp = self.client.get(public_meta(link.token))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "expired")

    def test_invalid_token_returns_clean_response(self):
        resp = self.client.get(public_meta("not-a-real-token"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data["state"], "invalid")

    def test_public_metadata_returns_safe_fields_only(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="view_only",
            expires_at=timezone.now() + timedelta(days=1),
            label="secret label", recipient_email="r@x.com", purpose="secret purpose",
        )
        data = self.client.get(public_meta(link.token)).data
        self.assertEqual(
            set(data.keys()),
            {
                "file_name", "content_type", "file_size", "permission",
                "expires_at", "is_previewable", "download_allowed",
                "access_code_required",
            },
        )
        body = str(data)
        self.assertNotIn("secret label", body)
        self.assertNotIn("r@x.com", body)
        self.assertNotIn("secret purpose", body)

    def test_view_only_can_preview_but_not_download(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="view_only",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.assertEqual(
            self.consume(self.client.get(public_preview(link.token))).status_code,
            status.HTTP_200_OK,
        )
        denied = self.client.get(public_download(link.token))
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(denied.data["state"], "download_not_allowed")

    def test_download_allowed_can_download(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="download_allowed",
            expires_at=timezone.now() + timedelta(days=1),
        )
        resp = self.consume(self.client.get(public_download(link.token)))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", resp["Content-Disposition"])

    def test_unsupported_file_cannot_be_previewed_publicly(self):
        f = self.make_file(upload=make_docx())
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="download_allowed",
            expires_at=timezone.now() + timedelta(days=1),
        )
        resp = self.client.get(public_preview(link.token))
        self.assertEqual(resp.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_deleted_file_breaks_shared_access(self):
        f = self.make_file()
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() + timedelta(days=1),
        )
        token = link.token
        f.delete()  # cascades to the share link
        self.assertEqual(
            self.client.get(public_meta(token)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_other_user_still_cannot_access_private_file_endpoint(self):
        f = self.make_file()
        DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="download_allowed",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(download_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )


class AccessCodeTests(PreviewSharingBaseTest):
    def make_coded_link(self, permission="view_only", code="482913"):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            share_links_url(self.alice_doc.id, f.id),
            {
                "permission": permission,
                "expires_at": future(),
                "access_code_required": True,
                "access_code": code,
            },
            format="json",
        )
        self.client.force_authenticate(None)
        return f, resp

    def test_create_with_access_code_and_not_stored_plaintext(self):
        f, resp = self.make_coded_link(code="482913")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["access_code"], "482913")  # returned once
        link = DocumentFileShareLink.objects.get(id=resp.data["id"])
        self.assertNotEqual(link.access_code_hash, "482913")
        self.assertTrue(check_password("482913", link.access_code_hash))

    def test_generated_code_when_required_without_code(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            share_links_url(self.alice_doc.id, f.id),
            {"permission": "view_only", "expires_at": future(),
             "access_code_required": True},
            format="json",
        )
        self.assertEqual(len(resp.data["access_code"]), 6)

    def test_requires_code_before_metadata_and_preview(self):
        _, resp = self.make_coded_link()
        token = DocumentFileShareLink.objects.get(id=resp.data["id"]).token
        meta = self.client.get(public_meta(token))
        self.assertEqual(meta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(meta.data["access_code_required"])
        # With the correct code header, metadata unlocks.
        ok = self.client.get(public_meta(token), HTTP_X_ACCESS_CODE="482913")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_wrong_code_rejected(self):
        _, resp = self.make_coded_link()
        token = DocumentFileShareLink.objects.get(id=resp.data["id"]).token
        self.assertEqual(
            self.client.post(public_verify(token), {"access_code": "000000"},
                             format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.get(public_preview(token),
                            HTTP_X_ACCESS_CODE="000000").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_correct_code_allows_preview(self):
        _, resp = self.make_coded_link(permission="view_only")
        token = DocumentFileShareLink.objects.get(id=resp.data["id"]).token
        self.assertEqual(
            self.consume(self.client.get(public_preview(token),
                         HTTP_X_ACCESS_CODE="482913")).status_code,
            status.HTTP_200_OK,
        )

    def test_correct_code_download_only_when_allowed(self):
        _, view_resp = self.make_coded_link(permission="view_only")
        view_token = DocumentFileShareLink.objects.get(id=view_resp.data["id"]).token
        self.assertEqual(
            self.client.get(public_download(view_token),
                            HTTP_X_ACCESS_CODE="482913").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        _, dl_resp = self.make_coded_link(permission="download_allowed")
        dl_token = DocumentFileShareLink.objects.get(id=dl_resp.data["id"]).token
        self.assertEqual(
            self.consume(self.client.get(public_download(dl_token),
                         HTTP_X_ACCESS_CODE="482913")).status_code,
            status.HTTP_200_OK,
        )

    def test_expired_and_revoked_stay_blocked_even_with_correct_code(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        from django.contrib.auth.hashers import make_password
        expired = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() - timedelta(days=1),
            access_code_required=True, access_code_hash=make_password("482913"),
        )
        revoked = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() + timedelta(days=1), revoked_at=timezone.now(),
            access_code_required=True, access_code_hash=make_password("482913"),
        )
        self.assertEqual(
            self.client.get(public_preview(expired.token),
                            HTTP_X_ACCESS_CODE="482913").status_code,
            status.HTTP_410_GONE,
        )
        self.assertEqual(
            self.client.get(public_preview(revoked.token),
                            HTTP_X_ACCESS_CODE="482913").status_code,
            status.HTTP_410_GONE,
        )

    def test_access_code_not_returned_after_creation(self):
        f, resp = self.make_coded_link()
        sid = resp.data["id"]
        self.client.force_authenticate(self.alice)
        detail = self.client.get(share_link_url(self.alice_doc.id, f.id, sid))
        self.assertNotIn("access_code", detail.data)
        self.assertNotIn("access_code_hash", detail.data)


class AccessGrantTests(PreviewSharingBaseTest):
    """
    After verifying the access code, the viewer receives a short-lived grant and
    uses it (via ?grant=) to load metadata/preview/download — without the raw
    code ever being re-sent or stored. This is the fix for the access-code
    shared-file bug.
    """

    def make_coded_link(self, permission="view_only", code="482913"):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        from django.contrib.auth.hashers import make_password

        link = DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=f,
            permission=permission,
            expires_at=timezone.now() + timedelta(days=7),
            access_code_required=True,
            access_code_hash=make_password(code),
        )
        return f, link

    def verify(self, token, code="482913"):
        return self.client.post(
            public_verify(token), {"access_code": code}, format="json"
        )

    def test_verify_returns_grant(self):
        _, link = self.make_coded_link()
        resp = self.verify(link.token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("grant", resp.data)
        self.assertTrue(resp.data["grant"])
        self.assertGreater(resp.data["grant_expires_in"], 0)

    def test_grant_unlocks_metadata_preview_and_download(self):
        _, link = self.make_coded_link(permission="download_allowed")
        grant = self.verify(link.token).data["grant"]
        # Metadata
        meta = self.client.get(f"{public_meta(link.token)}?grant={grant}")
        self.assertEqual(meta.status_code, status.HTTP_200_OK)
        # Preview
        prev = self.consume(
            self.client.get(f"{public_preview(link.token)}?grant={grant}")
        )
        self.assertEqual(prev.status_code, status.HTTP_200_OK)
        # Download
        dl = self.consume(
            self.client.get(f"{public_download(link.token)}?grant={grant}")
        )
        self.assertEqual(dl.status_code, status.HTTP_200_OK)

    def test_grant_for_one_link_cannot_unlock_another(self):
        _, link_a = self.make_coded_link()
        _, link_b = self.make_coded_link()
        grant_a = self.verify(link_a.token).data["grant"]
        # The grant minted for link A must not unlock link B.
        resp = self.client.get(f"{public_preview(link_b.token)}?grant={grant_a}")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_grant_rejected(self):
        _, link = self.make_coded_link()
        resp = self.client.get(f"{public_preview(link.token)}?grant=not-a-real-grant")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_view_only_grant_still_blocks_download(self):
        _, link = self.make_coded_link(permission="view_only")
        grant = self.verify(link.token).data["grant"]
        resp = self.client.get(f"{public_download(link.token)}?grant={grant}")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_grant_blocked_on_revoked_link(self):
        _, link = self.make_coded_link()
        grant = self.verify(link.token).data["grant"]
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at"])
        resp = self.client.get(f"{public_preview(link.token)}?grant={grant}")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)


class ShareLabelTests(PreviewSharingBaseTest):
    def test_owner_sees_labels_but_other_user_cannot(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.client.force_authenticate(self.alice)
        created = self.client.post(
            share_links_url(self.alice_doc.id, f.id),
            {
                "permission": "view_only", "expires_at": future(),
                "label": "University visa office",
                "recipient_email": "visa@example.edu",
                "purpose": "Student pass renewal",
            },
            format="json",
        )
        self.assertEqual(created.data["label"], "University visa office")

        listed = self.client.get(share_links_url(self.alice_doc.id, f.id))
        self.assertEqual(listed.data[0]["purpose"], "Student pass renewal")

        # Bob cannot reach Alice's file's share links at all.
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(share_links_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )


class ActivityTests(PreviewSharingBaseTest):
    def file_with_auth(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.client.force_authenticate(self.alice)
        return f

    def test_owner_can_view_activity_other_user_cannot(self):
        f = self.file_with_auth()
        self.assertEqual(
            self.client.get(activity_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_200_OK,
        )
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(activity_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_preview_and_download_create_activity(self):
        f = self.file_with_auth()
        self.consume(self.client.get(preview_url(self.alice_doc.id, f.id)))
        self.consume(self.client.get(download_url(self.alice_doc.id, f.id)))
        actions = set(
            DocumentFileActivity.objects.filter(file=f).values_list("action", flat=True)
        )
        self.assertIn("file_previewed", actions)
        self.assertIn("file_downloaded", actions)

    def test_share_create_and_revoke_create_activity(self):
        f = self.file_with_auth()
        created = self.client.post(
            share_links_url(self.alice_doc.id, f.id),
            {"permission": "view_only", "expires_at": future()}, format="json",
        )
        self.client.post(revoke_url(self.alice_doc.id, f.id, created.data["id"]))
        actions = set(
            DocumentFileActivity.objects.filter(file=f).values_list("action", flat=True)
        )
        self.assertIn("share_created", actions)
        self.assertIn("share_revoked", actions)

    def test_shared_preview_download_create_activity(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            permission="download_allowed",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.client.get(public_meta(link.token))
        self.consume(self.client.get(public_preview(link.token)))
        self.consume(self.client.get(public_download(link.token)))
        actions = list(
            DocumentFileActivity.objects.filter(file=f).values_list("action", flat=True)
        )
        for expected in ("share_opened", "share_previewed", "share_downloaded"):
            self.assertIn(expected, actions)

    def test_public_viewer_cannot_access_activity_endpoint(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        self.assertEqual(
            self.client.get(activity_url(self.alice_doc.id, f.id)).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_access_code_failure_creates_activity(self):
        f = self.upload(self.alice_doc, self.alice, make_pdf())
        from django.contrib.auth.hashers import make_password
        link = DocumentFileShareLink.objects.create(
            owner=self.alice, document=self.alice_doc, file=f,
            expires_at=timezone.now() + timedelta(days=1),
            access_code_required=True, access_code_hash=make_password("482913"),
        )
        self.client.post(public_verify(link.token), {"access_code": "000000"},
                         format="json")
        self.assertTrue(
            DocumentFileActivity.objects.filter(
                file=f, action="share_access_code_failed"
            ).exists()
        )
