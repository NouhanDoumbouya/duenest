"""
AI share-readiness tests. Hermetic: the Anthropic call is mocked and flags are
patched, so nothing hits the network and the feature degrades predictably.
"""

from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai.client import AIResult

from . import ai_readiness
from .models import Document, DocumentBundle, DocumentBundleRequirement

User = get_user_model()

_AI_REPORT = {
    "overall": "issues",
    "summary": "Almost there — one item is missing.",
    "findings": [
        {
            "severity": "blocker",
            "title": "Missing proof of address",
            "detail": "Most landlords require one dated within 3 months.",
            "fix": "Attach a recent utility bill or bank statement.",
        }
    ],
}


class ShareReadinessBaseTest(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@x.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@x.com", password="StrongPassword123!DN"
        )
        self.bundle = DocumentBundle.objects.create(
            owner=self.alice, title="Rental application"
        )
        attached_doc = Document.objects.create(
            owner=self.alice, title="Passport", document_type="passport"
        )
        # One required item satisfied, one required item missing.
        DocumentBundleRequirement.objects.create(
            owner=self.alice,
            bundle=self.bundle,
            title="Passport",
            is_required=True,
            status=DocumentBundleRequirement.Status.ATTACHED,
            linked_document=attached_doc,
        )
        DocumentBundleRequirement.objects.create(
            owner=self.alice,
            bundle=self.bundle,
            title="Proof of address",
            is_required=True,
            status=DocumentBundleRequirement.Status.MISSING,
        )

    def url(self, bundle=None):
        return f"/api/v1/document-bundles/{(bundle or self.bundle).id}/share-readiness/"


class DeterministicReportTests(ShareReadinessBaseTest):
    def test_returns_deterministic_report_when_ai_off(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(self.url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertFalse(resp.data["ai"])
        self.assertEqual(resp.data["overall"], "blocked")
        titles = [f["title"] for f in resp.data["findings"]]
        self.assertIn("Missing required item: Proof of address", titles)

    def test_owner_isolation(self):
        self.client.force_authenticate(self.bob)
        resp = self.client.post(self.url())
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(AI_CONFIGURED=True)
class AiReportTests(ShareReadinessBaseTest):
    def _flags(self, value=True):
        return mock.patch(
            "apps.features.flags.is_feature_enabled", return_value=value
        )

    def test_ai_report_when_enabled(self):
        self.client.force_authenticate(self.alice)
        gen = mock.Mock(return_value=AIResult(ok=True, data=_AI_REPORT, reason="ok"))
        with self._flags(True), mock.patch.object(ai_readiness, "generate", gen):
            resp = self.client.post(self.url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertTrue(resp.data["ai"])
        self.assertEqual(resp.data["summary"], _AI_REPORT["summary"])
        self.assertEqual(resp.data["findings"][0]["severity"], "blocker")
        gen.assert_called_once()

    def test_ready_is_downgraded_when_a_required_item_is_missing(self):
        # Even if the model says "ready", a missing required item forces "issues".
        self.client.force_authenticate(self.alice)
        ready = {"overall": "ready", "summary": "Looks good.", "findings": []}
        gen = mock.Mock(return_value=AIResult(ok=True, data=ready, reason="ok"))
        with self._flags(True), mock.patch.object(ai_readiness, "generate", gen):
            resp = self.client.post(self.url())
        self.assertEqual(resp.data["overall"], "issues")

    def test_ai_error_falls_back_to_deterministic(self):
        self.client.force_authenticate(self.alice)
        gen = mock.Mock(return_value=AIResult(ok=False, reason="error"))
        with self._flags(True), mock.patch.object(ai_readiness, "generate", gen):
            resp = self.client.post(self.url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["ai"])  # fell back
        self.assertEqual(resp.data["overall"], "blocked")


class GatingTests(ShareReadinessBaseTest):
    @override_settings(AI_CONFIGURED=False)
    def test_disabled_when_ai_not_configured(self):
        self.assertFalse(ai_readiness.share_readiness_enabled(self.alice))

    @override_settings(AI_CONFIGURED=True)
    def test_disabled_when_flags_off(self):
        with mock.patch(
            "apps.features.flags.is_feature_enabled", return_value=False
        ):
            self.assertFalse(ai_readiness.share_readiness_enabled(self.alice))

    @override_settings(AI_CONFIGURED=True)
    def test_enabled_when_configured_and_flagged(self):
        with mock.patch(
            "apps.features.flags.is_feature_enabled", return_value=True
        ):
            self.assertTrue(ai_readiness.share_readiness_enabled(self.alice))


class ExpiredDocReportTests(ShareReadinessBaseTest):
    def test_expired_attached_document_is_flagged(self):
        doc = Document.objects.create(
            owner=self.alice,
            title="Old visa",
            document_type="visa",
            expiry_date=date.today() - timedelta(days=10),
        )
        DocumentBundleRequirement.objects.create(
            owner=self.alice,
            bundle=self.bundle,
            title="Visa",
            is_required=False,
            status=DocumentBundleRequirement.Status.ATTACHED,
            linked_document=doc,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.post(self.url())
        titles = [f["title"] for f in resp.data["findings"]]
        self.assertIn("Expired: Old visa", titles)
