"""
B2B Review + Approval Workflow V1 — staff review of uploaded portal documents.

Hermetic: email uses Django's in-memory backend; no AI is ever called; the
b2b_portals flag is forced on and the org is on teams_beta. Covers the review
queue (uploaded items only, non-portal excluded), permissions (member view /
admin decide), accept→satisfies-pack-requirement + progress, reject/needs-
replacement requiring a note, needs-replacement reopening the link, decision
history + reviewed_by/at, recipient notification (branded email, opt-in), the
org-scoped file proxy (no storage URL), audit events, and the no-AI guarantee.
"""

from __future__ import annotations

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.documents.models import (
    AuditLogEntry,
    DocumentBundleRequirement,
    DocumentRequestLink,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    PortalCaseDocumentRequest,
    PortalCaseReviewDecision,
)
from apps.organizations.portal_limits import set_organization_plan
from apps.users import plans

User = get_user_model()

_EMAIL = dict(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <no-reply@certanest.test>",
    DUENEST_APP_BASE_URL="https://app.certanest.test",
)


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


def _pdf():
    return SimpleUploadedFile("passport.pdf", b"%PDF-1.4 bytes", content_type="application/pdf")


@override_settings(**_EMAIL)
class _Base(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
        self.admin = self._user("admin")
        self.member = self._user("member")
        self.org = Organization.objects.create(
            name="Visa Agency",
            organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner,
        )
        for u, role in ((self.owner, "owner"), (self.admin, "admin"), (self.member, "member")):
            OrganizationMembership.objects.create(
                organization=self.org, user=u,
                role=getattr(OrganizationMembership.Role, role.upper()),
                status=OrganizationMembership.Status.ACTIVE,
            )
        set_organization_plan(self.org, plan="teams_beta", portal_enabled=True)
        self.base = f"/api/v1/organizations/{self.org.id}/portal"
        self.client.force_authenticate(self.owner)

    def _user(self, name):
        u = User.objects.create_user(username=name, email=f"{name}@x.com",
                                     password="StrongPass123!DN", first_name=name.title())
        u.plan = plans.PLAN_PRO_PLACEHOLDER
        u.save(update_fields=["plan"])
        return u

    def _case_with_uploaded_request(self, recipient_email="recipient@x.com"):
        """Create a person+case+pack+request, then simulate a recipient upload."""
        with _flag_on():
            person = self.client.post(f"{self.base}/people/", {
                "full_name": "Mamadou", "email": recipient_email,
            }, format="json").data
            case_id = self.client.post(f"{self.base}/cases/", {
                "person": person["id"], "title": "Visa application", "case_type": "visa",
            }, format="json").data["id"]
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            requirement = DocumentBundleRequirement.objects.get(bundle__portal_cases=case_id)
            self.client.post(f"{self.base}/cases/{case_id}/create-request/", {
                "requested_document_title": "Passport copy", "requirement": requirement.id,
            }, format="json")
        link = DocumentRequestLink.objects.get(portal_case_links__case_id=case_id)
        # Recipient uploads (public, unauthenticated).
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(
                f"/api/v1/public/document-request-links/{link.token}/upload/",
                {"file": _pdf()}, format="multipart",
            )
        self.client.force_authenticate(self.owner)
        link.refresh_from_db()
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        return case_id, cr, link, requirement


class QueueAndPermissionTests(_Base):
    def test_review_queue_lists_uploaded_items(self):
        case_id, cr, link, _ = self._case_with_uploaded_request()
        with _flag_on():
            resp = self.client.get(f"{self.base}/review-queue/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["count"], 1)
        item = resp.data["items"][0]
        self.assertEqual(item["case_request_id"], cr.id)
        self.assertEqual(item["review_status"], "uploaded")
        self.assertIsNotNone(item["uploaded_file"])

    def test_review_queue_excludes_non_portal_requests(self):
        # A personal (non-portal) request link must never appear in the queue.
        self._case_with_uploaded_request()
        DocumentRequestLink.objects.create(
            owner=self.owner, requested_document_title="Personal",
            status=DocumentRequestLink.Status.UPLOADED,
        )
        with _flag_on():
            resp = self.client.get(f"{self.base}/review-queue/")
        self.assertEqual(resp.data["count"], 1)

    def test_non_member_cannot_access_queue(self):
        outsider = self._user("outsider")
        self.client.force_authenticate(outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/review-queue/")
        self.assertEqual(resp.status_code, 403)

    def test_member_cannot_decide(self):
        case_id, cr, _, _ = self._case_with_uploaded_request()
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/review/",
                {"decision": "accepted"}, format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_admin_can_start_review(self):
        case_id, cr, link, _ = self._case_with_uploaded_request()
        self.client.force_authenticate(self.admin)
        with _flag_on():
            resp = self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/start-review/"
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["review_status"], "under_review")
        link.refresh_from_db()
        self.assertEqual(link.status, "under_review")


@override_settings(**_EMAIL)
class DecisionTests(_Base):
    def _review(self, case_id, cr_id, body):
        with _flag_on():
            return self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr_id}/review/", body, format="json"
            )

    def test_accept_satisfies_requirement_and_updates_progress(self):
        case_id, cr, link, requirement = self._case_with_uploaded_request()
        resp = self._review(case_id, cr.id, {"decision": "accepted", "note": "Clear."})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["case_request"]["review_status"], "accepted")
        self.assertEqual(resp.data["document_request_status"], "accepted")
        # The linked pack requirement is now satisfied; progress reflects it.
        requirement.refresh_from_db()
        self.assertEqual(requirement.status, "attached")
        self.assertEqual(resp.data["progress"]["satisfied_requirements"], 1)
        self.assertEqual(resp.data["progress"]["missing_requirements"], 0)
        # reviewed_by / reviewed_at + a decision row recorded.
        cr.refresh_from_db()
        self.assertEqual(cr.reviewed_by_id, self.owner.id)
        self.assertIsNotNone(cr.reviewed_at)
        self.assertEqual(cr.decision_count, 1)
        self.assertTrue(PortalCaseReviewDecision.objects.filter(
            case_request=cr, decision="accepted").exists())

    def test_cannot_accept_without_uploaded_file(self):
        # Create a request with no upload.
        with _flag_on():
            person = self.client.post(f"{self.base}/people/", {"full_name": "X"}, format="json").data
            case_id = self.client.post(f"{self.base}/cases/",
                                       {"person": person["id"], "title": "C"}, format="json").data["id"]
            self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                             {"requested_document_title": "Passport"}, format="json")
        cr = PortalCaseDocumentRequest.objects.get(case_id=case_id)
        resp = self._review(case_id, cr.id, {"decision": "accepted"})
        self.assertEqual(resp.status_code, 400)

    def test_reject_requires_note_and_does_not_satisfy(self):
        case_id, cr, link, requirement = self._case_with_uploaded_request()
        no_reason = self._review(case_id, cr.id, {"decision": "rejected"})
        self.assertEqual(no_reason.status_code, 400)
        resp = self._review(case_id, cr.id, {"decision": "rejected", "note": "Wrong document."})
        self.assertEqual(resp.data["case_request"]["review_status"], "rejected")
        requirement.refresh_from_db()
        self.assertEqual(requirement.status, "missing")  # not satisfied
        link.refresh_from_db()
        self.assertEqual(link.rejection_reason, "Wrong document.")

    def test_needs_replacement_reopens_link_for_reupload(self):
        case_id, cr, link, _ = self._case_with_uploaded_request()
        no_reason = self._review(case_id, cr.id, {"decision": "needs_replacement"})
        self.assertEqual(no_reason.status_code, 400)
        resp = self._review(case_id, cr.id,
                            {"decision": "needs_replacement", "note": "Blurry — re-scan."})
        self.assertEqual(resp.data["case_request"]["review_status"], "needs_replacement")
        link.refresh_from_db()
        self.assertEqual(link.status, "needs_replacement")
        self.assertTrue(link.can_upload)  # re-opened for the recipient

        # Replacement upload returns it to the review queue.
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(
                f"/api/v1/public/document-request-links/{link.token}/upload/",
                {"file": _pdf()}, format="multipart",
            )
        self.client.force_authenticate(self.owner)
        with _flag_on():
            queue = self.client.get(f"{self.base}/review-queue/")
        self.assertEqual(queue.data["count"], 1)

    def test_decision_history_endpoint(self):
        case_id, cr, _, _ = self._case_with_uploaded_request()
        self._review(case_id, cr.id, {"decision": "needs_replacement", "note": "Blurry."})
        with _flag_on():
            resp = self.client.get(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/decisions/"
            )
        self.assertEqual(len(resp.data["decisions"]), 1)
        self.assertEqual(resp.data["decisions"][0]["decision"], "needs_replacement")
        self.assertEqual(resp.data["decisions"][0]["new_status"], "needs_replacement")

    def test_audit_events_recorded_without_sensitive_data(self):
        case_id, cr, link, _ = self._case_with_uploaded_request()
        self._review(case_id, cr.id, {"decision": "accepted", "note": "Good."})
        events = set(AuditLogEntry.objects.filter(owner=self.owner).values_list("event_type", flat=True))
        self.assertIn("portal_document_accepted", events)
        entry = AuditLogEntry.objects.get(owner=self.owner, event_type="portal_document_accepted")
        blob = json.dumps(entry.metadata).lower()
        for marker in ("token", "http", "/media/", link.token.lower()):
            self.assertNotIn(marker, blob)

    def test_no_ai_call_during_review(self):
        case_id, cr, _, _ = self._case_with_uploaded_request()
        with mock.patch("apps.ai.client.generate") as g:
            self._review(case_id, cr.id, {"decision": "accepted"})
        g.assert_not_called()


@override_settings(**_EMAIL)
class NotificationTests(_Base):
    def test_needs_replacement_notifies_recipient_via_branded_email(self):
        case_id, cr, link, _ = self._case_with_uploaded_request(recipient_email="r@x.com")
        with _flag_on():
            resp = self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/review/",
                {"decision": "needs_replacement", "note": "Re-scan please.",
                 "notify_recipient": True}, format="json",
            )
        self.assertTrue(resp.data["notified_recipient"])
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["r@x.com"])
        self.assertIn(link.token, msg.body)  # the recipient's own upload page link
        self.assertTrue(AuditLogEntry.objects.filter(
            owner=self.owner, event_type="portal_recipient_notified").exists())

    def test_no_email_when_notify_disabled(self):
        case_id, cr, _, _ = self._case_with_uploaded_request(recipient_email="r@x.com")
        with _flag_on():
            self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/review/",
                {"decision": "rejected", "note": "No.", "notify_recipient": False},
                format="json",
            )
        self.assertEqual(len(mail.outbox), 0)

    def test_no_email_when_no_recipient_address(self):
        case_id, cr, _, _ = self._case_with_uploaded_request(recipient_email="")
        with _flag_on():
            resp = self.client.post(
                f"{self.base}/cases/{case_id}/requests/{cr.id}/review/",
                {"decision": "rejected", "note": "No.", "notify_recipient": True},
                format="json",
            )
        self.assertFalse(resp.data["notified_recipient"])
        self.assertEqual(len(mail.outbox), 0)


@override_settings(**_EMAIL)
class FileProxyTests(_Base):
    def test_org_scoped_file_download_streams_bytes_no_storage_url(self):
        case_id, cr, link, _ = self._case_with_uploaded_request()
        with _flag_on():
            item = self.client.get(f"{self.base}/review-queue/").data["items"][0]
        url = item["uploaded_file"]["download_url"]
        # The reference is the org-scoped proxy route — never a raw storage URL.
        self.assertIn(f"/portal/cases/{case_id}/requests/{cr.id}/file/download/", url)
        self.assertNotIn("/api/v1/files/", url)
        with _flag_on():
            resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(b"".join(resp.streaming_content).startswith(b"%PDF"))

    def test_non_member_cannot_download_file(self):
        case_id, cr, _, _ = self._case_with_uploaded_request()
        url = f"{self.base}/cases/{case_id}/requests/{cr.id}/file/download/"
        outsider = self._user("outsider")
        self.client.force_authenticate(outsider)
        with _flag_on():
            resp = self.client.get(url)
        self.assertEqual(resp.status_code, 403)
