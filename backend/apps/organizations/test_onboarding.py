"""
Onboarding & Demo Workspaces V1 — organization portal onboarding + demo.

Hermetic: the b2b_portals flag is forced on; no AI is called and no email is
sent. Covers the derived checklist + membership gating, demo idempotency + safety
(no emails, no files, no tokens/URLs), and cleanup.
"""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.documents.models import DocumentFile
from apps.notifications.models import EmailLog
from apps.organizations.models import (
    Organization,
    OrganizationCaseTemplate,
    OrganizationMembership,
    OrganizationOnboarding,
    PortalCase,
    PortalPerson,
)

User = get_user_model()


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


class OrgOnboardingTests(APITestCase):
    def setUp(self):
        self.owner = self._user("owner")
        self.member = self._user("member")
        self.outsider = self._user("outsider")
        self.org = Organization.objects.create(name="Demo Agency", created_by=self.owner)
        for user, role in (
            (self.owner, OrganizationMembership.Role.OWNER),
            (self.member, OrganizationMembership.Role.MEMBER),
        ):
            OrganizationMembership.objects.create(
                organization=self.org,
                user=user,
                role=role,
                status=OrganizationMembership.Status.ACTIVE,
            )
        from apps.organizations.portal_limits import set_organization_plan

        set_organization_plan(self.org, plan="teams_beta", portal_enabled=True)
        self.base = f"/api/v1/organizations/{self.org.id}/portal"

    def _user(self, name):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", password="StrongPass123!DN"
        )

    # ---- Onboarding checklist ----------------------------------------------

    def test_member_sees_derived_checklist(self):
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.get(f"{self.base}/onboarding/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["mode"], "organization")
        self.assertEqual(len(resp.data["steps"]), 8)
        # Fresh org: nothing done; next action is "create a template".
        self.assertTrue(all(not s["done"] for s in resp.data["steps"]))
        self.assertEqual(resp.data["percent"], 0)
        self.assertEqual(resp.data["next_action"]["key"], "create_template")

    def test_non_member_blocked(self):
        self.client.force_authenticate(self.outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/onboarding/")
        self.assertEqual(resp.status_code, 403)

    def test_dismiss_requires_admin(self):
        with _flag_on():
            self.client.force_authenticate(self.member)
            self.assertEqual(
                self.client.post(f"{self.base}/onboarding/dismiss/").status_code, 403
            )
            self.client.force_authenticate(self.owner)
            resp = self.client.post(f"{self.base}/onboarding/dismiss/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["dismissed"])

    # ---- Demo workspace -----------------------------------------------------

    def test_demo_create_is_idempotent_and_builds_workspace(self):
        self.client.force_authenticate(self.owner)
        with _flag_on():
            first = self.client.post(f"{self.base}/demo/")
            self.assertEqual(first.status_code, 200)
            self.assertTrue(first.data["created"])
            # The sample workspace exists.
            self.assertTrue(
                PortalPerson.objects.filter(
                    organization=self.org, full_name="Demo Applicant"
                ).exists()
            )
            self.assertTrue(PortalCase.objects.filter(organization=self.org).exists())
            self.assertTrue(
                OrganizationCaseTemplate.objects.filter(organization=self.org).exists()
            )
            # Checklist now reflects real progress.
            self.assertGreaterEqual(first.data["onboarding"]["completed_count"], 4)

            # Idempotent: a second call does not duplicate.
            second = self.client.post(f"{self.base}/demo/")
            self.assertFalse(second.data["created"])
        self.assertEqual(
            PortalPerson.objects.filter(organization=self.org).count(), 1
        )
        self.assertEqual(PortalCase.objects.filter(organization=self.org).count(), 1)

    def test_demo_requires_admin(self):
        self.client.force_authenticate(self.member)
        with _flag_on():
            self.assertEqual(self.client.post(f"{self.base}/demo/").status_code, 403)

    def test_demo_sends_no_email_and_creates_no_files(self):
        self.client.force_authenticate(self.owner)
        with _flag_on():
            self.client.post(f"{self.base}/demo/")
        # No email was sent and the demo person has no address.
        self.assertEqual(EmailLog.objects.count(), 0)
        person = PortalPerson.objects.get(
            organization=self.org, full_name="Demo Applicant"
        )
        self.assertEqual(person.email, "")
        # No document files are created (requirements are placeholders only).
        self.assertEqual(DocumentFile.objects.count(), 0)

    def test_demo_payload_has_no_tokens_or_urls(self):
        self.client.force_authenticate(self.owner)
        with _flag_on():
            resp = self.client.post(f"{self.base}/demo/")
        blob = str(resp.data).lower()
        for bad in ("http", "token", "upload_url", "public_url"):
            self.assertNotIn(bad, blob)

    def test_demo_cleanup_removes_everything(self):
        self.client.force_authenticate(self.owner)
        with _flag_on():
            self.client.post(f"{self.base}/demo/")
            self.assertTrue(PortalCase.objects.filter(organization=self.org).exists())
            cleanup = self.client.post(f"{self.base}/demo/cleanup/")
            self.assertEqual(cleanup.status_code, 200)
            self.assertTrue(cleanup.data["removed"])
        self.assertFalse(PortalCase.objects.filter(organization=self.org).exists())
        self.assertFalse(
            PortalPerson.objects.filter(
                organization=self.org, full_name="Demo Applicant"
            ).exists()
        )
        self.assertFalse(
            OrganizationCaseTemplate.objects.filter(organization=self.org).exists()
        )
        state = OrganizationOnboarding.objects.get(organization=self.org)
        self.assertIsNone(state.demo_created_at)
