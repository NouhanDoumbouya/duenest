"""
Organization Templates V1 — reusable case workflows for B2B portals.

Hermetic: the b2b_portals flag is forced on and the org is on teams_beta; no AI
is ever called; email uses the in-memory backend. Covers template CRUD +
permissions, requirement ordering, archive blocks case creation, and the
create-case-from-template flow (case + pack + room + requests, title placeholder,
due-date computation, requirement linkage, org-limit enforcement, audit events,
and the privacy guarantees).
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.documents.models import (
    AuditLogEntry,
    DocumentBundle,
    DocumentRequestLink,
    SharingRoom,
)
from apps.organizations.models import (
    Organization,
    OrganizationCaseTemplate,
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

_REQS = [
    {"title": "Passport copy", "instructions": "Bio page.", "required": True,
     "sort_order": 1, "request_message": "Please upload a clear passport copy.",
     "due_days_offset": 7},
    {"title": "Academic transcript", "instructions": "Latest transcript.",
     "required": True, "sort_order": 2,
     "request_message": "Please upload your transcript.", "due_days_offset": 7},
]


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


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

    def _person(self, full_name="Mamadou Diallo", email="recipient@x.com"):
        with _flag_on():
            return self.client.post(f"{self.base}/people/", {
                "full_name": full_name, "email": email,
            }, format="json").data

    def _template(self, **over):
        body = {
            "name": "Scholarship Application Checklist",
            "case_type": "scholarship",
            "default_case_title": "Scholarship Application — {person_name}",
            "default_priority": "normal",
            "default_due_days": 21,
            "auto_create_pack": True,
            "auto_create_room": True,
            "auto_create_requests": False,
            "requirements": _REQS,
        }
        body.update(over)
        with _flag_on():
            return self.client.post(f"{self.base}/templates/", body, format="json")

    def _create_case(self, template_id, person_id, **body):
        body["person_id"] = person_id
        with _flag_on():
            return self.client.post(
                f"{self.base}/templates/{template_id}/create-case/", body, format="json")


class TemplateCrudTests(_Base):
    def test_member_can_list_templates(self):
        self._template()
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.get(f"{self.base}/templates/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["count"], 1)

    def test_non_member_cannot_list(self):
        self.client.force_authenticate(self.outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/templates/")
        self.assertIn(resp.status_code, (403, 404))

    def test_admin_can_create_template(self):
        self.client.force_authenticate(self.admin)
        resp = self._template()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["case_type"], "scholarship")
        self.assertEqual(resp.data["requirement_count"], 2)

    def test_member_cannot_create_template(self):
        self.client.force_authenticate(self.member)
        resp = self._template()
        self.assertEqual(resp.status_code, 403)

    def test_requirements_created_in_order(self):
        tid = self._template().data["id"]
        with _flag_on():
            detail = self.client.get(f"{self.base}/templates/{tid}/")
        titles = [r["title"] for r in detail.data["requirements"]]
        self.assertEqual(titles, ["Passport copy", "Academic transcript"])

    def test_admin_can_update_template(self):
        tid = self._template().data["id"]
        with _flag_on():
            resp = self.client.patch(f"{self.base}/templates/{tid}/",
                                     {"name": "Renamed", "default_due_days": 30},
                                     format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["name"], "Renamed")
        self.assertEqual(resp.data["default_due_days"], 30)

    def test_admin_can_archive_template(self):
        tid = self._template().data["id"]
        with _flag_on():
            resp = self.client.post(f"{self.base}/templates/{tid}/archive/", {}, format="json")
        self.assertEqual(resp.data["status"], "archived")
        # Archived templates are excluded from the default list.
        with _flag_on():
            listed = self.client.get(f"{self.base}/templates/")
        self.assertEqual(listed.data["count"], 0)

    def test_archived_template_cannot_create_case(self):
        tid = self._template().data["id"]
        person = self._person()
        with _flag_on():
            self.client.post(f"{self.base}/templates/{tid}/archive/", {}, format="json")
        resp = self._create_case(tid, person["id"])
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_template(self):
        tid = self._template().data["id"]
        with _flag_on():
            resp = self.client.post(f"{self.base}/templates/{tid}/duplicate/", {}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIn("(copy)", resp.data["name"])
        self.assertEqual(resp.data["requirement_count"], 2)


class CreateCaseFromTemplateTests(_Base):
    def test_creates_case_with_title_placeholder_and_due_date(self):
        tid = self._template().data["id"]
        person = self._person(full_name="Mamadou Diallo")
        resp = self._create_case(tid, person["id"], create_pack=False, create_room=False)
        self.assertEqual(resp.status_code, 201, resp.data)
        case = resp.data["case"]
        self.assertEqual(case["title"], "Scholarship Application — Mamadou Diallo")
        self.assertEqual(case["case_type"], "scholarship")
        # default_due_days=21 → due date 21 days out.
        expected = (timezone.now().date() + timedelta(days=21)).isoformat()
        self.assertEqual(case["due_date"], expected)

    def test_creates_pack_with_template_requirements(self):
        tid = self._template().data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_room=False)
        self.assertTrue(resp.data["pack_created"])
        case_id = resp.data["case"]["id"]
        bundle = DocumentBundle.objects.get(portal_cases=case_id)
        reqs = list(bundle.requirements.order_by("sort_order"))
        self.assertEqual([r.title for r in reqs], ["Passport copy", "Academic transcript"])
        # Instructions carried into the pack requirement description.
        self.assertEqual(reqs[0].description, "Bio page.")
        # Progress reflects the two required, none satisfied.
        self.assertEqual(resp.data["progress"]["missing_requirements"], 2)

    def test_creates_room_when_requested(self):
        tid = self._template(default_room_title="Case room").data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_room=True)
        self.assertTrue(resp.data["room_created"])
        case_id = resp.data["case"]["id"]
        room = SharingRoom.objects.get(portal_cases=case_id)
        self.assertEqual(room.title, "Case room")

    def test_creates_requests_with_recipient_and_instructions(self):
        tid = self._template(auto_create_requests=True).data["id"]
        person = self._person(full_name="Mamadou Diallo", email="mamadou@x.com")
        resp = self._create_case(tid, person["id"], create_pack=True, create_room=False,
                                 create_requests=True, send_request_emails=False)
        self.assertEqual(resp.data["created_requests_count"], 2)
        case_id = resp.data["case"]["id"]
        links = DocumentRequestLink.objects.filter(portal_case_links__case_id=case_id)
        self.assertEqual(links.count(), 2)
        passport = links.get(requested_document_title="Passport copy")
        self.assertEqual(passport.recipient_email, "mamadou@x.com")
        self.assertEqual(passport.recipient_name, "Mamadou Diallo")
        self.assertEqual(passport.instructions, "Please upload a clear passport copy.")
        # Each request is linked via PortalCaseDocumentRequest to a requirement.
        cr = PortalCaseDocumentRequest.objects.get(document_request=passport)
        self.assertIsNotNone(cr.requirement_id)

    def test_selected_requirement_ids_subset(self):
        tid = self._template(auto_create_requests=True).data["id"]
        with _flag_on():
            detail = self.client.get(f"{self.base}/templates/{tid}/")
        first_req_id = detail.data["requirements"][0]["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_requests=True,
                                 selected_requirement_ids=[first_req_id])
        self.assertEqual(resp.data["created_requests_count"], 1)

    def test_active_case_limit_enforced(self):
        # teams_beta active_portal_cases limit is finite; drop it to 0 via override.
        from apps.organizations.models import OrganizationPlanProfile

        OrganizationPlanProfile.objects.filter(organization=self.org).update(
            max_active_portal_cases=0
        )
        tid = self._template().data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"])
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data.get("code"), "organization_plan_limit_exceeded")

    def test_room_limit_becomes_warning_not_failure(self):
        from apps.organizations.models import OrganizationPlanProfile

        OrganizationPlanProfile.objects.filter(organization=self.org).update(
            max_active_sharing_rooms=0
        )
        tid = self._template().data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_room=True)
        # Case is still created; the room is skipped with a warning.
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertFalse(resp.data["room_created"])
        self.assertIn("room_limit_reached", resp.data["warnings"])

    def test_request_limit_becomes_warning(self):
        from apps.organizations.models import OrganizationPlanProfile

        OrganizationPlanProfile.objects.filter(organization=self.org).update(
            max_active_document_requests=1
        )
        tid = self._template(auto_create_requests=True).data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_requests=True)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["created_requests_count"], 1)
        self.assertIn("request_limit_reached", resp.data["warnings"])


class PermissionGateTests(_Base):
    def test_member_cannot_create_case_from_template(self):
        tid = self._template().data["id"]
        person = self._person()
        self.client.force_authenticate(self.member)
        resp = self._create_case(tid, person["id"])
        self.assertEqual(resp.status_code, 403)

    def test_feature_flag_off_503(self):
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=False):
            resp = self.client.get(f"{self.base}/templates/")
        self.assertEqual(resp.status_code, 503)

    def test_portal_not_enabled_403(self):
        set_organization_plan(self.org, plan="free", portal_enabled=False)
        with _flag_on():
            resp = self.client.get(f"{self.base}/templates/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data.get("code"), "portal_not_enabled")


class AuditAndPrivacyTests(_Base):
    def test_audit_events_recorded(self):
        tid = self._template(auto_create_requests=True).data["id"]
        person = self._person()
        self._create_case(tid, person["id"], create_pack=True, create_room=True,
                          create_requests=True)
        types = set(
            AuditLogEntry.objects.filter(
                event_type__in=[
                    "organization_template_created", "portal_case_created_from_template",
                    "portal_template_pack_created", "portal_template_room_created",
                    "portal_template_requests_created",
                ]
            ).values_list("event_type", flat=True)
        )
        self.assertIn("organization_template_created", types)
        self.assertIn("portal_case_created_from_template", types)
        self.assertIn("portal_template_pack_created", types)
        self.assertIn("portal_template_room_created", types)
        self.assertIn("portal_template_requests_created", types)

    def test_audit_metadata_has_no_token_or_url(self):
        tid = self._template(auto_create_requests=True).data["id"]
        person = self._person()
        self._create_case(tid, person["id"], create_pack=True, create_requests=True)
        link = DocumentRequestLink.objects.filter(
            portal_case_links__case__organization=self.org
        ).first()
        for e in AuditLogEntry.objects.filter(event_type__startswith="portal_template"):
            blob = json.dumps(e.metadata)
            self.assertNotIn(link.token, blob)
            self.assertNotIn("http", blob)
            self.assertNotIn("/media/", blob)

    def test_response_exposes_no_private_file_url_or_content(self):
        # The case payload deliberately carries the recipient-facing PUBLIC page
        # links (room_public_url / upload_url) — the established "copy link
        # manually" behavior. What must never leak: private FILE URLs, storage
        # keys, or document contents.
        tid = self._template(auto_create_requests=True).data["id"]
        person = self._person()
        resp = self._create_case(tid, person["id"], create_pack=True, create_room=True,
                                 create_requests=True)
        blob = json.dumps(resp.data)
        self.assertNotIn("/media/", blob)
        self.assertNotIn("X-Amz", blob)
        self.assertNotIn("%PDF", blob)
        self.assertNotIn("r2.cloudflarestorage", blob)
        self.assertNotIn("/api/v1/files/", blob)
        self.assertNotIn("/file/preview/", blob)

    def test_new_case_types_round_trip(self):
        # The 3 added case types apply cleanly (not coerced to general).
        for ct in ("insurance_claim", "grant", "internship"):
            tid = self._template(case_type=ct).data["id"]
            person = self._person(email=f"{ct}@x.com")
            resp = self._create_case(tid, person["id"], create_pack=False, create_room=False)
            self.assertEqual(resp.data["case"]["case_type"], ct)
