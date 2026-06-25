"""
B2B Bulk Reminder Emails V1 — operational reminders to portal recipients.

Hermetic: email uses Django's in-memory backend (no real mail); the b2b_portals
flag is forced on and the org is on teams_beta; no AI is ever called. Covers
preview per reminder type, permissions (member preview / admin send), no-email
skip, the 3-day cooldown + override, branded-email send path, best-effort batch
(one failed recipient doesn't fail the batch), counts, the privacy guarantees
(no private file URLs / document contents in email, no raw tokens in audit
metadata), and audit events.
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

from apps.documents.models import (
    AuditLogEntry,
    DocumentBundleRequirement,
    DocumentRequestLink,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    PortalCase,
    PortalCaseDocumentRequest,
    PortalReminderBatch,
    PortalReminderRecipient,
)
from apps.organizations import portal_reminders
from apps.organizations.portal_limits import set_organization_plan
from apps.users import plans

User = get_user_model()

_SETTINGS = dict(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <no-reply@certanest.test>",
    DUENEST_APP_BASE_URL="https://app.certanest.test",
)


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


def _pdf():
    return SimpleUploadedFile("passport.pdf", b"%PDF-1.4 bytes", content_type="application/pdf")


@override_settings(**_SETTINGS)
class _Base(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
        self.admin = self._user("admin")
        self.member = self._user("member")
        self.outsider = self._user("outsider")
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

    # ---- builders ----
    def _person(self, full_name="Mamadou", email="recipient@x.com"):
        with _flag_on():
            return self.client.post(f"{self.base}/people/", {
                "full_name": full_name, "email": email,
            }, format="json").data

    def _case(self, person_id, title="Visa application", requirements=("Passport copy",),
              due_date=None):
        with _flag_on():
            payload = {"person": person_id, "title": title, "case_type": "visa"}
            if due_date:
                payload["due_date"] = due_date
            case_id = self.client.post(f"{self.base}/cases/", payload, format="json").data["id"]
            if requirements:
                self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                                 {"requirements": list(requirements)}, format="json")
        return case_id

    def _request(self, case_id, title="Passport copy", due_date=None):
        with _flag_on():
            requirement = DocumentBundleRequirement.objects.filter(
                bundle__portal_cases=case_id
            ).first()
            payload = {"requested_document_title": title}
            if requirement:
                payload["requirement"] = requirement.id
            if due_date:
                payload["due_date"] = due_date
            self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                             payload, format="json")
        return DocumentRequestLink.objects.filter(portal_case_links__case_id=case_id).latest("id")

    def _upload(self, link):
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(
                f"/api/v1/public/document-request-links/{link.token}/upload/",
                {"file": _pdf()}, format="multipart",
            )
        self.client.force_authenticate(self.owner)
        link.refresh_from_db()
        return link

    def _preview(self, reminder_type, **params):
        params["reminder_type"] = reminder_type
        with _flag_on():
            return self.client.get(f"{self.base}/reminders/preview/", params)

    def _create_batch(self, reminder_type, **body):
        body["reminder_type"] = reminder_type
        with _flag_on():
            return self.client.post(f"{self.base}/reminders/batches/", body, format="json")


class PermissionTests(_Base):
    def test_member_can_preview(self):
        # Data created by owner; a plain member may still READ the preview.
        person = self._person(email="b@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        self.client.force_authenticate(self.member)
        resp = self._preview("missing_documents")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("candidates", resp.data)

    def test_non_member_cannot_preview(self):
        self.client.force_authenticate(self.outsider)
        resp = self._preview("missing_documents")
        self.assertIn(resp.status_code, (403, 404), getattr(resp, "data", None))

    def test_member_cannot_send(self):
        # A plain member (not admin/owner) cannot create/send a batch.
        person = self._person()
        self._case(person["id"])
        self.client.force_authenticate(self.member)
        resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.status_code, 403, getattr(resp, "data", None))

    def test_admin_can_create_batch(self):
        person = self._person()
        self._case(person["id"])
        self.client.force_authenticate(self.admin)
        resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["reminder_type"], "missing_documents")

    def test_feature_flag_off_returns_503(self):
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=False):
            resp = self.client.get(f"{self.base}/reminders/preview/",
                                   {"reminder_type": "missing_documents"})
        self.assertEqual(resp.status_code, 503)

    def test_portal_not_enabled_returns_403(self):
        set_organization_plan(self.org, plan="free", portal_enabled=False)
        resp = self._preview("missing_documents")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data.get("code"), "portal_not_enabled")

    def test_invalid_reminder_type_400(self):
        resp = self._preview("not_a_type")
        self.assertEqual(resp.status_code, 400)


class PreviewTests(_Base):
    def test_missing_documents_preview(self):
        person = self._person(email="missing@x.com")
        self._case(person["id"], requirements=["Passport copy", "Proof of funds"])
        resp = self._preview("missing_documents")
        self.assertEqual(resp.data["count"], 1)
        cand = resp.data["candidates"][0]
        self.assertEqual(cand["recipient_email"], "missing@x.com")
        self.assertTrue(cand["eligible"])
        self.assertGreaterEqual(len(cand["missing_titles"]), 1)

    def test_overdue_requests_preview(self):
        person = self._person(email="over@x.com")
        case_id = self._case(person["id"])
        self._request(case_id, due_date=(timezone.now().date() - timedelta(days=5)).isoformat())
        resp = self._preview("overdue_requests")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["candidates"][0]["status"], "requested")

    def test_needs_replacement_preview(self):
        _, cr, _ = self._upload_and(decision="needs_replacement")
        resp = self._preview("needs_replacement")
        self.assertEqual(resp.data["count"], 1)
        cand = resp.data["candidates"][0]
        self.assertEqual(cand["case_request_id"], cr.id)
        self.assertTrue(cand["action_url"])  # reopened link → upload URL present

    def test_rejected_documents_preview(self):
        _, cr, _ = self._upload_and(decision="rejected")
        resp = self._preview("rejected_documents")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["candidates"][0]["case_request_id"], cr.id)

    def test_due_soon_preview(self):
        person = self._person(email="soon@x.com")
        self._case(person["id"], due_date=(timezone.now().date() + timedelta(days=3)).isoformat())
        resp = self._preview("due_soon_cases")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["candidates"][0]["recipient_email"], "soon@x.com")

    def test_recipient_without_email_is_ineligible(self):
        person = self._person(email="")
        self._case(person["id"], requirements=["Passport copy"])
        resp = self._preview("missing_documents")
        self.assertEqual(resp.data["count"], 1)
        cand = resp.data["candidates"][0]
        self.assertFalse(cand["eligible"])
        self.assertEqual(cand["skip_reason"], "no_email")

    def _upload_and(self, decision):
        person = self._person(email="dec@x.com")
        case_id = self._case(person["id"])
        link = self._upload(self._request(case_id))
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        if decision == "needs_replacement":
            from apps.organizations import portal_reviews

            portal_reviews.mark_case_request_needs_replacement(
                cr, self.owner, reason="Blurry scan", notify_recipient=False)
        else:
            from apps.organizations import portal_reviews

            portal_reviews.reject_case_document_request(
                cr, self.owner, reason="Wrong document", notify_recipient=False)
        cr.refresh_from_db()
        return case_id, cr, link


class SendTests(_Base):
    def test_send_uses_branded_email_and_counts(self):
        person = self._person(email="send@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        mail.outbox.clear()
        resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "sent")
        self.assertEqual(resp.data["recipient_count"], 1)
        self.assertEqual(resp.data["sent_count"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("send@x.com", mail.outbox[0].to)

    def test_no_real_emails_just_locmem(self):
        person = self._person(email="x@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        mail.outbox.clear()
        self._create_batch("missing_documents", send_now=True)
        # locmem backend captured it — nothing left the process.
        self.assertEqual(len(mail.outbox), 1)

    def test_cooldown_skips_duplicate(self):
        person = self._person(email="dupe@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        self._create_batch("missing_documents", send_now=True)
        mail.outbox.clear()
        # Second send within cooldown → skipped.
        resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.data["recipient_count"], 1)
        self.assertEqual(resp.data["sent_count"], 0)
        self.assertEqual(resp.data["skipped_count"], 1)
        self.assertEqual(resp.data["skipped"][0]["reason"], "recently_reminded")
        self.assertEqual(len(mail.outbox), 0)

    def test_override_recent_reminders_resends(self):
        person = self._person(email="ovr@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        self._create_batch("missing_documents", send_now=True)
        mail.outbox.clear()
        resp = self._create_batch("missing_documents", send_now=True,
                                  override_recent_reminders=True)
        self.assertEqual(resp.data["sent_count"], 1)
        self.assertEqual(resp.data["skipped_count"], 0)
        self.assertEqual(len(mail.outbox), 1)

    def test_one_failed_recipient_does_not_fail_batch(self):
        # Two recipients; the branded-email helper returns False for one (simulating
        # suppression/transport failure) → batch is partially_failed, not failed.
        p1 = self._person(full_name="A", email="a@x.com")
        p2 = self._person(full_name="B", email="b@x.com")
        self._case(p1["id"], requirements=["Passport copy"])
        self._case(p2["id"], requirements=["Passport copy"])

        def fake_send(*, to, **kw):
            return to != "b@x.com"

        with mock.patch("common.email.send_branded_email", side_effect=fake_send):
            resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.data["recipient_count"], 2)
        self.assertEqual(resp.data["sent_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(resp.data["status"], "partially_failed")

    def test_batch_with_no_recipients_is_sent_empty(self):
        # No candidates → empty batch, status sent, zero counts.
        resp = self._create_batch("missing_documents", send_now=True)
        self.assertEqual(resp.data["recipient_count"], 0)
        self.assertEqual(resp.data["status"], "sent")


class PrivacyAndAuditTests(_Base):
    def test_email_has_no_private_url_or_content(self):
        person = self._person(email="priv@x.com")
        case_id = self._case(person["id"])
        # Needs-replacement so there is a reopened upload link in the email.
        link = self._upload(self._request(case_id))
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        from apps.organizations import portal_reviews

        portal_reviews.mark_case_request_needs_replacement(
            cr, self.owner, reason="Please resend", notify_recipient=False)
        mail.outbox.clear()
        self._create_batch("needs_replacement", send_now=True)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body + str(mail.outbox[0].alternatives)
        # The recipient's own public upload link is allowed; private internals are not.
        self.assertNotIn("/media/", body)
        self.assertNotIn("X-Amz", body)
        self.assertNotIn("%PDF", body)
        self.assertNotIn("/api/v1/files/", body)
        self.assertNotIn("/file/preview/", body)
        self.assertNotIn("/file/download/", body)

    def test_audit_metadata_has_no_token(self):
        person = self._person(email="aud@x.com")
        case_id = self._case(person["id"])
        link = self._upload(self._request(case_id))
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        from apps.organizations import portal_reviews

        portal_reviews.mark_case_request_needs_replacement(
            cr, self.owner, reason="Resend", notify_recipient=False)
        self._create_batch("needs_replacement", send_now=True)
        events = AuditLogEntry.objects.filter(
            event_type__startswith="portal_reminder_"
        )
        self.assertTrue(events.exists())
        for e in events:
            blob = json.dumps(e.metadata)
            self.assertNotIn(link.token, blob)
            self.assertNotIn("http", blob)
            self.assertNotIn("/document-request/", blob)

    def test_audit_events_recorded(self):
        person = self._person(email="ev@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        self._create_batch("missing_documents", send_now=True)
        types = set(
            AuditLogEntry.objects.filter(event_type__startswith="portal_reminder_")
            .values_list("event_type", flat=True)
        )
        self.assertIn("portal_reminder_batch_created", types)
        self.assertIn("portal_reminder_batch_sent", types)
        self.assertIn("portal_reminder_recipient_sent", types)

    def test_recipient_count_survives_audit_sanitizer(self):
        # "recipient_count" contains "ip" — confirm the allow-list keeps it.
        person = self._person(email="cnt@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        self._create_batch("missing_documents", send_now=True)
        sent = AuditLogEntry.objects.get(event_type="portal_reminder_batch_sent")
        self.assertIn("recipient_count", sent.metadata)
        self.assertEqual(sent.metadata["sent_count"], 1)


class BatchApiTests(_Base):
    def test_list_and_detail_and_cancel(self):
        person = self._person(email="api@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        # Create a DRAFT batch (no send_now) then cancel it.
        created = self._create_batch("missing_documents")
        batch_id = created.data["batch_id"]
        self.assertEqual(created.data["status"], "draft")

        with _flag_on():
            listed = self.client.get(f"{self.base}/reminders/batches/")
            detail = self.client.get(f"{self.base}/reminders/batches/{batch_id}/")
            cancelled = self.client.post(
                f"{self.base}/reminders/batches/{batch_id}/cancel/", {}, format="json")
        self.assertEqual(listed.data["count"], 1)
        self.assertIn("recipients", detail.data)
        self.assertEqual(cancelled.data["status"], "cancelled")

    def test_separate_send_endpoint(self):
        person = self._person(email="sep@x.com")
        self._case(person["id"], requirements=["Passport copy"])
        created = self._create_batch("missing_documents")
        batch_id = created.data["batch_id"]
        mail.outbox.clear()
        with _flag_on():
            sent = self.client.post(
                f"{self.base}/reminders/batches/{batch_id}/send/", {}, format="json")
        self.assertEqual(sent.data["status"], "sent")
        self.assertEqual(sent.data["sent_count"], 1)
        self.assertEqual(len(mail.outbox), 1)
