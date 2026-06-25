"""
Founder Admin Tools V1 tests.

Covers founder-only gating, the organizations list/detail, the enriched user
detail, support-notes CRUD, the safe org set-plan action, and the plans-limits /
storage / AI-usage overviews — asserting NO document contents, prompts, tokens,
private URLs, storage keys, or secrets are exposed.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMembership
from .models import FounderSupportNote

User = get_user_model()

ORGS = "/api/v1/founder/organizations/"
PLANS = "/api/v1/founder/plans-limits/"
STORAGE = "/api/v1/founder/storage/"
AI = "/api/v1/founder/ai-usage/"
NOTES = "/api/v1/founder/support-notes/"

# Substrings that must never appear in any founder support payload. (Bare
# "token" is intentionally excluded — AI *token-count* fields are safe; we look
# for the specific shapes that would indicate a real leak.)
FORBIDDEN = (
    "share_token",
    "access_code",
    "upload_token",
    "api_key",
    "secret",
    "password",
    "prompt",
    "ocr_text",
    "private_url",
    "file_url",
    "r2_key",
)


def _user(username, **kw):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="StrongPassword123!DN",
        **kw,
    )


def _assert_safe(testcase, payload):
    blob = str(payload).lower()
    for bad in FORBIDDEN:
        testcase.assertNotIn(bad, blob)


@override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=["boss@duenest.com"])
class FounderAdminToolsTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_user(
            username="boss",
            email="boss@duenest.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )
        self.owner = _user("owner")
        self.org = Organization.objects.create(name="Acme Agency", created_by=self.owner)
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )

    # ---- Permissions --------------------------------------------------------

    def test_normal_user_blocked_everywhere(self):
        self.client.force_authenticate(_user("normal"))
        for url in (ORGS, PLANS, STORAGE, AI, NOTES, f"/api/v1/founder/users/{self.owner.id}/"):
            self.assertEqual(
                self.client.get(url).status_code,
                status.HTTP_403_FORBIDDEN,
                msg=url,
            )

    # ---- Organizations ------------------------------------------------------

    def test_founder_lists_and_views_organization_safely(self):
        self.client.force_authenticate(self.boss)
        listing = self.client.get(ORGS)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        names = {o["name"] for o in listing.data["organizations"]}
        self.assertIn("Acme Agency", names)
        _assert_safe(self, listing.data)

        detail = self.client.get(f"{ORGS}{self.org.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIn("limits", detail.data)
        self.assertIn("usage", detail.data)
        self.assertIn("members_list", detail.data)
        self.assertIn("support_notes", detail.data)
        # Owner email is shown (support context), but no contents/tokens.
        self.assertEqual(detail.data["owner"]["email"], self.owner.email)
        _assert_safe(self, detail.data)

    def test_organization_detail_404(self):
        self.client.force_authenticate(self.boss)
        self.assertEqual(
            self.client.get(f"{ORGS}999999/").status_code, status.HTTP_404_NOT_FOUND
        )

    def test_set_org_plan_uses_safe_service(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.post(
            f"{ORGS}{self.org.id}/set-plan/",
            {"plan": "teams_beta", "portal_enabled": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["plan"], "teams_beta")
        self.assertTrue(resp.data["portal_enabled"])

    def test_set_org_plan_rejects_unknown_plan(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.post(
            f"{ORGS}{self.org.id}/set-plan/", {"plan": "not_a_plan"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- User detail --------------------------------------------------------

    def test_user_detail_is_enriched_and_safe(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.get(f"/api/v1/founder/users/{self.owner.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("plan_usage", resp.data)
        self.assertIn("ai", resp.data)
        self.assertIn("organizations", resp.data)
        self.assertIn("support_notes", resp.data)
        self.assertIn("privacy_note", resp.data)
        # Org membership surfaces.
        self.assertEqual(resp.data["organizations"][0]["name"], "Acme Agency")
        _assert_safe(self, resp.data)

    # ---- Support notes ------------------------------------------------------

    def test_support_notes_crud_founder_only(self):
        self.client.force_authenticate(self.boss)
        created = self.client.post(
            NOTES,
            {"target_user": self.owner.id, "note_type": "support", "body": "stuck upload"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        note_id = created.data["id"]
        self.assertEqual(created.data["created_by_email"], self.boss.email)

        # Filtered list.
        listed = self.client.get(NOTES, {"target_user": self.owner.id})
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)

        # Patch status.
        patched = self.client.patch(
            f"{NOTES}{note_id}/", {"status": "resolved"}, format="json"
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["status"], "resolved")

        # Normal user cannot read notes.
        self.client.force_authenticate(_user("normal2"))
        self.assertEqual(self.client.get(NOTES).status_code, status.HTTP_403_FORBIDDEN)

    def test_support_note_requires_exactly_one_target(self):
        self.client.force_authenticate(self.boss)
        # Neither target.
        self.assertEqual(
            self.client.post(NOTES, {"body": "x"}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        # Both targets.
        both = self.client.post(
            NOTES,
            {
                "target_user": self.owner.id,
                "target_organization": self.org.id,
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(both.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- Overviews ----------------------------------------------------------

    def test_plans_limits_overview(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.get(PLANS)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("user_plans", resp.data)
        self.assertIn("organization_plans", resp.data)
        _assert_safe(self, resp.data)

    def test_storage_overview_has_no_keys(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.get(STORAGE)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("total_bytes", resp.data)
        self.assertIn("top_users", resp.data)
        _assert_safe(self, resp.data)

    def test_ai_usage_overview_has_no_prompts(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.get(AI)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("today", resp.data)
        self.assertIn("month", resp.data)
        self.assertIn("failures_by_reason", resp.data)
        _assert_safe(self, resp.data)
