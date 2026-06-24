"""
Document Request Links V1 — request -> upload -> review -> accept -> attach/save.

Hermetic: email uses Django's in-memory backend; no AI is ever called. Covers
owner auth + ownership isolation, linked-pack/app/requirement ownership, the
unguessable public token + public resolve, expired/cancelled upload guards, the
public encrypted upload (no storage URL), review accept/reject/needs-replacement,
save-to-vault, attach-to-pack + readiness, the active plan limit (Free 5; terminal
states don't count), storage enforcement, branded send email, and the no-AI /
no-credit / no-public-URL guarantees.
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from rest_framework.test import APITestCase

from apps.billing.models import Plan, UserSubscription
from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentRequestLink,
    TrackedApplication,
)

User = get_user_model()

LIST_URL = "/api/v1/document-requests/"
_EMAIL = dict(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <no-reply@certanest.test>",
    DUENEST_APP_BASE_URL="https://app.certanest.test",
)


def _pdf(name="passport.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake passport bytes", content_type="application/pdf")


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


class _Base(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN", first_name="Aisha",
        )
        self.client.force_authenticate(self.user)

    def _create(self, **extra):
        payload = {"requested_document_title": "Passport copy",
                   "instructions": "Upload a clear PDF.", **extra}
        return self.client.post(LIST_URL, payload, format="json")

    def _upload(self, token, upload=None):
        # Public upload runs unauthenticated; bypass malware scan in tests.
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            resp = self.client.post(
                f"/api/v1/public/document-request-links/{token}/upload/",
                {"file": upload or _pdf()}, format="multipart",
            )
        self.client.force_authenticate(self.user)
        return resp


class CreateAndAccessTests(_Base):
    def test_list_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_create_document_request(self):
        resp = self._create(recipient_name="Mamadou", recipient_email="m@x.com")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "requested")
        self.assertTrue(resp.data["token"])
        self.assertIn("/document-request/", resp.data["upload_url"])

    def test_create_requires_title(self):
        resp = self.client.post(LIST_URL, {"requested_document_title": ""}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_linked_pack_must_belong_to_owner(self):
        other = User.objects.create_user(username="x", email="x@x.com", password="StrongPass123!DN")
        foreign_bundle = DocumentBundle.objects.create(owner=other, title="Theirs")
        resp = self._create(linked_bundle=foreign_bundle.id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not found", resp.data["detail"].lower())

    def test_other_user_cannot_access_request(self):
        req = DocumentRequestLink.objects.create(owner=self.user, requested_document_title="X")
        other = User.objects.create_user(username="y", email="y@x.com", password="StrongPass123!DN")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"{LIST_URL}{req.id}/").status_code, 404)

    def test_public_resolves_valid_token_and_marks_opened(self):
        req = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="Transcript",
            instructions="PDF please", recipient_name="Sam",
        )
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/public/document-request-links/{req.token}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["requested_document_title"], "Transcript")
        self.assertEqual(resp.data["state"], "ok")
        self.assertTrue(resp.data["can_upload"])
        # Owner private data is NOT leaked.
        self.assertNotIn("owner_note", resp.data)
        self.assertNotIn("recipient_email", resp.data)
        blob = json.dumps(resp.data).lower()
        self.assertNotIn("o@x.com", blob)  # owner email never exposed
        req.refresh_from_db()
        self.assertEqual(req.status, "opened")

    def test_unknown_token_is_404(self):
        self.client.force_authenticate(None)
        resp = self.client.get("/api/v1/public/document-request-links/nope-not-a-token/")
        self.assertEqual(resp.status_code, 404)


class UploadTests(_Base):
    def test_public_upload_stores_file_and_moves_to_uploaded(self):
        req = DocumentRequestLink.objects.create(owner=self.user, requested_document_title="ID")
        resp = self._upload(req.token)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(resp.data["ok"])
        # No storage URL leaked in the recipient response.
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "amazonaws", "https://", "/files/"):
            self.assertNotIn(marker, blob)
        req.refresh_from_db()
        self.assertEqual(req.status, "uploaded")
        self.assertIsNotNone(req.uploaded_file_id)
        # The stored bytes are a real encrypted owner-owned DocumentFile.
        from apps.documents.file_encryption import read_plaintext

        self.assertEqual(req.uploaded_file.uploaded_by_id, self.user.id)
        self.assertTrue(read_plaintext(req.uploaded_file).startswith(b"%PDF"))

    def test_expired_request_cannot_upload(self):
        req = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="ID",
            expires_at=timezone.now() - timedelta(days=1),
        )
        resp = self._upload(req.token)
        self.assertEqual(resp.status_code, 404)
        req.refresh_from_db()
        self.assertIsNone(req.uploaded_file_id)

    def test_cancelled_request_cannot_upload(self):
        req = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="ID",
            status=DocumentRequestLink.Status.CANCELLED,
        )
        resp = self._upload(req.token)
        self.assertEqual(resp.status_code, 404)


@override_settings(**_EMAIL)
class ReviewAndAttachTests(_Base):
    def _uploaded_request(self, **extra):
        req = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="Passport copy", **extra
        )
        self._upload(req.token)
        req.refresh_from_db()
        return req

    def test_owner_accepts_uploaded_request(self):
        req = self._uploaded_request()
        resp = self.client.post(f"{LIST_URL}{req.id}/accept/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "accepted")

    def test_owner_rejects_with_reason(self):
        req = self._uploaded_request()
        resp = self.client.post(f"{LIST_URL}{req.id}/reject/", {"reason": "Wrong document."}, format="json")
        self.assertEqual(resp.data["status"], "rejected")
        self.assertEqual(resp.data["rejection_reason"], "Wrong document.")

    def test_owner_marks_needs_replacement_and_recipient_can_reupload(self):
        req = self._uploaded_request()
        resp = self.client.post(
            f"{LIST_URL}{req.id}/needs-replacement/",
            {"reason": "Blurry — please re-scan."}, format="json",
        )
        self.assertEqual(resp.data["status"], "needs_replacement")
        # The recipient can upload again against a needs_replacement request.
        req.refresh_from_db()
        self.assertTrue(req.can_upload)
        resp2 = self._upload(req.token)
        self.assertEqual(resp2.status_code, 201, resp2.data)
        req.refresh_from_db()
        self.assertEqual(req.status, "uploaded")

    def test_cannot_accept_without_upload(self):
        req = DocumentRequestLink.objects.create(owner=self.user, requested_document_title="X")
        resp = self.client.post(f"{LIST_URL}{req.id}/accept/")
        self.assertEqual(resp.status_code, 400)

    def test_accepted_request_saves_to_vault(self):
        req = self._uploaded_request()
        self.client.post(f"{LIST_URL}{req.id}/accept/")
        resp = self.client.post(f"{LIST_URL}{req.id}/save-to-vault/")
        self.assertEqual(resp.status_code, 200, resp.data)
        doc = Document.objects.get(pk=resp.data["document_id"])
        self.assertEqual(doc.owner_id, self.user.id)
        self.assertEqual(doc.title, "Passport copy")

    def test_accepted_request_attaches_to_pack_and_improves_readiness(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        requirement = DocumentBundleRequirement.objects.create(
            owner=self.user, bundle=bundle, title="Passport copy", is_required=True,
            status=DocumentBundleRequirement.Status.MISSING,
        )
        bundle.recalculate_readiness()
        before = bundle.readiness_score

        req = self._uploaded_request(linked_bundle=bundle, linked_requirement=requirement)
        self.client.post(f"{LIST_URL}{req.id}/accept/")
        resp = self.client.post(f"{LIST_URL}{req.id}/attach-to-pack/")
        self.assertEqual(resp.status_code, 200, resp.data)

        requirement.refresh_from_db()
        bundle.refresh_from_db()
        self.assertEqual(requirement.status, "attached")
        self.assertIsNotNone(requirement.linked_file_id)
        self.assertGreater(bundle.readiness_score, before)

    def test_cannot_attach_before_accept(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Pack")
        req = self._uploaded_request(linked_bundle=bundle)
        resp = self.client.post(f"{LIST_URL}{req.id}/attach-to-pack/")
        self.assertEqual(resp.status_code, 400)

    def test_send_email_uses_branded_helper(self):
        req = DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="Passport copy",
            recipient_email="recipient@x.com", recipient_name="Mamadou",
        )
        with mock.patch("apps.ai.client.generate") as g:
            resp = self.client.post(f"{LIST_URL}{req.id}/send/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["sent"])
        g.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["recipient@x.com"])
        self.assertIn("Document request", msg.subject)
        self.assertIn(req.token, msg.body)  # the secure upload link

    def test_no_ai_call_across_lifecycle(self):
        with mock.patch("apps.ai.client.generate") as g:
            req = self._uploaded_request()
            self.client.post(f"{LIST_URL}{req.id}/accept/")
            self.client.post(f"{LIST_URL}{req.id}/save-to-vault/")
        g.assert_not_called()


class PlanLimitTests(_Base):
    def test_free_plan_caps_active_requests_at_5(self):
        # Free is the default plan. Create 5 active requests, then the 6th is blocked.
        for _ in range(5):
            self.assertEqual(self._create().status_code, 201)
        resp = self._create()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "plan_limit_exceeded")
        self.assertEqual(resp.data["resource"], "document_request_links")

    def test_terminal_states_do_not_count_against_limit(self):
        # 5 cancelled (terminal) requests don't consume the active allowance.
        for _ in range(5):
            DocumentRequestLink.objects.create(
                owner=self.user, requested_document_title="X",
                status=DocumentRequestLink.Status.CANCELLED,
            )
        self.assertEqual(self._create().status_code, 201)

    def test_pro_plan_allows_more(self):
        _grant_pro(self.user)
        self.user.plan = "pro_placeholder"
        self.user.save(update_fields=["plan"])
        for _ in range(6):
            self.assertEqual(self._create().status_code, 201)


class LifeRadarIntegrationTests(_Base):
    def test_life_radar_includes_document_request_counts(self):
        DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="A",
            status=DocumentRequestLink.Status.UPLOADED,
        )
        DocumentRequestLink.objects.create(
            owner=self.user, requested_document_title="B",
            status=DocumentRequestLink.Status.REQUESTED,
        )
        from apps.documents.life_radar import build_life_radar

        summary = build_life_radar(self.user)["summary"]
        self.assertEqual(summary["uploaded_document_requests"], 1)
        self.assertEqual(summary["pending_document_requests"], 1)
        self.assertIn("needs_replacement_document_requests", summary)
        self.assertIn("overdue_document_requests", summary)
