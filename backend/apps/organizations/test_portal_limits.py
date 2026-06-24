"""
Teams Plan + Portal Limits V1 — organization-level portal entitlements.

Hermetic: no AI is ever called; the b2b_portals flag is forced on. Covers the
entitlement gate (portal_not_enabled vs enabled), the limits endpoint
(limits/usage/remaining), per-resource org limits (people / cases / requests /
rooms) with the organization_plan_limit_exceeded shape, terminal states freeing
slots, the set_organization_plan command, audit events, and the no-AI guarantee.
"""

from __future__ import annotations

from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.documents.models import AuditLogEntry, DocumentRequestLink, SharingRoom
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    OrganizationPlanProfile,
    PortalCase,
)
from apps.organizations.portal_limits import (
    ORG_PORTAL_PLAN_LIMITS,
    set_organization_plan,
)
from apps.users import plans

User = get_user_model()


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


class _Base(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
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
        self.base = f"/api/v1/organizations/{self.org.id}/portal"
        self.client.force_authenticate(self.owner)

    def _user(self, name):
        u = User.objects.create_user(username=name, email=f"{name}@x.com", password="StrongPass123!DN")
        u.plan = plans.PLAN_PRO_PLACEHOLDER
        u.save(update_fields=["plan"])
        return u

    def _enable(self, plan="teams_beta", **overrides):
        profile = set_organization_plan(self.org, plan=plan, portal_enabled=True)
        if overrides:
            for k, v in overrides.items():
                setattr(profile, k, v)
            profile.save()
        return profile

    def _person(self, name="Mamadou"):
        with _flag_on():
            return self.client.post(f"{self.base}/people/",
                                    {"full_name": name}, format="json")

    def _case(self, person_id, **extra):
        with _flag_on():
            return self.client.post(f"{self.base}/cases/",
                                    {"person": person_id, "title": "Case", **extra}, format="json")


class EntitlementGateTests(_Base):
    def test_org_without_entitlement_is_blocked(self):
        with _flag_on():
            resp = self.client.get(f"{self.base}/summary/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "portal_not_enabled")

    def test_teams_beta_org_can_access_portal(self):
        self._enable()
        with _flag_on():
            resp = self.client.get(f"{self.base}/summary/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_limits_endpoint_readable_when_disabled(self):
        # The limits endpoint reports the (disabled) state instead of 403.
        with _flag_on():
            resp = self.client.get(f"{self.base}/limits/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["portal_enabled"])
        self.assertEqual(resp.data["plan"], "free")

    def test_limits_endpoint_returns_limits_usage_remaining(self):
        self._enable()
        self._person()
        with _flag_on():
            resp = self.client.get(f"{self.base}/limits/")
        self.assertTrue(resp.data["portal_enabled"])
        self.assertEqual(resp.data["plan"], "teams_beta")
        self.assertEqual(resp.data["limits"]["max_portal_people"]
                         if "max_portal_people" in resp.data["limits"]
                         else resp.data["limits"]["portal_people"], 100)
        self.assertEqual(resp.data["usage"]["portal_people"], 1)
        self.assertEqual(resp.data["remaining"]["portal_people"], 99)


class ResourceLimitTests(_Base):
    def test_person_limit_enforced(self):
        self._enable(max_portal_people=1)
        self.assertEqual(self._person("A").status_code, 201)
        resp = self._person("B")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "organization_plan_limit_exceeded")
        self.assertEqual(resp.data["resource"], "portal_people")
        self.assertEqual(int(resp.data["limit"]), 1)
        self.assertEqual(int(resp.data["used"]), 1)

    def test_case_limit_enforced_and_archived_frees_slot(self):
        self._enable(max_active_portal_cases=1)
        person = self._person().data
        first = self._case(person["id"]).data
        self.assertEqual(self._case(person["id"]).status_code, 403)
        # Archive the first case -> a slot frees up.
        with _flag_on():
            self.client.post(f"{self.base}/cases/{first['id']}/archive/")
        self.assertEqual(self._case(person["id"]).status_code, 201)

    def test_active_document_request_limit_and_terminal_frees_slot(self):
        self._enable(max_active_document_requests=1)
        person = self._person().data
        case_id = self._case(person["id"]).data["id"]
        with _flag_on():
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport"]}, format="json")
            r1 = self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                                  {"requested_document_title": "Passport"}, format="json")
            self.assertEqual(r1.status_code, 201, r1.data)
            r2 = self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                                  {"requested_document_title": "Transcript"}, format="json")
        self.assertEqual(r2.status_code, 403)
        self.assertEqual(r2.data["resource"], "active_document_requests")
        # Cancel the first request (terminal) -> frees the active slot.
        link = DocumentRequestLink.objects.filter(
            portal_case_links__case_id=case_id).first()
        link.status = DocumentRequestLink.Status.CANCELLED
        link.save(update_fields=["status"])
        with _flag_on():
            r3 = self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                                  {"requested_document_title": "Transcript"}, format="json")
        self.assertEqual(r3.status_code, 201, r3.data)

    def test_active_sharing_room_limit(self):
        self._enable(max_active_sharing_rooms=1)
        p1 = self._person("A").data
        p2 = self._person("B").data
        c1 = self._case(p1["id"]).data["id"]
        c2 = self._case(p2["id"]).data["id"]
        with _flag_on():
            r1 = self.client.post(f"{self.base}/cases/{c1}/create-room/")
            self.assertEqual(r1.status_code, 201, r1.data)
            r2 = self.client.post(f"{self.base}/cases/{c2}/create-room/")
        self.assertEqual(r2.status_code, 403)
        self.assertEqual(r2.data["resource"], "active_sharing_rooms")

    def test_portal_rooms_do_not_consume_personal_limit(self):
        # The org owner is on Free for personal limits, but portal rooms are
        # governed by the ORG limit — so 5 rooms succeed despite Free's 3-room cap.
        self.owner.plan = plans.PLAN_FREE
        self.owner.save(update_fields=["plan"])
        self._enable(max_active_sharing_rooms=5)
        for i in range(5):
            person = self._person(f"P{i}").data
            case_id = self._case(person["id"]).data["id"]
            with _flag_on():
                resp = self.client.post(f"{self.base}/cases/{case_id}/create-room/")
            self.assertEqual(resp.status_code, 201, f"room {i}: {resp.data}")
        self.assertEqual(
            SharingRoom.objects.filter(owner=self.owner, status="active").count(), 5
        )


class CommandAndAuditTests(_Base):
    def test_management_command_sets_plan(self):
        out = StringIO()
        call_command("set_organization_plan", "--org-id", str(self.org.id),
                     "--plan", "teams", stdout=out)
        profile = OrganizationPlanProfile.objects.get(organization=self.org)
        self.assertEqual(profile.plan, "teams")
        self.assertTrue(profile.portal_enabled)
        self.assertIn("teams", out.getvalue())

    def test_plan_change_records_audit_events(self):
        set_organization_plan(self.org, plan="teams_beta", portal_enabled=True, actor=self.owner)
        events = set(
            AuditLogEntry.objects.filter(owner=self.owner).values_list("event_type", flat=True)
        )
        self.assertIn("organization_plan_profile_created", events)
        self.assertIn("organization_portal_enabled", events)

    def test_limit_reached_records_audit_event(self):
        self._enable(max_portal_people=1)
        self._person("A")
        self._person("B")  # blocked
        self.assertTrue(AuditLogEntry.objects.filter(
            owner=self.owner, event_type="organization_portal_limit_reached"
        ).exists())

    def test_non_member_cannot_read_limits(self):
        self._enable()
        outsider = self._user("outsider")
        self.client.force_authenticate(outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/limits/")
        self.assertEqual(resp.status_code, 403)

    def test_no_ai_call_in_limit_actions(self):
        self._enable()
        with mock.patch("apps.ai.client.generate") as g:
            person = self._person().data
            self._case(person["id"])
            with _flag_on():
                self.client.get(f"{self.base}/limits/")
        g.assert_not_called()
