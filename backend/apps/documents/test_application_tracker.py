"""
Application Tracker V1 — deterministic application lifecycle (no AI / no R2).

Covers CRUD + owner isolation, archived exclusion + soft-delete, deadline
states, suggested-status from linked pack readiness, submitted/closed states,
the summary endpoint, the plan limit (Free 3), Life Radar integration, and
no-AI / no-file-URL safety.
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import Plan, UserSubscription
from apps.documents.models import (
    DocumentBundle,
    DocumentBundleRequirement,
    TrackedApplication,
)
from apps.users import plans

User = get_user_model()
Req = DocumentBundleRequirement

LIST_URL = "/api/v1/applications/"
SUMMARY_URL = "/api/v1/applications/summary/"


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


class TrackerBaseTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ta", email="ta@x.com", password="StrongPass123!DN"
        )
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )
        self.today = timezone.localdate()

    def detail_url(self, app_id):
        return f"/api/v1/applications/{app_id}/"


class CrudAndIsolationTests(TrackerBaseTest):
    def test_list_requires_authentication(self):
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_create_application(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            LIST_URL,
            {"title": "Malaysia Student Visa Renewal", "application_type": "visa", "priority": "high"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["type"], "visa")
        self.assertEqual(resp.data["status"], "planning")
        self.assertEqual(resp.data["priority"], "high")
        self.assertIn("suggested_status", resp.data)
        self.assertIn("deadline_state", resp.data)

    def test_cannot_link_another_users_pack(self):
        other_bundle = DocumentBundle.objects.create(owner=self.other, title="Theirs")
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            LIST_URL,
            {"title": "X", "linked_bundle": other_bundle.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_access_another_users_application(self):
        app = TrackedApplication.objects.create(owner=self.other, title="Theirs")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.detail_url(app.id)).status_code, 404)

    def test_list_excludes_archived_by_default(self):
        TrackedApplication.objects.create(owner=self.user, title="Active")
        TrackedApplication.objects.create(owner=self.user, title="Old", is_archived=True)
        self.client.force_authenticate(self.user)
        data = self.client.get(LIST_URL).data
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["title"], "Active")
        # ...but can be requested explicitly.
        archived = self.client.get(LIST_URL + "?archived=true").data
        self.assertEqual(archived["count"], 1)
        self.assertEqual(archived["items"][0]["title"], "Old")

    def test_delete_archives_rather_than_erasing(self):
        app = TrackedApplication.objects.create(owner=self.user, title="A")
        self.client.force_authenticate(self.user)
        resp = self.client.delete(self.detail_url(app.id))
        self.assertEqual(resp.status_code, 204)
        app.refresh_from_db()
        self.assertTrue(app.is_archived)  # preserved, not deleted

    def test_status_update_works(self):
        app = TrackedApplication.objects.create(owner=self.user, title="A")
        self.client.force_authenticate(self.user)
        resp = self.client.patch(
            self.detail_url(app.id), {"status": "submitted"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "submitted")


class DeadlineAndStatusTests(TrackerBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def _create(self, **kw):
        return TrackedApplication.objects.create(owner=self.user, title="App", **kw)

    def test_deadline_states(self):
        cases = {
            None: "no_deadline",
            self.today + timedelta(days=3): "urgent",
            self.today + timedelta(days=20): "soon",
            self.today + timedelta(days=120): "upcoming",
            self.today - timedelta(days=2): "overdue",
        }
        for deadline, expected in cases.items():
            app = self._create(deadline_date=deadline)
            data = self.client.get(self.detail_url(app.id)).data
            self.assertEqual(data["deadline_state"], expected, (deadline, expected))

    def test_suggested_status_documents_missing_from_pack(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Visa Pack")
        Req.objects.create(owner=self.user, bundle=bundle, title="Passport",
                           is_required=True, status=Req.Status.MISSING)
        app = self._create(linked_bundle=bundle)
        data = self.client.get(self.detail_url(app.id)).data
        self.assertEqual(data["suggested_status"], "documents_missing")
        self.assertEqual(data["linked_pack"]["missing_count"], 1)

    def test_suggested_status_ready_to_submit_from_ready_pack(self):
        from apps.documents.models import Document, DocumentFile

        bundle = DocumentBundle.objects.create(owner=self.user, title="Ready Pack")
        doc = Document.objects.create(owner=self.user, title="Passport")
        DocumentFile.objects.create(document=doc, uploaded_by=self.user, file="x.pdf",
                                    original_filename="x.pdf", file_size=10)
        Req.objects.create(owner=self.user, bundle=bundle, title="Passport",
                           is_required=True, status=Req.Status.ATTACHED, linked_document=doc)
        app = self._create(linked_bundle=bundle)
        data = self.client.get(self.detail_url(app.id)).data
        self.assertEqual(data["suggested_status"], "ready_to_submit")
        self.assertTrue(data["linked_pack"]["is_ready_to_share"])

    def test_submitted_application_shows_waiting(self):
        app = self._create(status="submitted", submitted_at=self.today)
        data = self.client.get(self.detail_url(app.id)).data
        actions = [a["type"] for a in data["next_actions"]]
        self.assertIn("await_decision", actions)

    def test_accepted_application_is_completed_state(self):
        app = self._create(status="accepted", deadline_date=self.today - timedelta(days=5))
        data = self.client.get(self.detail_url(app.id)).data
        self.assertEqual(data["deadline_state"], "completed")
        self.assertEqual(data["next_actions"], [])  # closed — nothing to do


class SummaryTests(TrackerBaseTest):
    def test_summary_returns_stable_counts(self):
        TrackedApplication.objects.create(owner=self.user, title="Ready", status="ready_to_submit")
        TrackedApplication.objects.create(owner=self.user, title="Sent", status="submitted")
        TrackedApplication.objects.create(
            owner=self.user, title="Late", deadline_date=self.today - timedelta(days=1)
        )
        TrackedApplication.objects.create(owner=self.user, title="Done", status="accepted")
        TrackedApplication.objects.create(owner=self.user, title="Old", is_archived=True)
        self.client.force_authenticate(self.user)
        data = self.client.get(SUMMARY_URL).data
        self.assertEqual(data["total_active"], 4)  # archived excluded
        self.assertEqual(data["ready_to_submit"], 1)
        self.assertEqual(data["submitted"], 1)
        self.assertEqual(data["overdue"], 1)
        self.assertEqual(data["completed"], 1)
        self.assertEqual(data["archived"], 1)


class PlanLimitTests(TrackerBaseTest):
    def test_free_limit_is_3_active_applications(self):
        self.assertEqual(plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_APPLICATIONS), 3)
        for i in range(3):
            TrackedApplication.objects.create(owner=self.user, title=f"App {i}")
        self.client.force_authenticate(self.user)
        resp = self.client.post(LIST_URL, {"title": "Fourth"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "plan_limit_exceeded")
        self.assertEqual(resp.data["resource"], plans.RESOURCE_APPLICATIONS)

    def test_archived_applications_do_not_count_toward_limit(self):
        for i in range(3):
            TrackedApplication.objects.create(owner=self.user, title=f"App {i}", is_archived=True)
        self.client.force_authenticate(self.user)
        resp = self.client.post(LIST_URL, {"title": "Active one"}, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_pro_limit_is_higher(self):
        _grant_pro(self.user)
        self.assertEqual(
            plans.get_limit(plans.PLAN_PRO_PLACEHOLDER, plans.RESOURCE_APPLICATIONS), 100
        )


class IntegrationAndSafetyTests(TrackerBaseTest):
    def test_life_radar_includes_application_summary_fields(self):
        TrackedApplication.objects.create(owner=self.user, title="Ready", status="ready_to_submit")
        self.client.force_authenticate(self.user)
        data = self.client.get("/api/v1/documents/life-radar/").data
        for key in ("active_applications", "urgent_applications",
                    "ready_to_submit_applications", "overdue_applications"):
            self.assertIn(key, data["summary"])
        self.assertEqual(data["summary"]["active_applications"], 1)
        self.assertEqual(data["summary"]["ready_to_submit_applications"], 1)

    def test_life_radar_shape_unchanged(self):
        self.client.force_authenticate(self.user)
        data = self.client.get("/api/v1/documents/life-radar/").data
        for key in ("urgent", "expiring_documents", "upcoming_deadlines",
                    "incomplete_packs", "missing_documents", "emergency_access",
                    "suggested_actions"):
            self.assertIn(key, data["sections"])

    def test_no_ai_call_and_no_file_urls(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Pack")
        Req.objects.create(owner=self.user, bundle=bundle, title="Passport",
                           is_required=True, status=Req.Status.MISSING)
        app = TrackedApplication.objects.create(
            owner=self.user, title="Visa", linked_bundle=bundle
        )
        self.client.force_authenticate(self.user)
        with mock.patch("apps.ai.client.generate") as gen:
            resp = self.client.get(self.detail_url(app.id))
        self.assertEqual(resp.status_code, 200)
        gen.assert_not_called()
        blob = json.dumps(resp.data).lower()
        for marker in ("http://", "https://", "x-amz", "r2.cloudflarestorage", "/media/"):
            self.assertNotIn(marker, blob)
