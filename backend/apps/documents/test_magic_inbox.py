"""
Magic Inbox V1 — capture -> analyze -> review -> apply.

Hermetic: the Anthropic call is always mocked. Covers intake (text/link/file),
owner isolation, deterministic (no-AI) analysis, AI triage gating (consent / Pro
plan / charge-on-success only / zero on failure), review-before-apply behavior
(create application/pack/requirements/reminder, attach-to-pack ownership,
archive), apply never calling AI or charging credits, plan-limit enforcement on
file intake, and no raw storage URLs in responses.
"""

from __future__ import annotations

import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription
from apps.documents import magic_inbox as mi
from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentReminderRule,
    MagicInboxItem,
    TrackedApplication,
)

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True, ANTHROPIC_API_KEY="sk-test", AI_MODEL="claude-haiku-4-5",
    AI_MAX_TOKENS=4096, AI_USAGE_METERING_ENABLED=True, AI_BUDGET_GUARD_ENABLED=False,
)

LIST_URL = "/api/v1/magic-inbox/"

_SCHOLARSHIP_TEXT = (
    "Dear applicant, applications for the Example Scholarship close on "
    "31 August 2026. Required documents: passport copy, transcript, and a "
    "recommendation letter. Submit via the portal."
)

_AI_OK = AIResult(ok=True, reason="ok", model="claude-haiku-4-5", data={
    "title": "Example Scholarship email",
    "detected_type": "application_requirement",
    "summary": "Lists required documents and a submission deadline.",
    "confidence": "high",
    "suggestions": [
        {"type": "create_application", "label": "Create scholarship application",
         "description": "Track this scholarship.", "priority": "high",
         "data": {"application_type": "scholarship", "deadline_date": "2026-08-31"},
         "source_snippet": "applications ... close on 31 August 2026"},
        {"type": "create_reminder", "label": "Create deadline reminder",
         "description": "Add a reminder.", "priority": "high",
         "data": {"date": "2026-08-31"}},
    ],
    "warnings": [],
})


def _flags(value=True):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


@override_settings(**_CONFIGURED)
class IntakeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(self.user)

    def test_list_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_empty_inbox_is_stable(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, {"items": [], "count": 0})

    def test_create_text_item(self):
        resp = self.client.post(
            LIST_URL,
            {"item_type": "text", "title": "Scholarship", "pasted_text": _SCHOLARSHIP_TEXT},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["item_type"], "text")
        self.assertEqual(resp.data["status"], "new")
        self.assertEqual(resp.data["source_label"], "pasted text")

    def test_create_link_item(self):
        resp = self.client.post(
            LIST_URL,
            {"item_type": "link", "source_url": "https://example.edu/scholarship"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["item_type"], "link")

    def test_create_text_item_requires_text(self):
        resp = self.client.post(
            LIST_URL, {"item_type": "text", "pasted_text": ""}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_file_item_uploads_encrypted_inbox_file(self):
        upload = SimpleUploadedFile(
            "transcript.pdf", b"%PDF-1.4 fake pdf bytes", content_type="application/pdf"
        )
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            resp = self.client.post(
                LIST_URL, {"item_type": "file", "file": upload}, format="multipart"
            )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["item_type"], "file")
        self.assertIsNotNone(resp.data["linked_file"])
        self.assertEqual(resp.data["file"]["original_filename"], "transcript.pdf")
        # The download route is the private app route, never a storage URL.
        self.assertTrue(resp.data["file"]["download_url"].startswith("/api/v1/files/"))

    def test_cannot_access_another_users_item(self):
        other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )
        item = MagicInboxItem.objects.create(
            owner=other, item_type="text", pasted_text="x", title="theirs"
        )
        resp = self.client.get(f"{LIST_URL}{item.id}/")
        self.assertEqual(resp.status_code, 404)


@override_settings(**_CONFIGURED)
class DeterministicAnalyzeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="d", email="d@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(self.user)
        self.item = MagicInboxItem.objects.create(
            owner=self.user, item_type="text", title="Scholarship",
            pasted_text=_SCHOLARSHIP_TEXT,
        )

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_deterministic_analyze_without_ai(self):
        with _flags(True), mock.patch(
            "apps.documents.magic_inbox.ai_client.generate"
        ) as g:
            resp = self.client.post(
                f"{LIST_URL}{self.item.id}/analyze/", {"use_ai": False}, format="json"
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        g.assert_not_called()                 # no AI on the deterministic path
        self.assertEqual(self._used(), 0)     # and no credits
        item = resp.data["item"]
        self.assertEqual(item["status"], "analyzed")
        types = {s["type"] for s in item["suggestions"]}
        # Detected a deadline + required docs => reminder/pack/application suggestions.
        self.assertIn("create_application", types)
        self.assertIn("create_pack", types)
        self.assertIn("2026-08-31", item["extracted_payload"]["detected_dates"])


@override_settings(**_CONFIGURED)
class AiTriageGatingTests(APITestCase):
    def setUp(self):
        self.pro = User.objects.create_user(
            username="p", email="p@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.pro)
        AiPreference.objects.create(user=self.pro, ai_enabled=True)

    def _item(self, user):
        return MagicInboxItem.objects.create(
            owner=user, item_type="text", title="Scholarship",
            pasted_text=_SCHOLARSHIP_TEXT,
        )

    def _used(self, user):
        return entitlements.get_ai_credits_used_this_month(user)

    def test_ai_requires_consent(self):
        AiPreference.objects.filter(user=self.pro).update(ai_enabled=False)
        self.client.force_authenticate(self.pro)
        item = self._item(self.pro)
        with _flags(True), mock.patch(
            "apps.documents.magic_inbox.ai_client.generate"
        ) as g:
            resp = self.client.post(
                f"{LIST_URL}{item.id}/analyze/", {"use_ai": True}, format="json"
            )
        self.assertEqual(resp.data["reason"], "consent_required")
        g.assert_not_called()
        self.assertEqual(self._used(self.pro), 0)

    def test_free_user_blocked_from_ai(self):
        free = User.objects.create_user(
            username="f", email="f@x.com", password="StrongPass123!DN"
        )
        AiPreference.objects.create(user=free, ai_enabled=True)
        self.client.force_authenticate(free)
        item = self._item(free)
        with _flags(True), mock.patch(
            "apps.documents.magic_inbox.ai_client.generate"
        ) as g:
            resp = self.client.post(
                f"{LIST_URL}{item.id}/analyze/", {"use_ai": True}, format="json"
            )
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        g.assert_not_called()
        self.assertEqual(self._used(free), 0)

    def test_pro_ai_triage_charges_3_credits_on_success(self):
        self.client.force_authenticate(self.pro)
        item = self._item(self.pro)
        with _flags(True), mock.patch(
            "apps.documents.magic_inbox.ai_client.generate", return_value=_AI_OK
        ):
            resp = self.client.post(
                f"{LIST_URL}{item.id}/analyze/", {"use_ai": True}, format="json"
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["ai_used"])
        self.assertEqual(resp.data["credits_charged"], 3)
        self.assertEqual(self._used(self.pro), 3)
        types = {s["type"] for s in resp.data["item"]["suggestions"]}
        self.assertIn("create_application", types)

    def test_failed_ai_triage_charges_zero(self):
        self.client.force_authenticate(self.pro)
        item = self._item(self.pro)
        with _flags(True), mock.patch(
            "apps.documents.magic_inbox.ai_client.generate",
            return_value=AIResult(ok=False, reason="error"),
        ):
            resp = self.client.post(
                f"{LIST_URL}{item.id}/analyze/", {"use_ai": True}, format="json"
            )
        self.assertFalse(resp.data["available"])
        self.assertEqual(self._used(self.pro), 0)
        # Deterministic suggestions are still persisted (item analyzed).
        item.refresh_from_db()
        self.assertEqual(item.status, "analyzed")


@override_settings(**_CONFIGURED)
class ApplyTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="a", email="a@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(self.user)
        self.item = MagicInboxItem.objects.create(
            owner=self.user, item_type="text", title="Scholarship",
            pasted_text=_SCHOLARSHIP_TEXT, status="analyzed",
        )

    def _apply(self, selected):
        return self.client.post(
            f"{LIST_URL}{self.item.id}/apply/",
            {"selected_suggestions": selected}, format="json",
        )

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_apply_create_application(self):
        with mock.patch("apps.documents.magic_inbox.ai_client.generate") as g:
            resp = self._apply([
                {"type": "create_application",
                 "data": {"application_type": "scholarship", "deadline_date": "2026-08-31"}}
            ])
        self.assertEqual(resp.status_code, 200, resp.data)
        g.assert_not_called()              # apply never calls AI
        self.assertEqual(self._used(), 0)  # and never charges credits
        app = TrackedApplication.objects.get(owner=self.user)
        self.assertEqual(app.application_type, "scholarship")
        self.assertEqual(str(app.deadline_date), "2026-08-31")
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, "applied")

    def test_apply_create_pack(self):
        resp = self._apply([{"type": "create_pack", "data": {"pack_name": "Scholarship Pack"}}])
        self.assertEqual(resp.status_code, 200, resp.data)
        bundle = DocumentBundle.objects.get(owner=self.user)
        self.assertEqual(bundle.title, "Scholarship Pack")

    def test_apply_add_requirements_to_pack(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Pack")
        resp = self._apply([
            {"type": "add_requirements_to_pack",
             "data": {"bundle_id": bundle.id, "requirements": [
                 {"title": "Passport copy", "required": True},
                 {"title": "Transcript", "required": True},
             ]}}
        ])
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(bundle.requirements.count(), 2)

    def test_apply_create_reminder_requires_document_target_and_date(self):
        # No document target -> skipped (reminders attach to a document).
        resp = self._apply([{"type": "create_reminder", "data": {"date": "2026-08-31"}}])
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data["applied"]), 0)
        self.assertTrue(any(s["reason"] == "no_document_target" for s in resp.data["skipped"]))
        self.assertEqual(DocumentReminderRule.objects.count(), 0)

        # With a valid document target + clear date -> a real reminder is created.
        doc = Document.objects.create(owner=self.user, title="Visa")
        self.item.linked_document = doc
        self.item.save(update_fields=["linked_document"])
        resp = self._apply([{"type": "create_reminder", "data": {"date": "2026-08-31"}}])
        self.assertEqual(len(resp.data["applied"]), 1, resp.data)
        rule = DocumentReminderRule.objects.get(owner=self.user)
        self.assertEqual(rule.document_id, doc.id)
        doc.refresh_from_db()
        self.assertEqual(str(doc.renewal_date), "2026-08-31")

    def test_apply_attach_to_pack_enforces_ownership(self):
        other = User.objects.create_user(
            username="o2", email="o2@x.com", password="StrongPass123!DN"
        )
        foreign_bundle = DocumentBundle.objects.create(owner=other, title="Theirs")
        resp = self._apply([
            {"type": "attach_to_pack", "data": {"bundle_id": foreign_bundle.id}}
        ])
        self.assertEqual(resp.status_code, 200, resp.data)
        # Foreign pack is not found for this user -> skipped, nothing created.
        self.assertTrue(any(s["reason"] == "pack_not_found" for s in resp.data["skipped"]))
        self.assertEqual(foreign_bundle.requirements.count(), 0)

    def test_apply_import_requirement_link_routes_without_ai(self):
        link_item = MagicInboxItem.objects.create(
            owner=self.user, item_type="link", title="Link",
            source_url="https://example.edu/s", status="analyzed",
        )
        with mock.patch("apps.documents.magic_inbox.ai_client.generate") as g:
            resp = self.client.post(
                f"{LIST_URL}{link_item.id}/apply/",
                {"selected_suggestions": [{"type": "import_requirement_link"}]},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        g.assert_not_called()
        self.assertEqual(len(resp.data["routes"]), 1)
        self.assertEqual(resp.data["routes"][0]["route"], "requirement_link_import")

    def test_apply_empty_selection_rejected(self):
        resp = self._apply([])
        self.assertEqual(resp.status_code, 400)


@override_settings(**_CONFIGURED)
class ArchiveAndLimitsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="z", email="z@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(self.user)

    def test_archive(self):
        item = MagicInboxItem.objects.create(
            owner=self.user, item_type="text", pasted_text="x", title="t"
        )
        resp = self.client.post(f"{LIST_URL}{item.id}/archive/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "archived")

    def test_file_intake_respects_storage_limit(self):
        self.user.plan = "free"
        self.user.save(update_fields=["plan"])
        upload = SimpleUploadedFile(
            "x.pdf", b"%PDF-1.4 data", content_type="application/pdf"
        )
        with mock.patch(
            "apps.documents.plan_usage.get_user_storage_limit_bytes", return_value=1
        ), mock.patch("apps.documents.views._scan_upload_or_raise"):
            resp = self.client.post(
                LIST_URL, {"item_type": "file", "file": upload}, format="multipart"
            )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "plan_limit_exceeded")

    def test_no_raw_storage_urls_in_responses(self):
        upload = SimpleUploadedFile(
            "x.pdf", b"%PDF-1.4 data", content_type="application/pdf"
        )
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            resp = self.client.post(
                LIST_URL, {"item_type": "file", "file": upload}, format="multipart"
            )
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "amazonaws", "https://"):
            self.assertNotIn(marker, blob)
