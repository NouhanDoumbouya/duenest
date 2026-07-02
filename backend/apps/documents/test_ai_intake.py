"""Tests for Smart Intake (understand a file + confirm-gated suggestions)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai.client import AIResult
from apps.ai.models import AiPreference
from apps.documents import ai_intake
from apps.documents.models import Document, DocumentFile

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
)


def _grant_pro(user):
    # AI file intake is a Pro feature; endpoint tests need an entitled user.
    from apps.billing.models import Plan, UserSubscription

    UserSubscription.objects.create(
        user=user, plan=Plan.objects.get(key="pro"),
        provider="manual", status="active", billing_interval="month",
    )


def _flags(value: bool):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _extraction(fields):
    return mock.patch(
        "apps.documents.services.extract_file_details",
        return_value=SimpleNamespace(extracted_fields=fields, raw_text="x"),
    )


class IntakeEnabledTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables(self):
        with _flags(True):
            self.assertFalse(ai_intake.intake_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_intake.intake_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_intake.intake_enabled(object()))


@override_settings(**_CONFIGURED)
class SuggestIntakeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        Document.objects.create(owner=cls.user, title="Existing Visa", document_type="visa")

    def test_not_configured_in_band(self):
        with override_settings(AI_CONFIGURED=False):
            out = ai_intake.suggest_intake(self.user, object())
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "not_configured")

    def test_summary_fields_and_suggestions(self):
        data = {
            "summary": "This looks like a passport.",
            "suggestions": [
                {"type": "create_document", "label": "Save as document"},
                {"type": "set_reminder", "label": "Set a renewal reminder"},
                {"type": "draft", "label": "Draft a cover letter", "goal": "visa"},
                {"type": "nonsense", "label": "x"},
            ],
        }
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        fields = {"title": "UK Passport", "document_type": "passport", "expiry_date": "2030-01-01"}
        with _extraction(fields), mock.patch.object(ai_intake, "generate", gen):
            out = ai_intake.suggest_intake(self.user, object())

        self.assertTrue(out["available"])
        self.assertEqual(out["suggested_fields"], fields)
        types = [s["type"] for s in out["suggestions"]]
        self.assertEqual(types, ["create_document", "set_reminder", "draft"])  # nonsense dropped
        self.assertEqual(out["suggestions"][2]["goal"], "visa")
        # the existing documents were given to the model for context
        _, kwargs = gen.call_args
        self.assertIn("Existing Visa", kwargs["prompt"])

    def test_extraction_failure_still_proceeds(self):
        gen = mock.Mock(
            return_value=AIResult(ok=True, data={"summary": "s", "suggestions": []}, reason="ok")
        )
        with mock.patch(
            "apps.documents.services.extract_file_details", side_effect=RuntimeError("boom")
        ), mock.patch.object(ai_intake, "generate", gen):
            out = ai_intake.suggest_intake(self.user, object())
        self.assertTrue(out["available"])
        self.assertEqual(out["suggested_fields"], {})

    def test_model_failure_keeps_fields(self):
        fields = {"title": "T"}
        with _extraction(fields), mock.patch.object(
            ai_intake, "generate", mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        ):
            out = ai_intake.suggest_intake(self.user, object())
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "error")
        self.assertEqual(out["suggested_fields"], fields)


class FileIntakeEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        _grant_pro(self.user)
        self.client.force_authenticate(self.user)
        AiPreference.objects.create(user=self.user, ai_enabled=True)

    def _inbox_file(self, owner):
        return DocumentFile.objects.create(
            document=None,
            uploaded_by=owner,
            file=SimpleUploadedFile("scan.pdf", b"%PDF-1.4 x", content_type="application/pdf"),
            original_filename="scan.pdf",
            content_type="application/pdf",
            file_size=9,
        )

    def test_flag_off_returns_503(self):
        resp = self.client.post(reverse("file-inbox-intake", args=[999]), {}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_other_users_file_404(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        f = self._inbox_file(other)
        with _flags(True):
            resp = self.client.post(reverse("file-inbox-intake", args=[f.id]), {}, format="json")
        self.assertEqual(resp.status_code, 404)

    @override_settings(**_CONFIGURED)
    def test_enabled_returns_suggestions(self):
        f = self._inbox_file(self.user)
        payload = {
            "available": True,
            "reason": "ok",
            "summary": "A passport.",
            "suggested_fields": {"title": "UK Passport"},
            "suggestions": [],
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_intake.suggest_intake", return_value=payload
        ):
            resp = self.client.post(reverse("file-inbox-intake", args=[f.id]), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["summary"], "A passport.")

    @override_settings(**_CONFIGURED)
    def test_free_user_blocked_from_ai_intake(self):
        # Pricing (migration 0017): AI intake is Pro-only. Deterministic intake
        # still works for Free elsewhere; here the AI path is gated with no call.
        free = User.objects.create_user(
            username="free-intake", email="fi@x.com", password="StrongPassword123!DN"
        )
        AiPreference.objects.create(user=free, ai_enabled=True)
        f = self._inbox_file(free)
        svc = mock.Mock()
        self.client.force_authenticate(free)
        with _flags(True), mock.patch("apps.documents.ai_intake.suggest_intake", svc):
            resp = self.client.post(reverse("file-inbox-intake", args=[f.id]), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["available"])
        self.assertEqual(resp.data["reason"], "ai_feature_not_in_plan")
        svc.assert_not_called()
