"""
B2B Portals MVP — orchestration over existing primitives.

Hermetic: no AI is ever called; the b2b_portals flag is forced on. Covers
membership/role gating + org isolation, person/case CRUD, the orchestration
(create pack/room/request reusing the existing primitives — no duplicates),
progress + review queue, recipient defaulting from the person, audit events, and
the no-private-URL / no-AI guarantees.
"""

from __future__ import annotations

import json
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.documents.models import (
    AuditLogEntry,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentRequestLink,
    SharingRoom,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    PortalCase,
    PortalCaseDocumentRequest,
    PortalPerson,
)
from apps.users import plans

User = get_user_model()


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


class _Base(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
        self.member = self._user("member")
        self.outsider = self._user("outsider")
        self.org = Organization.objects.create(
            name="Visa Agency",
            organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner,
        )
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
        # Teams Plan V1: the portal requires an organization entitlement. Enable it
        # for this org so the existing portal flows are exercised.
        from apps.organizations.portal_limits import set_organization_plan

        set_organization_plan(self.org, plan="teams_beta", portal_enabled=True)
        self.base = f"/api/v1/organizations/{self.org.id}/portal"
        self.client.force_authenticate(self.owner)

    def _user(self, name):
        u = User.objects.create_user(
            username=name, email=f"{name}@x.com", password="StrongPass123!DN",
        )
        u.plan = plans.PLAN_PRO_PLACEHOLDER
        u.save(update_fields=["plan"])
        return u

    def _person(self, **extra):
        with _flag_on():
            resp = self.client.post(f"{self.base}/people/", {
                "full_name": "Mamadou Diallo", "email": "mamadou@x.com",
                "person_type": "client", **extra,
            }, format="json")
        return resp

    def _case(self, person_id, **extra):
        with _flag_on():
            return self.client.post(f"{self.base}/cases/", {
                "person": person_id, "title": "Visa application", "case_type": "visa", **extra,
            }, format="json")


class AccessTests(_Base):
    def test_member_can_access_summary(self):
        with _flag_on():
            resp = self.client.get(f"{self.base}/summary/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("active_cases", resp.data)

    def test_non_member_cannot_access_summary(self):
        self.client.force_authenticate(self.outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/summary/")
        self.assertEqual(resp.status_code, 403)

    def test_feature_gate_blocks_when_flag_off(self):
        with mock.patch("apps.features.flags.is_feature_enabled", return_value=False):
            resp = self.client.get(f"{self.base}/summary/")
        self.assertEqual(resp.status_code, 503)

    def test_requires_auth(self):
        self.client.force_authenticate(None)
        with _flag_on():
            self.assertEqual(self.client.get(f"{self.base}/summary/").status_code, 401)


class PeopleTests(_Base):
    def test_admin_creates_person(self):
        resp = self._person()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["full_name"], "Mamadou Diallo")

    def test_member_role_cannot_create_person(self):
        self.client.force_authenticate(self.member)
        resp = self._person()
        self.assertEqual(resp.status_code, 403)  # write requires admin/owner

    def test_create_person_requires_name(self):
        with _flag_on():
            resp = self.client.post(f"{self.base}/people/", {"full_name": ""}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_access_another_orgs_person(self):
        person = self._person().data
        other_owner = self._user("other")
        other_org = Organization.objects.create(name="Other", created_by=other_owner)
        OrganizationMembership.objects.create(
            organization=other_org, user=other_owner,
            role=OrganizationMembership.Role.OWNER, status=OrganizationMembership.Status.ACTIVE,
        )
        from apps.organizations.portal_limits import set_organization_plan

        set_organization_plan(other_org, plan="teams_beta", portal_enabled=True)
        self.client.force_authenticate(other_owner)
        with _flag_on():
            resp = self.client.get(
                f"/api/v1/organizations/{other_org.id}/portal/people/{person['id']}/"
            )
        self.assertEqual(resp.status_code, 404)

    def test_archive_person(self):
        person = self._person().data
        with _flag_on():
            resp = self.client.post(f"{self.base}/people/{person['id']}/archive/")
        self.assertEqual(resp.data["status"], "archived")


class CaseTests(_Base):
    def test_create_case(self):
        person = self._person().data
        resp = self._case(person["id"], due_date="2026-09-30")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["case_type"], "visa")
        self.assertEqual(resp.data["person"]["full_name"], "Mamadou Diallo")

    def test_case_person_must_belong_to_org(self):
        other_owner = self._user("o2")
        other_org = Organization.objects.create(name="O2", created_by=other_owner)
        foreign_person = PortalPerson.objects.create(
            organization=other_org, full_name="Theirs",
        )
        resp = self._case(foreign_person.id)
        self.assertEqual(resp.status_code, 404)  # person not found in THIS org

    def test_create_case_pack_links_pack_and_requirements(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            resp = self.client.post(f"{self.base}/cases/{case_id}/create-pack/", {
                "requirements": ["Passport copy", "Transcript"],
            }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNotNone(resp.data["linked_bundle"])
        bundle = DocumentBundle.objects.get(pk=resp.data["linked_bundle"])
        # The pack is owned by the case creator and reuses the existing primitive.
        self.assertEqual(bundle.owner_id, self.owner.id)
        self.assertEqual(bundle.requirements.count(), 2)

    def test_create_case_room_links_sharing_room(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            resp = self.client.post(f"{self.base}/cases/{case_id}/create-room/")
        self.assertEqual(resp.status_code, 201, resp.data)
        room = SharingRoom.objects.get(pk=resp.data["linked_room"])
        self.assertEqual(room.owner_id, self.owner.id)
        # Public URL is the app room route — never a storage URL.
        self.assertIn("/room/", resp.data["room_public_url"])

    def test_create_case_request_defaults_recipient_from_person(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            resp = self.client.post(f"{self.base}/cases/{case_id}/create-request/", {
                "requested_document_title": "Passport copy",
            }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        link = DocumentRequestLink.objects.filter(owner=self.owner).first()
        self.assertEqual(link.recipient_name, "Mamadou Diallo")
        self.assertEqual(link.recipient_email, "mamadou@x.com")
        # Linked to the case (reuses the existing request system — no duplicate).
        self.assertTrue(PortalCaseDocumentRequest.objects.filter(
            case_id=case_id, document_request=link).exists())
        # No raw storage URL in the payload.
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "/media/"):
            self.assertNotIn(marker, blob)

    def test_archive_case_removes_from_active_list(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/archive/")
            resp = self.client.get(f"{self.base}/cases/?active=true")
        ids = [c["id"] for c in resp.data["cases"]]
        self.assertNotIn(case_id, ids)


class ProgressAndReviewTests(_Base):
    def _case_with_request(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            requirement = DocumentBundleRequirement.objects.get(owner=self.owner)
            self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                             {"requested_document_title": "Passport copy",
                              "requirement": requirement.id}, format="json")
        link = DocumentRequestLink.objects.get(owner=self.owner)
        return case_id, link

    def test_progress_computes_from_pack_and_requests(self):
        case_id, link = self._case_with_request()
        with _flag_on():
            resp = self.client.get(f"{self.base}/cases/{case_id}/progress/")
        self.assertEqual(resp.data["total_requirements"], 1)
        self.assertEqual(resp.data["missing_requirements"], 1)
        self.assertEqual(resp.data["requests_total"], 1)
        self.assertEqual(resp.data["suggested_status"], "collecting_documents")

    def test_review_queue_lists_uploaded_requests(self):
        case_id, link = self._case_with_request()
        # Simulate a recipient upload (status -> uploaded).
        link.status = DocumentRequestLink.Status.UPLOADED
        link.save(update_fields=["status"])
        with _flag_on():
            resp = self.client.get(f"{self.base}/review-queue/")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["items"][0]["document_request_id"], link.id)
        # And the case progress now suggests review.
        with _flag_on():
            prog = self.client.get(f"{self.base}/cases/{case_id}/progress/")
        self.assertEqual(prog.data["uploads_needing_review"], 1)
        self.assertEqual(prog.data["suggested_status"], "waiting_for_review")

    def test_accepted_request_satisfies_progress(self):
        from apps.documents.document_requests import (
            accept_document_request,
            attach_request_file_to_pack,
        )
        from apps.documents.models import DocumentFile
        from apps.documents.file_encryption import encrypt_bytes_into_record

        case_id, link = self._case_with_request()
        # Attach a real uploaded file + accept + attach to the pack requirement.
        f = DocumentFile(uploaded_by=self.owner, original_filename="p.pdf",
                         content_type="application/pdf", file_size=10)
        encrypt_bytes_into_record(f, b"%PDF-1.4", "p.pdf")
        f.save()
        link.uploaded_file = f
        link.status = DocumentRequestLink.Status.UPLOADED
        link.save(update_fields=["uploaded_file", "status"])
        accept_document_request(link)
        attach_request_file_to_pack(link)
        with _flag_on():
            resp = self.client.get(f"{self.base}/cases/{case_id}/progress/")
        self.assertEqual(resp.data["satisfied_requirements"], 1)
        self.assertEqual(resp.data["missing_requirements"], 0)
        self.assertEqual(resp.data["suggested_status"], "ready")


class AuditAndNoAiTests(_Base):
    def test_portal_events_are_audited(self):
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
        events = set(
            AuditLogEntry.objects.filter(owner=self.owner).values_list("event_type", flat=True)
        )
        self.assertIn("portal_person_created", events)
        self.assertIn("portal_case_created", events)
        self.assertIn("portal_case_pack_created", events)
        # org_id is in metadata; no document contents / tokens / urls.
        entry = AuditLogEntry.objects.get(owner=self.owner, event_type="portal_case_created")
        self.assertEqual(entry.metadata.get("org_id"), self.org.id)
        blob = json.dumps(entry.metadata).lower()
        for marker in ("token", "http", "/media/"):
            self.assertNotIn(marker, blob)

    def test_no_ai_call_in_portal_actions(self):
        with mock.patch("apps.ai.client.generate") as g, _flag_on():
            person = self.client.post(f"{self.base}/people/",
                                      {"full_name": "X"}, format="json").data
            case = self.client.post(f"{self.base}/cases/",
                                    {"person": person["id"], "title": "C"}, format="json").data
            self.client.post(f"{self.base}/cases/{case['id']}/create-pack/",
                             {"requirements": ["Passport"]}, format="json")
            self.client.post(f"{self.base}/cases/{case['id']}/create-request/",
                             {"requested_document_title": "Passport"}, format="json")
        g.assert_not_called()
