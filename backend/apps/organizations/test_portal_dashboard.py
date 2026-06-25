"""
Organization Dashboard V1 — operational command center for a B2B portal.

Hermetic: the b2b_portals flag is forced on and the org is on teams_beta; no AI
is ever called; no email is sent. Covers permissions (member read / non-member
denied / feature + entitlement gates), the metrics block (active cases/people,
uploads needing review, overdue, due-soon, ready, missing required documents,
needs-replacement), the action queues (review-now, overdue, missing-documents,
needs-replacement, ready, recent-activity), queue size caps, and the privacy
guarantees (no raw public tokens, no private file URLs, no document contents).
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
    DocumentBundleRequirement,
    DocumentRequestLink,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    PortalCase,
    PortalCaseDocumentRequest,
)
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
        self.dash_url = f"{self.base}/dashboard/"
        self.client.force_authenticate(self.owner)

    def _user(self, name):
        u = User.objects.create_user(username=name, email=f"{name}@x.com",
                                     password="StrongPass123!DN", first_name=name.title())
        u.plan = plans.PLAN_PRO_PLACEHOLDER
        u.save(update_fields=["plan"])
        return u

    # ---- builders (deterministic, via the real portal endpoints/services) ----

    def _person(self, full_name="Mamadou", email="recipient@x.com"):
        with _flag_on():
            return self.client.post(f"{self.base}/people/", {
                "full_name": full_name, "email": email,
            }, format="json").data

    def _case(self, person_id, title="Visa application", requirements=("Passport copy",)):
        with _flag_on():
            case_id = self.client.post(f"{self.base}/cases/", {
                "person": person_id, "title": title, "case_type": "visa",
            }, format="json").data["id"]
            if requirements:
                self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                                 {"requirements": list(requirements)}, format="json")
        return case_id

    def _request(self, case_id, title="Passport copy"):
        with _flag_on():
            requirement = DocumentBundleRequirement.objects.filter(
                bundle__portal_cases=case_id
            ).first()
            payload = {"requested_document_title": title}
            if requirement:
                payload["requirement"] = requirement.id
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

    def _case_with_upload(self, **kw):
        person = self._person(**kw)
        case_id = self._case(person["id"])
        link = self._upload(self._request(case_id))
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        return case_id, cr, link

    def _get(self):
        with _flag_on():
            return self.client.get(self.dash_url)


class PermissionTests(_Base):
    def test_member_can_read_dashboard(self):
        self.client.force_authenticate(self.member)
        resp = self._get()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("metrics", resp.data)
        self.assertIn("queues", resp.data)
        self.assertIn("plan", resp.data)
        self.assertEqual(resp.data["organization"]["id"], self.org.id)

    def test_non_member_cannot_read_dashboard(self):
        self.client.force_authenticate(self.outsider)
        resp = self._get()
        self.assertIn(resp.status_code, (403, 404), resp.data)

    def test_feature_flag_off_returns_503(self):
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=False):
            resp = self.client.get(self.dash_url)
        self.assertEqual(resp.status_code, 503, getattr(resp, "data", None))

    def test_portal_not_enabled_returns_403(self):
        set_organization_plan(self.org, plan="free", portal_enabled=False)
        resp = self._get()
        self.assertEqual(resp.status_code, 403, resp.data)
        self.assertEqual(resp.data.get("code"), "portal_not_enabled")

    def test_dashboard_includes_plan_usage_and_limits(self):
        resp = self._get()
        plan = resp.data["plan"]
        self.assertEqual(plan["plan"], "teams_beta")
        self.assertTrue(plan["portal_enabled"])
        for key in ("limits", "usage", "remaining"):
            self.assertIn(key, plan)
        self.assertIn("active_portal_cases", plan["usage"])


class MetricsTests(_Base):
    def test_metrics_active_cases_and_people(self):
        self._case_with_upload()
        resp = self._get()
        m = resp.data["metrics"]
        self.assertGreaterEqual(m["active_cases"], 1)
        self.assertGreaterEqual(m["active_people"], 1)
        self.assertGreaterEqual(m["total_people"], 1)

    def test_metrics_uploaded_requests_needing_review(self):
        self._case_with_upload()
        m = self._get().data["metrics"]
        self.assertEqual(m["uploaded_requests_needing_review"], 1)
        self.assertEqual(m["active_document_requests"], 1)

    def test_metrics_overdue_and_due_soon_cases(self):
        # Overdue case.
        _, cr_over, _ = self._case_with_upload(email="a@x.com")
        PortalCase.objects.filter(pk=cr_over.case_id).update(
            due_date=timezone.now().date() - timedelta(days=2)
        )
        # Due-soon case (3 days out).
        p2 = self._person(full_name="Aisha", email="b@x.com")
        c2 = self._case(p2["id"], title="Scholarship")
        PortalCase.objects.filter(pk=c2).update(
            due_date=timezone.now().date() + timedelta(days=3)
        )
        m = self._get().data["metrics"]
        self.assertEqual(m["overdue_cases"], 1)
        self.assertEqual(m["due_soon_cases"], 1)

    def test_metrics_ready_cases(self):
        _, cr, _ = self._case_with_upload()
        PortalCase.objects.filter(pk=cr.case_id).update(status=PortalCase.Status.READY)
        m = self._get().data["metrics"]
        self.assertEqual(m["ready_cases"], 1)

    def test_metrics_missing_required_documents(self):
        # A case with a pack of two required items, none satisfied → 2 missing.
        person = self._person()
        self._case(person["id"], requirements=["Passport copy", "Proof of funds"])
        m = self._get().data["metrics"]
        self.assertEqual(m["missing_required_documents"], 2)

    def test_metrics_needs_replacement_requests(self):
        _, cr, link = self._case_with_upload()
        from apps.organizations import portal_reviews

        portal_reviews.mark_case_request_needs_replacement(
            cr, self.owner, reason="Blurry scan", notify_recipient=False
        )
        m = self._get().data["metrics"]
        self.assertEqual(m["needs_replacement_requests"], 1)

    def test_metrics_have_full_count_set(self):
        m = self._get().data["metrics"]
        for key in (
            "total_people", "active_people", "total_cases", "active_cases",
            "collecting_documents_cases", "waiting_for_review_cases", "ready_cases",
            "submitted_cases", "completed_cases", "blocked_cases", "archived_cases",
            "overdue_cases", "due_soon_cases", "active_document_requests",
            "uploaded_requests_needing_review", "accepted_requests", "rejected_requests",
            "needs_replacement_requests", "active_sharing_rooms", "expiring_sharing_rooms",
            "missing_required_documents", "readiness_average", "percent_cases_ready",
        ):
            self.assertIn(key, m)


class QueueTests(_Base):
    def test_review_now_queue_returns_uploaded_items(self):
        case_id, cr, _ = self._case_with_upload()
        q = self._get().data["queues"]["review_now"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["case_request_id"], cr.id)
        self.assertEqual(q[0]["case_id"], case_id)
        self.assertIn("action_url", q[0])

    def test_overdue_queue_returns_overdue_cases(self):
        _, cr, _ = self._case_with_upload()
        PortalCase.objects.filter(pk=cr.case_id).update(
            due_date=timezone.now().date() - timedelta(days=1)
        )
        q = self._get().data["queues"]["overdue_cases"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["case_id"], cr.case_id)
        self.assertTrue(q[0]["is_overdue"])

    def test_missing_documents_queue_returns_cases_with_missing(self):
        person = self._person()
        case_id = self._case(person["id"], requirements=["Passport copy", "Proof of funds"])
        q = self._get().data["queues"]["missing_documents"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["case_id"], case_id)
        self.assertGreaterEqual(len(q[0]["missing_document_titles"]), 1)

    def test_needs_replacement_queue(self):
        _, cr, _ = self._case_with_upload()
        from apps.organizations import portal_reviews

        portal_reviews.mark_case_request_needs_replacement(
            cr, self.owner, reason="Wrong document", notify_recipient=False
        )
        q = self._get().data["queues"]["needs_replacement"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["case_request_id"], cr.id)

    def test_ready_queue_returns_ready_cases(self):
        _, cr, _ = self._case_with_upload()
        PortalCase.objects.filter(pk=cr.case_id).update(status=PortalCase.Status.READY)
        q = self._get().data["queues"]["ready_cases"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["case_id"], cr.case_id)

    def test_recent_activity_returns_safe_events(self):
        self._case_with_upload()  # creating people/cases/requests records audit events
        q = self._get().data["queues"]["recent_activity"]
        self.assertGreaterEqual(len(q), 1)
        keys = set(q[0].keys())
        self.assertIn("event_type", keys)
        self.assertIn("created_at", keys)
        # No raw network/identity fields leak through.
        self.assertNotIn("ip_hash", keys)
        self.assertNotIn("metadata", keys)

    def test_queues_are_size_limited(self):
        from apps.organizations.portal_dashboard import QUEUE_LIMIT

        person = self._person()
        for i in range(QUEUE_LIMIT + 3):
            link = self._upload(self._request(self._case(person["id"], title=f"Case {i}")))
            self.assertIsNotNone(link)
        q = self._get().data["queues"]["review_now"]
        self.assertLessEqual(len(q), QUEUE_LIMIT)


class PrivacyTests(_Base):
    def test_dashboard_exposes_no_token_or_private_url_or_content(self):
        _, _, link = self._case_with_upload()
        resp = self._get()
        blob = json.dumps(resp.data)
        # No raw public token anywhere in the payload.
        self.assertNotIn(link.token, blob)
        # No private file/storage URLs or document bytes.
        self.assertNotIn("/media/", blob)
        self.assertNotIn("X-Amz", blob)
        self.assertNotIn("%PDF", blob)
        self.assertNotIn("r2.cloudflarestorage", blob)
        # File proxy URLs are never surfaced on the dashboard (review-only).
        self.assertNotIn("/file/preview/", blob)
        self.assertNotIn("/file/download/", blob)

    def test_dashboard_sends_no_email_and_has_generated_at(self):
        self._case_with_upload()
        mail.outbox.clear()
        resp = self._get()
        self.assertIn("generated_at", resp.data)
        self.assertEqual(len(mail.outbox), 0)
