"""
AI Application Document Generator V1 — generate → review → export → save.

Hermetic: the Anthropic call is always mocked. Covers gating (consent / Pro plan
/ variable credits / charge-on-success only), owner isolation, the ATS validator,
real PDF/DOCX export (no AI, no credits), storage/file-limit enforcement on
export, save-to-pack, and no-file-URL safety.
"""

from __future__ import annotations

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.billing import entitlements
from apps.billing.models import Plan, UserSubscription
from apps.documents import application_document_generator as gen
from apps.documents import document_templates as templates
from apps.documents.models import (
    DocumentBundle,
    GeneratedApplicationDocument,
    TrackedApplication,
)
from apps.users.models import SmartProfileEducation, SmartProfileWork

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True, ANTHROPIC_API_KEY="sk-test", AI_MODEL="claude-haiku-4-5",
    AI_MAX_TOKENS=4096, AI_USAGE_METERING_ENABLED=True, AI_BUDGET_GUARD_ENABLED=False,
)

TEMPLATES_URL = "/api/v1/application-documents/templates/"
GENERATE_URL = "/api/v1/application-documents/generate/"


def _flags(value=True):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _grant_pro(user):
    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


_CV_RESULT = AIResult(ok=True, reason="ok", model="claude-haiku-4-5", data={
    "title": "ATS Resume",
    "content": {
        "header": {"name": "Jane Doe", "email": "jane@x.com", "phone": "+60", "location": "KL"},
        "summary": "Data scientist with 3 years experience.",
        "education": ["BSc Computer Science, MIT, 2020"],
        "experience": ["Built models improving accuracy by 12% at Acme (2021-2024)"],
        "skills": ["Python", "SQL"],
        "projects": [], "certifications": [], "awards": [], "leadership": [], "languages": [],
    },
    "plain_text": "Jane Doe\nData scientist...",
    "quality_checks": {"strengths": ["Clear"], "missing_information": [],
                       "risk_warnings": [], "suggested_improvements": []},
    "recommended_template": "ats_classic",
})

_LETTER_RESULT = AIResult(ok=True, reason="ok", model="claude-haiku-4-5", data={
    "title": "Motivation Letter",
    "content": {"sections": [{"heading": "Opening", "body": "Dear Committee, ..."}],
                "closing": "Sincerely, Jane"},
    "plain_text": "Dear Committee...",
    "quality_checks": {"strengths": [], "missing_information": ["No GPA on file"],
                       "risk_warnings": [], "suggested_improvements": []},
    "recommended_template": "formal_letter",
})


@override_settings(**_CONFIGURED)
class GenerateGatingTests(APITestCase):
    def setUp(self):
        self.pro = User.objects.create_user(username="p", email="p@x.com", password="StrongPass123!DN")
        _grant_pro(self.pro)
        AiPreference.objects.create(user=self.pro, ai_enabled=True)
        SmartProfileEducation.objects.create(owner=self.pro, institution_name="MIT")
        SmartProfileWork.objects.create(owner=self.pro, organization_name="Acme")

    def _used(self, user):
        return entitlements.get_ai_credits_used_this_month(user)

    def test_templates_requires_auth(self):
        self.assertEqual(self.client.get(TEMPLATES_URL).status_code, 401)

    def test_templates_returns_ats_and_premium(self):
        self.client.force_authenticate(self.pro)
        with _flags(True):
            data = self.client.get(TEMPLATES_URL).data
        keys = {t["key"] for t in data["templates"]}
        self.assertIn("ats_classic", keys)
        self.assertIn("premium_letter", keys)
        ats = next(t for t in data["templates"] if t["key"] == "ats_classic")
        self.assertTrue(ats["ats_safe"])

    def test_consent_required(self):
        AiPreference.objects.filter(user=self.pro).update(ai_enabled=False)
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(gen, "generate") as g:
            resp = self.client.post(GENERATE_URL, {"document_type": "ats_resume"}, format="json")
        self.assertEqual(resp.data["reason"], "consent_required")
        g.assert_not_called()
        self.assertEqual(self._used(self.pro), 0)

    def test_free_user_blocked(self):
        free = User.objects.create_user(username="f", email="f@x.com", password="StrongPass123!DN")
        AiPreference.objects.create(user=free, ai_enabled=True)
        self.client.force_authenticate(free)
        with _flags(True), mock.patch.object(gen, "generate") as g:
            resp = self.client.post(GENERATE_URL, {"document_type": "ats_resume"}, format="json")
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        g.assert_not_called()
        self.assertEqual(self._used(free), 0)

    def test_pro_generates_cv_and_charges_8_credits(self):
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(gen, "generate", return_value=_CV_RESULT):
            resp = self.client.post(
                GENERATE_URL,
                {"document_type": "ats_resume", "template_key": "ats_classic"},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["available"])
        self.assertEqual(resp.data["credits_charged"], 8)
        self.assertEqual(self._used(self.pro), 8)
        self.assertIsNotNone(resp.data["ats_score"])
        gad = GeneratedApplicationDocument.objects.get(pk=resp.data["generated_document_id"])
        self.assertEqual(gad.credits_charged, 8)

    def test_email_charges_3_credits(self):
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(gen, "generate", return_value=_LETTER_RESULT):
            resp = self.client.post(
                GENERATE_URL, {"document_type": "application_email"}, format="json"
            )
        self.assertEqual(resp.data["credits_charged"], 3)
        self.assertEqual(self._used(self.pro), 3)

    def test_failed_ai_charges_zero(self):
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(
            gen, "generate", return_value=AIResult(ok=False, reason="error")
        ):
            resp = self.client.post(GENERATE_URL, {"document_type": "ats_resume"}, format="json")
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "error")
        self.assertEqual(self._used(self.pro), 0)
        self.assertEqual(GeneratedApplicationDocument.objects.count(), 0)

    def test_missing_profile_returns_warnings_not_hallucination(self):
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(gen, "generate", return_value=_LETTER_RESULT):
            resp = self.client.post(
                GENERATE_URL, {"document_type": "motivation_letter"}, format="json"
            )
        messages = [w["message"] for w in resp.data["warnings"]]
        self.assertIn("No GPA on file", messages)

    def test_cannot_generate_from_another_users_application(self):
        other = User.objects.create_user(username="o", email="o@x.com", password="StrongPass123!DN")
        app = TrackedApplication.objects.create(owner=other, title="Theirs")
        self.client.force_authenticate(self.pro)
        with _flags(True), mock.patch.object(gen, "generate", return_value=_CV_RESULT):
            resp = self.client.post(
                GENERATE_URL,
                {"document_type": "ats_resume", "application_id": app.id},
                format="json",
            )
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "not_found")

    def test_no_ai_call_uses_only_profile_context(self):
        # Verify the prompt fed to the model contains profile context, and the
        # passport number (in the encrypted store) never reaches the context.
        from apps.users.models import UserProfileDetails

        row = UserProfileDetails.objects.create(user=self.pro)
        row.set_details({"legal_name": "Jane Doe", "passport_number": "SECRET999"})
        row.save()
        self.client.force_authenticate(self.pro)
        captured = {}

        def _capture(**kwargs):
            captured["prompt"] = kwargs.get("prompt", "")
            return _CV_RESULT

        with _flags(True), mock.patch.object(gen, "generate", side_effect=_capture):
            self.client.post(GENERATE_URL, {"document_type": "ats_resume"}, format="json")
        self.assertIn("Jane Doe", captured["prompt"])
        self.assertNotIn("SECRET999", captured["prompt"])  # passport never sent


@override_settings(**_CONFIGURED)
class ExportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="e", email="e@x.com", password="StrongPass123!DN")
        _grant_pro(self.user)
        self.bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship Pack")
        self.gad = GeneratedApplicationDocument.objects.create(
            owner=self.user, bundle=self.bundle, document_type="ats_resume",
            title="Jane Doe CV", template_key="ats_classic", content_style="corporate",
            structured_content=_CV_RESULT.data["content"],
            plain_text_preview="Jane Doe...", ats_score=90, warnings=[],
        )
        self.export_url = f"/api/v1/application-documents/{self.gad.id}/export/"
        self.client.force_authenticate(self.user)

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_export_pdf_creates_real_file_no_credits(self):
        with _flags(True), mock.patch("apps.ai.client.generate") as g:
            resp = self.client.post(self.export_url, {"format": "pdf"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["exported"])
        self.assertIn("file_id", resp.data)
        g.assert_not_called()           # export never calls AI
        self.assertEqual(self._used(), 0)  # and never charges credits
        self.gad.refresh_from_db()
        self.assertIsNotNone(self.gad.exported_pdf_file_id)
        # The stored bytes are a real (encrypted) PDF file.
        from apps.documents.file_encryption import read_plaintext

        plaintext = read_plaintext(self.gad.exported_pdf_file)
        self.assertTrue(plaintext.startswith(b"%PDF"))

    def test_export_docx_creates_real_file(self):
        with _flags(True):
            resp = self.client.post(self.export_url, {"format": "docx"}, format="json")
        self.assertTrue(resp.data["exported"])
        self.gad.refresh_from_db()
        from apps.documents.file_encryption import read_plaintext

        plaintext = read_plaintext(self.gad.exported_docx_file)
        self.assertTrue(plaintext.startswith(b"PK"))  # docx is a zip

    def test_export_respects_storage_limit(self):
        # Drop the Free storage limit to 0 by switching the user to Free and
        # filling it — simplest: patch the limit lookup to a tiny cap.
        from apps.users.models import User as U  # noqa: F401

        self.user.plan = "free"
        self.user.save(update_fields=["plan"])
        with mock.patch(
            "apps.documents.plan_usage.get_user_storage_limit_bytes", return_value=10
        ):
            with _flags(True):
                resp = self.client.post(self.export_url, {"format": "pdf"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["code"], "plan_limit_exceeded")

    def test_export_and_save_to_pack(self):
        with _flags(True):
            resp = self.client.post(
                self.export_url, {"format": "pdf", "save_to_pack": True}, format="json"
            )
        self.assertTrue(resp.data["exported"])
        self.assertTrue(resp.data["saved_to_pack"])
        self.assertIn("document_id", resp.data)
        self.assertIn("pack_readiness", resp.data)
        self.gad.refresh_from_db()
        self.assertEqual(self.gad.status, "saved_to_pack")
        self.assertIsNotNone(self.gad.created_document_id)
        # A satisfied requirement now exists on the pack.
        self.assertTrue(self.bundle.requirements.filter(status="attached").exists())

    def test_no_raw_storage_urls_in_responses(self):
        with _flags(True):
            resp = self.client.post(
                self.export_url, {"format": "pdf", "save_to_pack": True}, format="json"
            )
        blob = json.dumps(resp.data).lower()
        for marker in ("x-amz", "r2.cloudflarestorage", "amazonaws", "https://"):
            self.assertNotIn(marker, blob)
        # The download route is the private app route, not a storage URL.
        self.assertTrue(resp.data["download_url"].startswith("/api/v1/files/"))

    def test_cannot_export_another_users_draft(self):
        other = User.objects.create_user(username="x", email="x@x.com", password="StrongPass123!DN")
        self.client.force_authenticate(other)
        with _flags(True):
            resp = self.client.post(self.export_url, {"format": "pdf"}, format="json")
        self.assertEqual(resp.status_code, 404)


class AtsValidatorTests(APITestCase):
    def test_ats_validator_scores_and_warns(self):
        good = {
            "summary": "x", "education": ["BSc"], "experience": ["Did X, improved 20%"],
            "skills": ["Python"],
        }
        result = templates.validate_ats_structure(good, "ats_classic")
        self.assertTrue(result["ats_safe"])
        self.assertGreaterEqual(result["score"], 90)
        # Warnings are structured {type, severity, message}.
        for w in result["warnings"]:
            self.assertEqual(set(w), {"type", "severity", "message"})

        thin = {"summary": "x"}
        bad = templates.validate_ats_structure(thin, "ats_classic")
        self.assertLess(bad["score"], 90)
        self.assertFalse(bad["ats_safe"])  # missing education = high severity
        self.assertTrue(any(w["type"] == "missing_education" for w in bad["warnings"]))

        # A non-ATS template flagged as not ATS-safe.
        premium = templates.validate_ats_structure(good, "premium_letter")
        self.assertFalse(premium["ats_safe"])
        self.assertTrue(any(w["type"] == "non_ats_template" for w in premium["warnings"]))


@override_settings(**_CONFIGURED)
class EditReviewTests(APITestCase):
    """PATCH the reviewed draft: no AI, no credits; edited content flows into the
    plain-text preview, the recomputed warnings, and the exported file."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ed", email="ed@x.com", password="StrongPass123!DN"
        )
        _grant_pro(self.user)
        self.gad = GeneratedApplicationDocument.objects.create(
            owner=self.user, document_type="ats_resume", title="Jane Doe CV",
            template_key="ats_classic", content_style="corporate",
            structured_content=_CV_RESULT.data["content"],
            plain_text_preview="old preview", status="draft",
            ats_score=90, quality_score=80, warnings=[],
        )
        self.detail_url = f"/api/v1/application-documents/{self.gad.id}/"
        self.export_url = f"/api/v1/application-documents/{self.gad.id}/export/"
        self.client.force_authenticate(self.user)

    def _used(self):
        return entitlements.get_ai_credits_used_this_month(self.user)

    def test_edit_updates_preview_and_recomputes_no_ai_no_credits(self):
        edited = dict(_CV_RESULT.data["content"])
        edited["summary"] = "Edited senior data scientist summary, 5 years."
        with _flags(True), mock.patch("apps.ai.client.generate") as g:
            resp = self.client.patch(
                self.detail_url, {"structured_content": edited}, format="json"
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        g.assert_not_called()
        self.assertEqual(self._used(), 0)
        self.gad.refresh_from_db()
        self.assertIn("Edited senior data scientist summary", self.gad.plain_text_preview)
        self.assertNotEqual(self.gad.plain_text_preview, "old preview")
        # Warnings re-derived as structured dicts.
        for w in self.gad.warnings:
            self.assertEqual(set(w), {"type", "severity", "message"})

    def test_edited_content_is_used_in_export(self):
        edited = dict(_CV_RESULT.data["content"])
        edited["summary"] = "UNIQUEMARKER42 distinctive summary text."
        with _flags(True):
            self.client.patch(
                self.detail_url, {"structured_content": edited}, format="json"
            )
            self.client.post(self.export_url, {"format": "docx"}, format="json")
        self.gad.refresh_from_db()
        import io
        import zipfile

        from apps.documents.file_encryption import read_plaintext

        plaintext = read_plaintext(self.gad.exported_docx_file)
        self.assertTrue(plaintext.startswith(b"PK"))
        # The edited text lives in the (compressed) document XML inside the zip.
        with zipfile.ZipFile(io.BytesIO(plaintext)) as zf:
            body = zf.read("word/document.xml").decode("utf-8")
        self.assertIn("UNIQUEMARKER42", body)  # edit is in the rendered DOCX

    def test_cannot_edit_another_users_draft(self):
        other = User.objects.create_user(
            username="z", email="z@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(other)
        with _flags(True):
            resp = self.client.patch(
                self.detail_url, {"title": "Hacked"}, format="json"
            )
        self.assertEqual(resp.status_code, 404)


class PresetsAndRegistryTests(APITestCase):
    def test_presets_exist_for_core_types(self):
        for dtype in ("ats_resume", "cover_letter", "scholarship_cv",
                      "visa_explanation_letter", "statement_of_purpose"):
            preset = templates.get_document_preset(dtype)
            self.assertIn("recommended_style", preset)
            self.assertIn("length_guidance", preset)
            self.assertIn("best_for", preset)
            self.assertTrue(preset["quality_rules"])

    def test_registry_includes_export_formats_and_best_for(self):
        registry = templates.build_template_registry()
        for tmpl in registry["templates"]:
            self.assertIn("export_formats", tmpl)
            self.assertIn("best_for", tmpl)
            self.assertIn("preview", tmpl)


class ContentQualityTests(APITestCase):
    def test_generic_language_flagged(self):
        content = {"sections": [
            {"heading": "Intro", "body": "I am writing to express my interest. "
             "I am passionate about this and believe I am a good fit."}
        ]}
        warnings = templates.build_content_quality_warnings(
            content, document_type="cover_letter", context={}, target_organization="Acme"
        )
        self.assertTrue(any(w["type"] == "generic_language" for w in warnings))

    def test_missing_target_org_flagged(self):
        content = {"sections": [{"heading": "Intro", "body": "Concrete specific text."}]}
        warnings = templates.build_content_quality_warnings(
            content, document_type="cover_letter", context={}, target_organization=""
        )
        self.assertTrue(any(w["type"] == "missing_target_organization" for w in warnings))
