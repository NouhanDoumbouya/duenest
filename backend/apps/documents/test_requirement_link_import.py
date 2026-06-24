"""
Requirement Link → Checklist V1 — extraction + apply (hermetic: no real HTTP/AI).

Covers gating (consent / Pro plan / credits), safe-URL guards, credit-charge
only on success, extract → review → apply, duplicate handling, deadline →
pack target date, owner isolation, and no R2 / file-URL exposure.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.ai.requirement_links import SafeFetchError, fetch_requirement_page
from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription
from apps.documents import ai_requirement_import as importer
from apps.documents.models import (
    DocumentBundle,
    DocumentBundleRequirement,
    RequirementExtractionDraft,
)

User = get_user_model()
Req = DocumentBundleRequirement

_CONFIGURED = dict(
    AI_CONFIGURED=True, ANTHROPIC_API_KEY="sk-test", AI_MODEL="claude-haiku-4-5",
    AI_MAX_TOKENS=4096, AI_USAGE_METERING_ENABLED=True, AI_BUDGET_GUARD_ENABLED=False,
)

_PAGE = {
    "url": "https://example.edu/scholarship",
    "title": "Scholarship Requirements",
    "text": "Applicants must submit a passport copy and an academic transcript. "
    "A portfolio may be included. Deadline: 31 August 2026." * 5,
    "snippets": [{"id": "src_1", "text": "Applicants must submit a passport copy."}],
}

_EXTRACTION = {
    "title": "Scholarship Application Requirements",
    "summary": "International scholarship.",
    "confidence": "high",
    "required_documents": [
        {"title": "Passport copy", "description": "Valid passport.", "source_snippet": "submit a passport copy"},
        {"title": "Academic transcript", "description": "Official transcript.", "source_snippet": "academic transcript"},
    ],
    "optional_documents": [
        {"title": "Portfolio", "description": "Creative portfolio.", "source_snippet": "portfolio may be included"},
    ],
    "deadlines": [
        {"title": "Application deadline", "date": "2026-08-31", "description": "Submit by.", "source_snippet": "Deadline: 31 August 2026."},
    ],
    "eligibility_notes": [{"text": "Open to international students.", "source_snippet": "international"}],
    "submission_instructions": [{"text": "Submit online.", "source_snippet": "online"}],
    "warnings": [],
}


def _flags(value=True):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


@override_settings(**_CONFIGURED)
class ImportEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="pro", email="pro@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.user)
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )
        self.bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        self.url = f"/api/v1/document-bundles/{self.bundle.id}/requirements/import-link/"

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        resp = self.client.post(self.url, {"url": "https://x.edu"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cannot_import_into_another_users_pack(self):
        self.client.force_authenticate(self.other)
        with _flags(True):
            resp = self.client.post(self.url, {"url": "https://x.edu"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_consent_required(self):
        AiPreference.objects.filter(user=self.user).update(ai_enabled=False)
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(self.url, {"url": "https://x.edu"}, format="json")
        self.assertEqual(resp.data["reason"], "consent_required")
        self.assertEqual(self._used(), 0)

    def test_free_user_blocked_pro_only(self):
        free = User.objects.create_user(
            username="free", email="free@x.com", password="StrongPass123!DN"
        )
        AiPreference.objects.create(user=free, ai_enabled=True)
        free_bundle = DocumentBundle.objects.create(owner=free, title="Free Pack")
        self.client.force_authenticate(free)
        gen = mock.Mock()
        with _flags(True), mock.patch.object(importer, "generate", gen):
            resp = self.client.post(
                f"/api/v1/document-bundles/{free_bundle.id}/requirements/import-link/",
                {"url": "https://x.edu"}, format="json",
            )
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        gen.assert_not_called()
        self.assertEqual(entitlements.get_ai_credits_used_this_month(free), 0)

    def test_pro_success_creates_draft_and_charges_5_credits(self):
        self.client.force_authenticate(self.user)
        with _flags(True), mock.patch.object(
            importer, "fetch_requirement_page", return_value=_PAGE
        ), mock.patch.object(
            importer, "generate",
            return_value=AIResult(ok=True, data=_EXTRACTION, reason="ok"),
        ):
            resp = self.client.post(self.url, {"url": "https://example.edu/s"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "extracted")
        self.assertEqual(resp.data["credits_charged"], 5)
        self.assertEqual(len(resp.data["required_documents"]), 2)
        self.assertEqual(len(resp.data["deadlines"]), 1)
        self.assertEqual(self._used(), 5)
        self.assertEqual(RequirementExtractionDraft.objects.filter(bundle=self.bundle).count(), 1)

    def test_failed_fetch_does_not_charge_credits(self):
        self.client.force_authenticate(self.user)
        with _flags(True), mock.patch.object(
            importer, "fetch_requirement_page",
            side_effect=SafeFetchError("blocked_address", "Private address."),
        ), mock.patch.object(importer, "generate") as gen:
            resp = self.client.post(self.url, {"url": "http://127.0.0.1"}, format="json")
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "blocked_address")
        gen.assert_not_called()
        self.assertEqual(self._used(), 0)
        self.assertEqual(RequirementExtractionDraft.objects.count(), 0)

    def test_failed_ai_does_not_charge_credits(self):
        self.client.force_authenticate(self.user)
        with _flags(True), mock.patch.object(
            importer, "fetch_requirement_page", return_value=_PAGE
        ), mock.patch.object(
            importer, "generate", return_value=AIResult(ok=False, reason="error"),
        ):
            resp = self.client.post(self.url, {"url": "https://example.edu/s"}, format="json")
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "error")
        self.assertEqual(self._used(), 0)

    def test_no_file_urls_exposed(self):
        self.client.force_authenticate(self.user)
        with _flags(True), mock.patch.object(
            importer, "fetch_requirement_page", return_value=_PAGE
        ), mock.patch.object(
            importer, "generate",
            return_value=AIResult(ok=True, data=_EXTRACTION, reason="ok"),
        ):
            resp = self.client.post(self.url, {"url": "https://example.edu/s"}, format="json")
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "/media/"):
            self.assertNotIn(marker, blob)


@override_settings(**_CONFIGURED)
class ApplyEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="pro", email="pro@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.user)
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )
        self.bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        self.draft = RequirementExtractionDraft.objects.create(
            owner=self.user, bundle=self.bundle,
            source_url=_PAGE["url"], page_title=_PAGE["title"],
            status=RequirementExtractionDraft.Status.EXTRACTED,
            extracted_payload={
                "required_documents": _EXTRACTION["required_documents"],
                "optional_documents": _EXTRACTION["optional_documents"],
                "deadlines": _EXTRACTION["deadlines"],
            },
        )
        self.apply_url = (
            f"/api/v1/document-bundles/{self.bundle.id}"
            f"/requirements/import-link/{self.draft.id}/apply/"
        )

    def test_apply_creates_selected_requirements(self):
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {
                    "selected_required_documents": ["Passport copy", "Academic transcript"],
                    "selected_optional_documents": [],
                    "selected_deadlines": [],
                    "create_reminders": False,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["created_requirements"], 2)
        self.assertTrue(resp.data["applied"])
        titles = set(self.bundle.requirements.values_list("title", flat=True))
        self.assertEqual(titles, {"Passport copy", "Academic transcript"})
        # Pack readiness is returned and reflects the new (missing) requirements.
        self.assertIn("pack_readiness", resp.data)
        self.assertEqual(resp.data["pack_readiness"]["summary"]["required_count"], 2)

    def test_apply_avoids_duplicate_requirements(self):
        Req.objects.create(
            owner=self.user, bundle=self.bundle, title="passport  copy",  # same normalized title
            is_required=True, status=Req.Status.MISSING,
        )
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {"selected_required_documents": ["Passport copy"], "create_reminders": False},
                format="json",
            )
        self.assertEqual(resp.data["created_requirements"], 0)  # duplicate skipped
        self.assertEqual(self.bundle.requirements.count(), 1)

    def test_apply_clear_deadline_sets_pack_target_date(self):
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {"selected_required_documents": ["Passport copy"],
                 "selected_deadlines": [0], "create_reminders": True},
                format="json",
            )
        self.assertEqual(resp.data["created_reminders"], 1)
        self.assertEqual(resp.data["target_date_set"], "2026-08-31")
        self.bundle.refresh_from_db()
        self.assertEqual(self.bundle.target_date, date(2026, 8, 31))

    def test_apply_ambiguous_deadline_creates_no_reminder(self):
        # A deadline with no parseable date must not set a pack deadline.
        self.draft.extracted_payload["deadlines"] = [
            {"title": "Sometime in autumn", "date": None, "description": "", "source_snippet": ""}
        ]
        self.draft.save(update_fields=["extracted_payload"])
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {"selected_required_documents": ["Passport copy"],
                 "selected_deadlines": [0], "create_reminders": True},
                format="json",
            )
        self.assertEqual(resp.data["created_reminders"], 0)
        self.bundle.refresh_from_db()
        self.assertIsNone(self.bundle.target_date)

    def test_cannot_apply_another_users_draft(self):
        self.client.force_authenticate(self.other)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {"selected_required_documents": ["Passport copy"]}, format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_readiness_improves_after_applying_satisfied_requirement(self):
        # Apply one required doc, then a second pack with it satisfied scores higher.
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(
                self.apply_url,
                {"selected_required_documents": ["Passport copy"], "create_reminders": False},
                format="json",
            )
        # 0/1 required satisfied → score 0; readiness payload present.
        self.assertEqual(resp.data["pack_readiness"]["summary"]["missing_count"], 1)


class SafeFetchUnitTests(TestCase):
    def test_unsupported_scheme_rejected(self):
        for bad in ("ftp://x", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x"):
            with self.assertRaises(SafeFetchError) as ctx:
                fetch_requirement_page(bad)
            self.assertIn(ctx.exception.code, {"unsupported_scheme", "invalid_url"})

    def test_invalid_url_rejected(self):
        with self.assertRaises(SafeFetchError):
            fetch_requirement_page("not a url")

    def test_private_address_rejected(self):
        # Resolve to a private IP → blocked before any connection.
        with mock.patch(
            "apps.ai.requirement_links.socket.getaddrinfo",
            return_value=[(2, 1, 6, "", ("127.0.0.1", 0))],
        ):
            with self.assertRaises(SafeFetchError) as ctx:
                fetch_requirement_page("http://internal.local/secrets")
        self.assertEqual(ctx.exception.code, "blocked_address")
