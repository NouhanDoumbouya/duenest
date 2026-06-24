"""
Life Radar V1 — deterministic readiness dashboard tests.

Verifies the aggregation service + endpoint: auth, stable empty state, each
radar section, score clamping, owner isolation, no file-URL exposure, and that
NO AI call is made (Life Radar is deterministic / free to compute).
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentReminderRule,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
)

User = get_user_model()


class LifeRadarBaseTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="lr", email="lr@x.com", password="StrongPass123!DN"
        )
        self.other = User.objects.create_user(
            username="other", email="other@x.com", password="StrongPass123!DN"
        )
        self.url = reverse("life-radar")
        self.today = timezone.localdate()

    def _doc(self, **kw):
        kw.setdefault("owner", self.user)
        kw.setdefault("title", "Doc")
        return Document.objects.create(**kw)

    def get(self):
        return self.client.get(self.url)


class AuthAndShapeTests(LifeRadarBaseTest):
    def test_requires_authentication(self):
        self.assertEqual(self.get().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_response_shape_is_stable(self):
        self.client.force_authenticate(self.user)
        data = self.get().data
        self.assertEqual(self.get().status_code, status.HTTP_200_OK)
        self.assertIn("score", data)
        self.assertIn("label", data)
        self.assertIn("summary", data)
        for key in ("expiring_soon", "upcoming_deadlines", "missing_documents",
                    "incomplete_packs", "emergency_ready"):
            self.assertIn(key, data["summary"])
        for key in ("urgent", "expiring_documents", "upcoming_deadlines",
                    "incomplete_packs", "missing_documents", "emergency_access",
                    "suggested_actions"):
            self.assertIn(key, data["sections"])


class EmptyStateTests(LifeRadarBaseTest):
    def test_empty_user_gets_neutral_onboarding_payload(self):
        self.client.force_authenticate(self.user)
        data = self.get().data
        self.assertTrue(data["is_empty"])
        self.assertEqual(data["score"], 30)  # neutral, invites onboarding
        self.assertEqual(data["summary"]["expiring_soon"], 0)
        self.assertFalse(data["summary"]["emergency_ready"])
        # Onboarding actions guide the new user.
        keys = {a["key"] for a in data["sections"]["suggested_actions"]}
        self.assertIn("upload_first_document", keys)
        self.assertIn("setup_emergency_access", keys)


class SectionTests(LifeRadarBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_expiring_document_appears_in_expiring_section(self):
        self._doc(title="Visa", expiry_date=self.today + timedelta(days=20))
        data = self.get().data
        titles = [d["title"] for d in data["sections"]["expiring_documents"]]
        self.assertIn("Visa", titles)
        item = next(d for d in data["sections"]["expiring_documents"] if d["title"] == "Visa")
        self.assertEqual(item["severity"], "soon")
        self.assertEqual(data["summary"]["expiring_soon"], 1)

    def test_expired_document_appears_in_urgent(self):
        self._doc(title="Old Passport", expiry_date=self.today - timedelta(days=5))
        data = self.get().data
        urgent_titles = [u.get("title") for u in data["sections"]["urgent"]]
        self.assertIn("Old Passport", urgent_titles)
        item = next(u for u in data["sections"]["urgent"] if u.get("title") == "Old Passport")
        self.assertEqual(item["severity"], "expired")

    def test_upcoming_reminder_appears_in_deadlines(self):
        doc = self._doc(title="Licence", expiry_date=self.today + timedelta(days=40))
        DocumentReminderRule.objects.create(
            owner=self.user, document=doc, trigger_type="before_expiry", days_before=30
        )  # reminder date = today + 10
        data = self.get().data
        self.assertEqual(len(data["sections"]["upcoming_deadlines"]), 1)
        self.assertEqual(data["sections"]["upcoming_deadlines"][0]["days_remaining"], 10)

    def test_overdue_reminder_appears_in_urgent(self):
        doc = self._doc(title="Insurance", expiry_date=self.today + timedelta(days=10))
        DocumentReminderRule.objects.create(
            owner=self.user, document=doc, trigger_type="before_expiry", days_before=30
        )  # reminder date = today - 20 (overdue)
        data = self.get().data
        self.assertEqual(data["summary"]["overdue_reminders"], 1)
        types = [u["type"] for u in data["sections"]["urgent"]]
        self.assertIn("overdue_reminder", types)

    def test_incomplete_pack_and_missing_documents(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Visa pack")
        attached = self._doc(title="Photo")
        DocumentBundleRequirement.objects.create(
            owner=self.user, bundle=bundle, title="Photo", is_required=True,
            status=DocumentBundleRequirement.Status.ATTACHED, linked_document=attached,
        )
        DocumentBundleRequirement.objects.create(
            owner=self.user, bundle=bundle, title="Bank statement", is_required=True,
            status=DocumentBundleRequirement.Status.MISSING,
        )
        data = self.get().data
        self.assertEqual(len(data["sections"]["incomplete_packs"]), 1)
        pack = data["sections"]["incomplete_packs"][0]
        self.assertEqual(pack["missing_count"], 1)
        self.assertEqual(pack["readiness_score"], 50)
        missing_titles = [m["title"] for m in data["sections"]["missing_documents"]]
        self.assertIn("Bank statement", missing_titles)

    def test_emergency_not_configured_is_an_action(self):
        self._doc(title="Passport", expiry_date=self.today + timedelta(days=400))
        data = self.get().data
        self.assertFalse(data["sections"]["emergency_access"]["configured"])
        self.assertEqual(data["sections"]["emergency_access"]["status"], "none")
        keys = {a["key"] for a in data["sections"]["suggested_actions"]}
        self.assertIn("setup_emergency_access", keys)

    def test_emergency_configured_improves_status(self):
        doc = self._doc(title="Passport", expiry_date=self.today + timedelta(days=400))
        pack = EmergencyAccessPack.objects.create(
            owner=self.user, title="My pack", status=EmergencyAccessPack.Status.ACTIVE
        )
        EmergencyAccessPackItem.objects.create(owner=self.user, pack=pack, document=doc)
        data = self.get().data
        self.assertTrue(data["sections"]["emergency_access"]["configured"])
        self.assertEqual(data["sections"]["emergency_access"]["status"], "ready")
        self.assertTrue(data["summary"]["emergency_ready"])


class ScoreTests(LifeRadarBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_score_clamped_between_0_and_100(self):
        for i in range(12):  # many expired docs push deductions past 100
            self._doc(title=f"Expired {i}", expiry_date=self.today - timedelta(days=10))
        data = self.get().data
        self.assertGreaterEqual(data["score"], 0)
        self.assertLessEqual(data["score"], 100)

    def test_healthy_vault_with_emergency_is_high(self):
        doc = self._doc(title="Passport", expiry_date=self.today + timedelta(days=400))
        pack = EmergencyAccessPack.objects.create(
            owner=self.user, title="Pack", status=EmergencyAccessPack.Status.ACTIVE
        )
        EmergencyAccessPackItem.objects.create(owner=self.user, pack=pack, document=doc)
        data = self.get().data
        self.assertEqual(data["score"], 100)
        self.assertEqual(data["label"], "Ready")


class IsolationAndSafetyTests(LifeRadarBaseTest):
    def test_no_cross_user_data_leakage(self):
        # Other user's expiring document must never surface for self.user.
        Document.objects.create(
            owner=self.other, title="OTHER SECRET", expiry_date=self.today - timedelta(days=1)
        )
        self.client.force_authenticate(self.user)
        blob = json.dumps(self.get().data)
        self.assertNotIn("OTHER SECRET", blob)

    def test_no_file_urls_exposed(self):
        doc = self._doc(title="Passport", expiry_date=self.today - timedelta(days=1))
        # Even with an emergency item referencing the doc, no storage URL leaks.
        pack = EmergencyAccessPack.objects.create(
            owner=self.user, title="Pack", status=EmergencyAccessPack.Status.ACTIVE
        )
        EmergencyAccessPackItem.objects.create(owner=self.user, pack=pack, document=doc)
        self.client.force_authenticate(self.user)
        blob = json.dumps(self.get().data).lower()
        for marker in ("http://", "https://", "x-amz", "r2.cloudflarestorage", "/media/"):
            self.assertNotIn(marker, blob)

    def test_no_ai_call_is_made(self):
        self._doc(title="Passport", expiry_date=self.today - timedelta(days=1))
        self.client.force_authenticate(self.user)
        with mock.patch("apps.ai.client.generate") as gen:
            resp = self.get()
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        gen.assert_not_called()
