"""
Application Pack Readiness V1 — deterministic readiness service + endpoints.

Covers: auth, owner isolation, no-checklist state, missing/satisfied
requirements, expiry warnings (expired / expiring soon), share readiness, next
actions, score clamping, no-AI / no-file-URL safety, and Life-Radar consistency.
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
)

User = get_user_model()
Req = DocumentBundleRequirement


def readiness_url(bundle_id):
    return f"/api/v1/document-bundles/{bundle_id}/readiness/"


SUMMARY_URL = "/api/v1/document-bundles/readiness-summary/"


class PackReadinessBaseTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="pr", email="pr@x.com", password="StrongPass123!DN"
        )
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )
        self.today = timezone.localdate()
        self.bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")

    def _doc(self, title, **kw):
        return Document.objects.create(owner=self.user, title=title, **kw)

    def _file(self, doc):
        return DocumentFile.objects.create(
            document=doc, uploaded_by=self.user, file="documents/x.pdf",
            original_filename="x.pdf", file_size=10,
        )

    def _req(self, title, *, required=True, status_=Req.Status.MISSING, doc=None):
        return Req.objects.create(
            owner=self.user, bundle=self.bundle, title=title,
            is_required=required, status=status_, linked_document=doc,
        )

    def get(self, bundle=None):
        return self.client.get(readiness_url((bundle or self.bundle).id))


class AuthAndIsolationTests(PackReadinessBaseTest):
    def test_requires_authentication(self):
        self.assertEqual(self.get().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cannot_access_another_users_pack(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.get().status_code, status.HTTP_404_NOT_FOUND)

    def test_summary_requires_auth(self):
        self.assertEqual(
            self.client.get(SUMMARY_URL).status_code, status.HTTP_401_UNAUTHORIZED
        )


class NoChecklistTests(PackReadinessBaseTest):
    def test_pack_with_no_requirements_is_stable_no_checklist(self):
        self.client.force_authenticate(self.user)
        data = self.get().data
        self.assertFalse(data["has_checklist"])
        self.assertEqual(data["label"], "No checklist")
        self.assertEqual(data["score"], 50)
        self.assertEqual(data["summary"]["required_count"], 0)
        self.assertFalse(data["is_ready_to_share"])
        actions = [a["type"] for a in data["next_actions"]]
        self.assertIn("review_requirement", actions)  # "Add required documents"


class RequirementTests(PackReadinessBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_missing_requirements_listed(self):
        self._req("Recommendation letter")
        self._req("Motivation letter")
        data = self.get().data
        titles = [m["title"] for m in data["sections"]["missing_requirements"]] \
            if "sections" in data else [m["title"] for m in data["missing_requirements"]]
        self.assertIn("Recommendation letter", titles)
        self.assertEqual(data["summary"]["missing_count"], 2)

    def test_satisfied_requirements_improve_score(self):
        doc = self._doc("Passport", expiry_date=self.today + timedelta(days=400))
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        self._req("Transcript")  # missing
        data = self.get().data
        self.assertEqual(data["summary"]["satisfied_count"], 1)
        self.assertEqual(data["summary"]["required_count"], 2)
        self.assertEqual(data["base_score"], 50)  # 1 of 2 required

    def test_ready_pack_is_ready_to_share(self):
        doc = self._doc("Passport", expiry_date=self.today + timedelta(days=400))
        self._file(doc)  # a genuinely ready requirement has an attached file
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        data = self.get().data
        self.assertEqual(data["score"], 100)
        self.assertEqual(data["label"], "Ready")
        self.assertTrue(data["is_ready_to_share"])

    def test_not_ready_pack_is_not_ready_to_share(self):
        self._req("Passport")  # missing
        data = self.get().data
        self.assertFalse(data["is_ready_to_share"])
        self.assertLess(data["score"], 90)


class WarningTests(PackReadinessBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_expired_attached_document_creates_critical_warning(self):
        doc = self._doc("Passport", expiry_date=self.today - timedelta(days=5))
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        data = self.get().data
        crit = [w for w in data["warnings"] if w["severity"] == "critical"]
        self.assertTrue(crit)
        self.assertEqual(crit[0]["type"], "expired")
        self.assertEqual(data["summary"]["expired_count"], 1)
        self.assertFalse(data["is_ready_to_share"])  # expired blocks sharing

    def test_expiring_soon_creates_warning_and_reminder_action(self):
        doc = self._doc("Passport", expiry_date=self.today + timedelta(days=20))
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        data = self.get().data
        warn = [w for w in data["warnings"] if w["type"] == "expiring_soon"]
        self.assertTrue(warn)
        self.assertEqual(warn[0]["action"]["type"], "create_reminder")
        action_types = [a["type"] for a in data["next_actions"]]
        self.assertIn("create_reminder", action_types)

    def test_missing_file_on_attached_doc_needs_review(self):
        doc = self._doc("Transcript", expiry_date=self.today + timedelta(days=400))
        # Attached but the document has no file -> needs_review warning.
        self._req("Transcript", status_=Req.Status.ATTACHED, doc=doc)
        data = self.get().data
        review = [w for w in data["warnings"] if w["type"] == "needs_review"]
        self.assertTrue(review)


class NextActionsAndScoreTests(PackReadinessBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_next_actions_include_upload_missing(self):
        self._req("Recommendation letter")
        data = self.get().data
        types = [a["type"] for a in data["next_actions"]]
        self.assertIn("upload_missing_document", types)

    def test_score_is_clamped_0_100(self):
        # Many expired required docs push penalties past the base score.
        for i in range(6):
            d = self._doc(f"Doc {i}", expiry_date=self.today - timedelta(days=10))
            self._req(f"Req {i}", status_=Req.Status.ATTACHED, doc=d)
        data = self.get().data
        self.assertGreaterEqual(data["score"], 0)
        self.assertLessEqual(data["score"], 100)


class SafetyAndSummaryTests(PackReadinessBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_no_ai_call_is_made(self):
        doc = self._doc("Passport", expiry_date=self.today + timedelta(days=400))
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        with mock.patch("apps.ai.client.generate") as gen:
            resp = self.get()
        self.assertEqual(resp.status_code, 200)
        gen.assert_not_called()

    def test_no_file_urls_exposed(self):
        doc = self._doc("Passport", expiry_date=self.today - timedelta(days=1))
        self._file(doc)
        self._req("Passport", status_=Req.Status.ATTACHED, doc=doc)
        blob = json.dumps(self.get().data).lower()
        for marker in ("http://", "https://", "x-amz", "r2.cloudflarestorage", "/media/"):
            self.assertNotIn(marker, blob)

    def test_readiness_summary_aggregates_active_packs(self):
        self._req("Passport")  # this bundle has 1 missing required
        other_bundle = DocumentBundle.objects.create(owner=self.user, title="Visa Pack")
        d = self._doc("Photo", expiry_date=self.today + timedelta(days=400))
        Req.objects.create(
            owner=self.user, bundle=other_bundle, title="Photo",
            is_required=True, status=Req.Status.ATTACHED, linked_document=d,
        )
        data = self.client.get(SUMMARY_URL).data
        self.assertEqual(data["total_packs"], 2)
        self.assertEqual(data["ready_packs"], 1)  # Visa Pack is ready
        self.assertGreaterEqual(data["total_missing_required"], 1)


class LifeRadarConsistencyTests(PackReadinessBaseTest):
    def test_life_radar_still_reports_incomplete_pack(self):
        # The improved readiness must not break Life Radar's pack shape.
        self._req("Passport")  # missing → incomplete pack
        self.client.force_authenticate(self.user)
        data = self.client.get("/api/v1/documents/life-radar/").data
        packs = data["sections"]["incomplete_packs"]
        self.assertTrue(any(p["title"] == "Scholarship Pack" for p in packs))
        # Life Radar keeps its existing keys.
        self.assertIn("readiness_score", packs[0])
        self.assertIn("required_total", packs[0])
