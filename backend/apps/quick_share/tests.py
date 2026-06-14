"""
Quick Share QR tests — focused on the security-critical access rules:

* token generation + uniqueness
* selected-files-only exposure (no vault leakage)
* expiry / revoke / one-time / max-claims enforcement
* access-code requirement + that the hash is never serialized
* view-only download blocked server-side; download allowed works
* save-copy gating + receiver-owned copy
* cross-account isolation (a receiver cannot reach unrelated files; a
  non-owner cannot revoke)
* sender-approval gating
* public payload never leaks internal paths / tokens / codes
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

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
)

from .models import QuickShareClaim, QuickShareItem, QuickShareSession

User = get_user_model()

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-qs-test-")


def make_pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake bytes", content_type="application/pdf")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class QuickShareBaseTest(APITestCase):
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
            file_size=18,
        )
        self.alice_file2 = DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf("visa.pdf"),
            original_filename="visa.pdf",
            content_type="application/pdf",
            file_size=18,
        )
        self.bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf("bob.pdf"),
            original_filename="bob.pdf",
            content_type="application/pdf",
            file_size=18,
        )

    def consume(self, response):
        if getattr(response, "streaming", False):
            b"".join(response.streaming_content)
            response.close()
        return response

    def make_session(self, owner=None, files=None, **kwargs):
        owner = owner or self.alice
        params = {
            "owner": owner,
            "mode": QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT,
            "permission": QuickShareSession.Permission.VIEW_ONLY,
            "expires_at": timezone.now() + timedelta(minutes=10),
        }
        params.update(kwargs)
        session = QuickShareSession.objects.create(**params)
        for order, file in enumerate(files or [self.alice_file]):
            QuickShareItem.objects.create(
                session=session, document=file.document, file=file, order=order
            )
        return session


class CreateSessionTests(QuickShareBaseTest):
    def test_create_generates_unique_token_and_hides_hash(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "mode": "account_to_account",
                "permission": "view_only",
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "file_ids": [self.alice_file.id],
                "access_code_required": True,
                "access_code": "778899",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("token", resp.data)
        self.assertTrue(len(resp.data["token"]) >= 20)
        # The plain access code is returned once for the owner to share, but the
        # hash is never exposed.
        self.assertEqual(resp.data["access_code"], "778899")
        self.assertNotIn("access_code_hash", resp.data)

        session = QuickShareSession.objects.get(id=resp.data["id"])
        self.assertNotEqual(session.access_code_hash, "")
        self.assertNotEqual(session.access_code_hash, "778899")

    def test_create_accepts_owner_inbox_file(self):
        inbox_file = DocumentFile.objects.create(
            uploaded_by=self.alice,
            file=make_pdf("inbox.pdf"),
            original_filename="inbox.pdf",
            content_type="application/pdf",
            file_size=18,
        )

        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "mode": "account_to_account",
                "permission": "view_only",
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "file_ids": [inbox_file.id],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        session = QuickShareSession.objects.get(id=resp.data["id"])
        self.assertEqual(session.items.get().file, inbox_file)

    def test_cannot_attach_another_users_file(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "file_ids": [self.bob_file.id],
            },
            format="json",
        )
        # Bob's file is silently skipped; with no valid files the create is rejected.
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expiry_must_be_future(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "expires_at": (timezone.now() - timedelta(minutes=1)).isoformat(),
                "file_ids": [self.alice_file.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ClaimMetadataTests(QuickShareBaseTest):
    def test_metadata_exposes_only_selected_files_no_secrets(self):
        session = self.make_session(files=[self.alice_file])
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["file_count"], 1)
        names = {f["name"] for f in resp.data["files"]}
        self.assertEqual(names, {"passport.pdf"})
        # No token, hash, or storage path leaks through the public payload.
        body = str(resp.data)
        self.assertNotIn("access_code_hash", body)
        self.assertNotIn(session.token, body)
        self.assertNotIn("/media/", body)
        self.assertNotIn("upload_to", body)

    def test_expired_session_blocked(self):
        session = self.make_session(expires_at=timezone.now() - timedelta(seconds=1))
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "expired")

    def test_revoked_session_blocked(self):
        session = self.make_session()
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "revoked")

    def test_access_code_required_blocks_without_code(self):
        session = self.make_session(
            access_code_required=True, access_code_hash=make_password("112233")
        )
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "requires_code")

    def test_wrong_access_code_rejected(self):
        session = self.make_session(
            access_code_required=True, access_code_hash=make_password("112233")
        )
        resp = self.client.post(
            f"/api/v1/quick-share/claim/{session.token}/verify-code/",
            {"access_code": "000000"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "wrong_code")

    def test_correct_access_code_accepted(self):
        session = self.make_session(
            access_code_required=True, access_code_hash=make_password("112233")
        )
        resp = self.client.post(
            f"/api/v1/quick-share/claim/{session.token}/verify-code/",
            {"access_code": "112233"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["ok"])


class AcceptFlowTests(QuickShareBaseTest):
    def test_accept_surfaces_in_shared_with_me(self):
        session = self.make_session()
        self.client.force_authenticate(self.bob)
        resp = self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        listing = self.client.get("/api/v1/shared-with-me/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]["sender_name"], "a")

    def test_owner_cannot_accept_own_share(self):
        session = self.make_session()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_decline_keeps_share_out_of_list(self):
        session = self.make_session()
        self.client.force_authenticate(self.bob)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/decline/")
        listing = self.client.get("/api/v1/shared-with-me/")
        self.assertEqual(len(listing.data), 0)

    def test_one_time_session_consumed_after_accept(self):
        session = self.make_session(one_time=True)
        self.client.force_authenticate(self.bob)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        session.refresh_from_db()
        self.assertEqual(session.status, QuickShareSession.Status.CONSUMED)

        # A second receiver is now blocked.
        carol = User.objects.create_user(
            username="carol", email="c@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(carol)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_max_claims_enforced(self):
        session = self.make_session(max_claims=1)
        self.client.force_authenticate(self.bob)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        carol = User.objects.create_user(
            username="carol", email="c@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(carol)
        resp = self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)


class SenderApprovalTests(QuickShareBaseTest):
    def test_approval_required_blocks_until_approved(self):
        session = self.make_session(require_sender_approval=True)
        self.client.force_authenticate(self.bob)
        accept = self.client.post(
            f"/api/v1/quick-share/claim/{session.token}/accept/"
        )
        self.assertEqual(accept.status_code, status.HTTP_200_OK)
        claim = QuickShareClaim.objects.get(session=session, receiver_user=self.bob)
        self.assertEqual(claim.approval, QuickShareClaim.Approval.PENDING)

        # Receiver cannot preview yet.
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Owner approves.
        self.client.force_authenticate(self.alice)
        approve = self.client.post(
            f"/api/v1/quick-share/sessions/{session.id}/approve-claim/",
            {"claim_id": claim.id},
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)

        # Now the receiver can preview.
        self.client.force_authenticate(self.bob)
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_denied_claim_blocks_access(self):
        session = self.make_session(require_sender_approval=True)
        self.client.force_authenticate(self.bob)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        claim = QuickShareClaim.objects.get(session=session, receiver_user=self.bob)
        self.client.force_authenticate(self.alice)
        self.client.post(
            f"/api/v1/quick-share/sessions/{session.id}/deny-claim/",
            {"claim_id": claim.id},
            format="json",
        )
        self.client.force_authenticate(self.bob)
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class FileAccessTests(QuickShareBaseTest):
    def _accept(self, session, user):
        self.client.force_authenticate(user)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")

    def test_view_only_blocks_download_serverside(self):
        session = self.make_session(permission=QuickShareSession.Permission.VIEW_ONLY)
        self._accept(session, self.bob)
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/download/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["state"], "download_not_allowed")

    def test_download_allowed_works(self):
        session = self.make_session(
            permission=QuickShareSession.Permission.DOWNLOAD_ALLOWED
        )
        self._accept(session, self.bob)
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/download/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_receiver_cannot_access_unrelated_file(self):
        session = self.make_session(files=[self.alice_file])
        self._accept(session, self.bob)
        # alice_file2 is NOT part of this session.
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file2.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_unaccepted_receiver_blocked(self):
        session = self.make_session()
        self.client.force_authenticate(self.bob)  # opens but does not accept
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class SaveCopyTests(QuickShareBaseTest):
    def _accept(self, session, user):
        self.client.force_authenticate(user)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")

    def test_save_copy_blocked_when_not_allowed(self):
        session = self.make_session(permission=QuickShareSession.Permission.VIEW_ONLY)
        self._accept(session, self.bob)
        resp = self.client.post(
            f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/save-copy/"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_save_copy_creates_receiver_owned_copy(self):
        session = self.make_session(
            permission=QuickShareSession.Permission.SAVE_COPY_ALLOWED
        )
        self._accept(session, self.bob)
        resp = self.client.post(
            f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/save-copy/"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        new_file = DocumentFile.objects.get(id=resp.data["file_id"])
        self.assertEqual(new_file.document.owner, self.bob)
        self.assertNotEqual(new_file.id, self.alice_file.id)
        self.assertEqual(new_file.original_filename, "passport.pdf")


class OwnerIsolationTests(QuickShareBaseTest):
    def test_non_owner_cannot_revoke(self):
        session = self.make_session(owner=self.alice)
        self.client.force_authenticate(self.bob)
        resp = self.client.post(
            f"/api/v1/quick-share/sessions/{session.id}/revoke/"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_revoke_blocks_receiver_immediately(self):
        session = self.make_session()
        self.client.force_authenticate(self.bob)
        self.client.post(f"/api/v1/quick-share/claim/{session.token}/accept/")
        # Owner revokes.
        self.client.force_authenticate(self.alice)
        self.client.post(f"/api/v1/quick-share/sessions/{session.id}/revoke/")
        # Receiver loses access.
        self.client.force_authenticate(self.bob)
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_non_owner_cannot_list_others_sessions(self):
        self.make_session(owner=self.alice)
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/v1/quick-share/sessions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)


class PublicModeTests(QuickShareBaseTest):
    def test_public_session_preview_without_account(self):
        session = self.make_session(
            mode=QuickShareSession.Mode.PUBLIC_SECURE_QR,
            permission=QuickShareSession.Permission.VIEW_ONLY,
        )
        # No authentication at all.
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/preview/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_public_view_only_blocks_download(self):
        session = self.make_session(
            mode=QuickShareSession.Mode.PUBLIC_SECURE_QR,
            permission=QuickShareSession.Permission.VIEW_ONLY,
        )
        resp = self.consume(
            self.client.get(
                f"/api/v1/quick-share/claim/{session.token}/files/{self.alice_file.id}/download/"
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class ReceiveCodeTests(QuickShareBaseTest):
    """The 'Receive code' flow: a recipient types the DueNest code to find a share."""

    URL = "/api/v1/quick-share/receive/"

    def test_session_gets_unique_human_code(self):
        s1 = self.make_session()
        s2 = self.make_session()
        self.assertTrue(s1.dn_code.startswith("DN-"))
        self.assertNotEqual(s1.dn_code, s2.dn_code)
        # The code must not be derived from the secret token.
        self.assertNotIn(s1.dn_code.replace("DN-", "").replace("-", ""), s1.token)

    def test_code_resolves_to_session_token(self):
        session = self.make_session()
        resp = self.client.post(self.URL, {"code": session.dn_code}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["token"], session.token)
        self.assertEqual(resp.data["claim_path"], f"/quick-share/{session.token}")

    def test_code_is_normalized(self):
        session = self.make_session()
        messy = session.dn_code.lower().replace("-", " ")
        resp = self.client.post(self.URL, {"code": messy}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["token"], session.token)

    def test_unknown_code_returns_404(self):
        resp = self.client.post(self.URL, {"code": "DN-AAAA-AAAA"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data["state"], "not_found")

    def test_malformed_code_rejected(self):
        resp = self.client.post(self.URL, {"code": "hello"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["state"], "invalid")

    def test_revoked_session_code_blocked(self):
        session = self.make_session()
        session.revoked_at = timezone.now()
        session.status = QuickShareSession.Status.REVOKED
        session.save(update_fields=["revoked_at", "status"])
        resp = self.client.post(self.URL, {"code": session.dn_code}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "revoked")

    def test_expired_session_code_blocked(self):
        session = self.make_session(expires_at=timezone.now() - timedelta(seconds=1))
        resp = self.client.post(self.URL, {"code": session.dn_code}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data["state"], "expired")

    def test_receive_response_leaks_no_secrets(self):
        session = self.make_session(access_code_required=True,
                                    access_code_hash=make_password("123456"))
        resp = self.client.post(self.URL, {"code": session.dn_code}, format="json")
        body = str(resp.data)
        self.assertNotIn("access_code_hash", body)
        self.assertNotIn("123456", body)


class BundleSharingTests(QuickShareBaseTest):
    """Phase 2: sharing a whole bundle exposes its current files."""

    def make_bundle(self, owner, files):
        bundle = DocumentBundle.objects.create(owner=owner, title="Visa pack")
        for order, file in enumerate(files):
            DocumentBundleRequirement.objects.create(
                owner=owner,
                bundle=bundle,
                title=f"Item {order}",
                requirement_type=DocumentBundleRequirement.RequirementType.FILE,
                linked_file=file,
                linked_document=file.document,
                status=DocumentBundleRequirement.Status.ATTACHED,
            )
        return bundle

    def test_share_bundle_exposes_its_files(self):
        bundle = self.make_bundle(self.alice, [self.alice_file, self.alice_file2])
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "permission": "view_only",
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "bundle_ids": [bundle.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["file_count"], 2)
        names = {f["name"] for f in resp.data["files"]}
        self.assertEqual(names, {"passport.pdf", "visa.pdf"})
        # Stored as a single bundle item that expands to the files.
        session = QuickShareSession.objects.get(id=resp.data["id"])
        self.assertEqual(session.items.count(), 1)
        self.assertEqual(session.items.get().bundle_id, bundle.id)

    def test_cannot_share_another_users_bundle(self):
        bundle = self.make_bundle(self.bob, [self.bob_file])
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "bundle_ids": [bundle.id],
            },
            format="json",
        )
        # Bob's bundle is skipped; with nothing valid the create is rejected.
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_bundle_rejected(self):
        bundle = DocumentBundle.objects.create(owner=self.alice, title="Empty")
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "bundle_ids": [bundle.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_receiver_sees_only_bundle_files(self):
        bundle = self.make_bundle(self.alice, [self.alice_file])
        session = QuickShareSession.objects.create(
            owner=self.alice,
            mode=QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT,
            permission=QuickShareSession.Permission.VIEW_ONLY,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        QuickShareItem.objects.create(session=session, bundle=bundle, order=0)
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {f["name"] for f in resp.data["files"]}
        self.assertEqual(names, {"passport.pdf"})
        self.assertNotIn("bob.pdf", str(resp.data))

    def test_bundle_reflects_added_file(self):
        bundle = self.make_bundle(self.alice, [self.alice_file])
        session = QuickShareSession.objects.create(
            owner=self.alice,
            permission=QuickShareSession.Permission.VIEW_ONLY,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        QuickShareItem.objects.create(session=session, bundle=bundle, order=0)
        # Add another requirement/file to the bundle after sharing.
        DocumentBundleRequirement.objects.create(
            owner=self.alice,
            bundle=bundle,
            title="Extra",
            requirement_type=DocumentBundleRequirement.RequirementType.FILE,
            linked_file=self.alice_file2,
            linked_document=self.alice_file2.document,
            status=DocumentBundleRequirement.Status.ATTACHED,
        )
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/quick-share/claim/{session.token}/")
        names = {f["name"] for f in resp.data["files"]}
        self.assertEqual(names, {"passport.pdf", "visa.pdf"})
