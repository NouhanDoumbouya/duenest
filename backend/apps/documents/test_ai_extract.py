"""Tests for the opt-in, key-gated AI document field extraction (Feature #1).

All hermetic: the Anthropic call is mocked, feature flags are patched, and the
extraction wiring is exercised without DB or file IO.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from apps.ai.client import AIResult
from apps.documents import ai_extract
from apps.documents.services import extract_file_details

_CONFIGURED = dict(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
)


def _flags(value: bool):
    """Patch the lazily-imported feature-flag check used by ai_extract."""
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


@override_settings(**_CONFIGURED)
class SuggestFieldsTests(SimpleTestCase):
    def setUp(self):
        p = mock.patch("apps.ai.privacy.ai_consented", return_value=True)
        p.start()
        self.addCleanup(p.stop)

    def test_returns_cleaned_fields_when_enabled(self):
        data = {
            "title": "  British Passport ",
            "document_type": "passport",
            "expiry_date": "2030-06-01",
            "issue_date": "2020-06-01",
            "reference_number": "X1234567",
            "unknown_field": "ignored",  # not in APPLICABLE_FIELDS
        }
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with _flags(True), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("Passport text...", user=object())

        self.assertEqual(out["title"], "British Passport")  # trimmed
        self.assertEqual(out["expiry_date"], "2030-06-01")
        self.assertEqual(out["reference_number"], "X1234567")
        self.assertNotIn("unknown_field", out)
        # the schema + bounded text were forwarded
        _, kwargs = gen.call_args
        self.assertIn("output_schema", kwargs)

    def test_invalid_dates_are_dropped(self):
        data = {"expiry_date": "not-a-date", "document_type": "visa"}
        gen = mock.Mock(return_value=AIResult(ok=True, data=data, reason="ok"))
        with _flags(True), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("text", user=object())

        self.assertNotIn("expiry_date", out)
        self.assertEqual(out["document_type"], "visa")

    def test_all_empty_result_is_none(self):
        gen = mock.Mock(return_value=AIResult(ok=True, data={"title": "  "}, reason="ok"))
        with _flags(True), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("text", user=object())
        self.assertIsNone(out)

    def test_failed_call_returns_none(self):
        gen = mock.Mock(return_value=AIResult(ok=False, reason="refusal"))
        with _flags(True), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("text", user=object())
        self.assertIsNone(out)

    def test_flags_off_short_circuits_without_calling_model(self):
        gen = mock.Mock()
        with _flags(False), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("text", user=object())
        self.assertIsNone(out)
        gen.assert_not_called()

    def test_blank_text_returns_none(self):
        gen = mock.Mock()
        with _flags(True), mock.patch.object(ai_extract, "generate", gen):
            out = ai_extract.suggest_fields("   ", user=object())
        self.assertIsNone(out)
        gen.assert_not_called()


class GatingTests(SimpleTestCase):
    def setUp(self):
        p = mock.patch("apps.ai.privacy.ai_consented", return_value=True)
        p.start()
        self.addCleanup(p.stop)

    @override_settings(AI_CONFIGURED=False)
    def test_not_configured_disables_extraction(self):
        with _flags(True):
            self.assertFalse(ai_extract.ai_extraction_enabled(object()))

    @override_settings(**_CONFIGURED)
    def test_requires_both_flags(self):
        with _flags(True):
            self.assertTrue(ai_extract.ai_extraction_enabled(object()))
        with _flags(False):
            self.assertFalse(ai_extract.ai_extraction_enabled(object()))


class ExtractFileDetailsWiringTests(SimpleTestCase):
    """The AI suggestions are merged into ExtractionResult, with graceful fallback."""

    def _pdf_file(self):
        return SimpleNamespace(
            content_type="application/pdf",
            original_filename="passport.pdf",
            file=object(),
            uploaded_by=object(),
        )

    def test_ai_fields_win_and_provider_is_ai(self):
        ai_fields = {"expiry_date": "2030-02-02", "document_type": "passport"}
        with mock.patch(
            "apps.documents.services._extract_pdf_text",
            return_value="Date of expiry: 2030-01-01",
        ), mock.patch(
            "apps.documents.services._ai_field_suggestions", return_value=ai_fields
        ):
            result = extract_file_details(self._pdf_file())

        self.assertEqual(result.provider, "ai")
        self.assertEqual(result.confidence_score, 0.85)
        # AI value overrides the regex-derived 2030-01-01
        self.assertEqual(result.extracted_fields["expiry_date"], "2030-02-02")
        self.assertEqual(result.extracted_fields["document_type"], "passport")

    def test_falls_back_to_regex_when_ai_unavailable(self):
        with mock.patch(
            "apps.documents.services._extract_pdf_text",
            return_value="Date of expiry: 2030-01-01",
        ), mock.patch(
            "apps.documents.services._ai_field_suggestions", return_value=None
        ):
            result = extract_file_details(self._pdf_file())

        self.assertEqual(result.provider, "local_text")
        self.assertEqual(result.extracted_fields["expiry_date"], "2030-01-01")

    def test_ai_helper_swallows_errors(self):
        from apps.documents import services

        with mock.patch(
            "apps.documents.ai_extract.suggest_fields",
            side_effect=RuntimeError("boom"),
        ):
            self.assertIsNone(services._ai_field_suggestions("text", object()))
