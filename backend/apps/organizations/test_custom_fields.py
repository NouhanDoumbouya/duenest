"""
B2B Custom Fields and Statuses V1 — org-defined metadata + workflow statuses.

Hermetic: the b2b_portals flag is forced on and the org is on teams_beta; no AI is
ever called. Covers field CRUD + permissions + key uniqueness, per-type value
validation, person/case values + org isolation + archived-field rejection, custom
case statuses + system-status mapping + archive, default seeding, template
integration, the safe custom filters, limits, and the audit/privacy guarantees
(audit records which keys changed, never the values).
"""

from __future__ import annotations

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.documents.models import AuditLogEntry
from apps.organizations.models import (
    Organization,
    OrganizationCaseStatusDefinition,
    OrganizationCustomField,
    OrganizationCustomFieldValue,
    OrganizationMembership,
    PortalCase,
)
from apps.organizations.portal_limits import set_organization_plan
from apps.users import plans

User = get_user_model()


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


@override_settings(DUENEST_APP_BASE_URL="https://app.certanest.test")
class _Base(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
        self.admin = self._user("admin")
        self.member = self._user("member")
        self.outsider = self._user("outsider")
        self.org = Organization.objects.create(
            name="Admissions Agency",
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
        self.client.force_authenticate(self.admin)

    def _user(self, name):
        u = User.objects.create_user(username=name, email=f"{name}@x.com",
                                     password="StrongPass123!DN", first_name=name.title())
        u.plan = plans.PLAN_PRO_PLACEHOLDER
        u.save(update_fields=["plan"])
        return u

    def _field(self, **over):
        body = {"label": "Student ID", "target": "case", "field_type": "short_text"}
        body.update(over)
        with _flag_on():
            return self.client.post(f"{self.base}/custom-fields/", body, format="json")

    def _person(self, full_name="Mamadou", email="m@x.com"):
        with _flag_on():
            return self.client.post(f"{self.base}/people/",
                                    {"full_name": full_name, "email": email}, format="json").data

    def _case(self, person_id, title="Admission"):
        with _flag_on():
            return self.client.post(f"{self.base}/cases/",
                                    {"person": person_id, "title": title, "case_type": "admission"},
                                    format="json").data


class FieldCrudTests(_Base):
    def test_admin_can_create_person_and_case_fields(self):
        p = self._field(target="person", label="Counselor")
        c = self._field(target="case", label="Intake month")
        self.assertEqual(p.status_code, 201, p.data)
        self.assertEqual(c.status_code, 201, c.data)
        self.assertEqual(p.data["target"], "person")

    def test_non_member_cannot_access(self):
        self.client.force_authenticate(self.outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/custom-fields/")
        self.assertIn(resp.status_code, (403, 404))

    def test_member_cannot_create_field(self):
        self.client.force_authenticate(self.member)
        resp = self._field()
        self.assertEqual(resp.status_code, 403)

    def test_member_can_view_fields(self):
        self._field()
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.get(f"{self.base}/custom-fields/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_key_uniqueness_per_org_target(self):
        a = self._field(label="Student ID", target="case")
        b = self._field(label="Student ID", target="case")
        self.assertNotEqual(a.data["key"], b.data["key"])  # auto-suffixed
        # Same label different target is independent.
        p = self._field(label="Student ID", target="person")
        self.assertEqual(p.data["key"], "student-id")

    def test_invalid_field_type_rejected(self):
        resp = self._field(field_type="rocket")
        self.assertEqual(resp.status_code, 400)


class ValidationTests(_Base):
    def setUp(self):
        super().setUp()
        person = self._person()
        self.case = self._case(person["id"])
        self.person_id = person["id"]

    def _make(self, field_type, **over):
        return self._field(field_type=field_type, target="case", **over).data

    def _set(self, key, value):
        with _flag_on():
            return self.client.patch(f"{self.base}/cases/{self.case['id']}/custom-fields/",
                                     {"values": {key: value}}, format="json")

    def test_number_validation(self):
        f = self._make("number", label="Score")
        self.assertEqual(self._set(f["key"], "42").status_code, 200)
        self.assertEqual(self._set(f["key"], "not-a-number").status_code, 400)

    def test_date_validation(self):
        f = self._make("date", label="Embassy date")
        self.assertEqual(self._set(f["key"], "2026-08-30").status_code, 200)
        self.assertEqual(self._set(f["key"], "30/08/2026").status_code, 400)

    def test_email_and_url_validation(self):
        e = self._make("email", label="Contact")
        self.assertEqual(self._set(e["key"], "a@b.com").status_code, 200)
        self.assertEqual(self._set(e["key"], "nope").status_code, 400)
        u = self._make("url", label="Portal")
        self.assertEqual(self._set(u["key"], "https://x.com").status_code, 200)
        self.assertEqual(self._set(u["key"], "javascript:alert(1)").status_code, 400)

    def test_single_select_only_allows_option(self):
        f = self._make("single_select", label="Visa type",
                       options=[{"key": "f1", "label": "F-1"}, {"key": "j1", "label": "J-1"}])
        self.assertEqual(self._set(f["key"], "f1").status_code, 200)
        self.assertEqual(self._set(f["key"], "x9").status_code, 400)

    def test_multi_select_validates_each(self):
        f = self._make("multi_select", label="Docs",
                       options=[{"key": "a", "label": "A"}, {"key": "b", "label": "B"}])
        self.assertEqual(self._set(f["key"], ["a", "b"]).status_code, 200)
        self.assertEqual(self._set(f["key"], ["a", "zzz"]).status_code, 400)

    def test_required_field_rejected_when_blank(self):
        f = self._make("short_text", label="Program", required=True)
        self.assertEqual(self._set(f["key"], "").status_code, 400)


class ValueTests(_Base):
    def test_values_saved_for_person_and_case(self):
        person = self._person()
        case = self._case(person["id"])
        pf = self._field(target="person", label="Department").data
        cf = self._field(target="case", label="University").data
        with _flag_on():
            self.client.patch(f"{self.base}/people/{person['id']}/custom-fields/",
                              {"values": {pf["key"]: "Admissions"}}, format="json")
            self.client.patch(f"{self.base}/cases/{case['id']}/custom-fields/",
                              {"values": {cf["key"]: "MIT"}}, format="json")
        self.assertEqual(
            OrganizationCustomFieldValue.objects.get(field__key=pf["key"]).value, "Admissions")
        self.assertEqual(
            OrganizationCustomFieldValue.objects.get(field__key=cf["key"]).value, "MIT")

    def test_values_in_case_payload(self):
        person = self._person()
        case = self._case(person["id"])
        cf = self._field(target="case", label="University").data
        with _flag_on():
            self.client.patch(f"{self.base}/cases/{case['id']}/custom-fields/",
                              {"values": {cf["key"]: "MIT"}}, format="json")
            detail = self.client.get(f"{self.base}/cases/{case['id']}/")
        self.assertEqual(detail.data["custom_fields"].get(cf["key"]), "MIT")

    def test_archived_field_takes_no_new_values(self):
        person = self._person()
        case = self._case(person["id"])
        cf = self._field(target="case", label="Temp").data
        with _flag_on():
            self.client.post(f"{self.base}/custom-fields/{cf['id']}/archive/", {}, format="json")
            resp = self.client.patch(f"{self.base}/cases/{case['id']}/custom-fields/",
                                     {"values": {cf["key"]: "x"}}, format="json")
        # Archived field is skipped (not in active schema) → no value stored.
        self.assertEqual(resp.data["changed"], [])
        self.assertEqual(OrganizationCustomFieldValue.objects.filter(field=cf["id"]).count(), 0)

    def test_value_cannot_cross_org_boundary(self):
        # A field from another org cannot be set on this org's case.
        other = Organization.objects.create(
            name="Other", organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner)
        foreign = OrganizationCustomField.objects.create(
            organization=other, key="secret", label="Secret", target="case",
            field_type="short_text")
        person = self._person()
        case = self._case(person["id"])
        with _flag_on():
            resp = self.client.patch(f"{self.base}/cases/{case['id']}/custom-fields/",
                                     {"values": {"secret": "leak"}}, format="json")
        self.assertEqual(resp.data["changed"], [])
        self.assertFalse(OrganizationCustomFieldValue.objects.filter(field=foreign).exists())


class StatusTests(_Base):
    def test_create_status_and_set_on_case(self):
        with _flag_on():
            status_def = self.client.post(f"{self.base}/case-statuses/", {
                "label": "Embassy Stage", "category": "reviewing",
                "maps_to_system_status": "under_review", "color": "amber"}, format="json")
        self.assertEqual(status_def.status_code, 201, status_def.data)
        person = self._person()
        case = self._case(person["id"])
        with _flag_on():
            resp = self.client.post(f"{self.base}/cases/{case['id']}/status/",
                                    {"status_id": status_def.data["id"]}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["custom_status"]["label"], "Embassy Stage")
        # System status kept in sync from category 'reviewing' → waiting_for_review.
        self.assertEqual(resp.data["status"], "waiting_for_review")

    def test_status_category_maps_to_system(self):
        person = self._person()
        case_obj = PortalCase.objects.get(pk=self._case(person["id"])["id"])
        with _flag_on():
            ready = self.client.post(f"{self.base}/case-statuses/",
                                     {"label": "Done", "category": "completed"}, format="json").data
            self.client.post(f"{self.base}/cases/{case_obj.id}/status/",
                             {"status_id": ready["id"]}, format="json")
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, "completed")

    def test_seed_defaults(self):
        with _flag_on():
            resp = self.client.post(f"{self.base}/case-statuses/seed-defaults/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertGreaterEqual(len(resp.data["statuses"]), 5)
        self.assertTrue(OrganizationCaseStatusDefinition.objects.filter(
            organization=self.org, key="planning").exists())

    def test_archived_status_handled(self):
        with _flag_on():
            s = self.client.post(f"{self.base}/case-statuses/",
                                 {"label": "Temp", "category": "planning"}, format="json").data
            self.client.post(f"{self.base}/case-statuses/{s['id']}/archive/", {}, format="json")
            listed = self.client.get(f"{self.base}/case-statuses/")
        self.assertEqual([x for x in listed.data["statuses"] if x["id"] == s["id"]], [])

    def test_status_cannot_cross_org(self):
        other = Organization.objects.create(
            name="Other", organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner)
        foreign = OrganizationCaseStatusDefinition.objects.create(
            organization=other, key="x", label="X", category="planning")
        person = self._person()
        case = self._case(person["id"])
        with _flag_on():
            resp = self.client.post(f"{self.base}/cases/{case['id']}/status/",
                                    {"status_id": foreign.id}, format="json")
        self.assertEqual(resp.status_code, 404)


class TemplateAndFilterTests(_Base):
    def test_template_applies_custom_defaults(self):
        from apps.organizations import custom_fields

        custom_fields.seed_default_case_statuses(self.org, self.admin)
        field = self._field(target="case", label="University").data
        with _flag_on():
            tmpl = self.client.post(f"{self.base}/templates/", {
                "name": "Admission", "case_type": "admission",
                "default_custom_status_key": "planning",
                "default_custom_field_values": {field["key"]: "MIT"},
            }, format="json").data
            person = self._person()
            result = self.client.post(f"{self.base}/templates/{tmpl['id']}/create-case/",
                                      {"person_id": person["id"]}, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        case = result.data["case"]
        self.assertEqual(case["custom_fields"].get(field["key"]), "MIT")
        self.assertEqual(case["custom_status"]["key"], "planning")

    def test_case_list_filters_by_custom_status(self):
        with _flag_on():
            s = self.client.post(f"{self.base}/case-statuses/",
                                 {"label": "Stage A", "category": "collecting"}, format="json").data
            person = self._person()
            c1 = self._case(person["id"], title="A")
            self._case(person["id"], title="B")
            self.client.post(f"{self.base}/cases/{c1['id']}/status/",
                             {"status_id": s["id"]}, format="json")
            resp = self.client.get(f"{self.base}/cases/", {"custom_status": s["id"]})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["cases"][0]["id"], c1["id"])

    def test_dashboard_includes_custom_status_counts(self):
        with _flag_on():
            s = self.client.post(f"{self.base}/case-statuses/",
                                 {"label": "Stage", "category": "collecting"}, format="json").data
            person = self._person()
            case = self._case(person["id"])
            self.client.post(f"{self.base}/cases/{case['id']}/status/",
                             {"status_id": s["id"]}, format="json")
            dash = self.client.get(f"{self.base}/dashboard/")
        counts = dash.data["metrics"]["custom_status_counts"]
        self.assertTrue(any(c["status_id"] == s["id"] and c["count"] == 1 for c in counts))


class LimitsAndAuditTests(_Base):
    def test_field_limit_enforced(self):
        # teams_beta cap is 50 fields.
        for i in range(50):
            OrganizationCustomField.objects.create(
                organization=self.org, key=f"f{i}", label=f"F{i}",
                target="case", field_type="short_text")
        resp = self._field(label="Over limit")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("limit", resp.data["detail"].lower())

    def test_audit_records_keys_not_values(self):
        person = self._person()
        case = self._case(person["id"])
        f = self._field(target="case", label="Tax ID").data
        with _flag_on():
            self.client.patch(f"{self.base}/cases/{case['id']}/custom-fields/",
                              {"values": {f["key"]: "SENSITIVE-123-45-6789"}}, format="json")
        ev = AuditLogEntry.objects.get(event_type="organization_custom_field_value_updated")
        blob = json.dumps(ev.metadata)
        # The changed key is recorded; the sensitive VALUE is not.
        self.assertIn(f["key"], blob)
        self.assertNotIn("SENSITIVE-123-45-6789", blob)

    def test_field_crud_audit_events(self):
        f = self._field(label="Risk level").data
        with _flag_on():
            self.client.post(f"{self.base}/custom-fields/{f['id']}/archive/", {}, format="json")
        types = set(AuditLogEntry.objects.filter(
            event_type__startswith="organization_custom_field").values_list("event_type", flat=True))
        self.assertIn("organization_custom_field_created", types)
        self.assertIn("organization_custom_field_archived", types)
