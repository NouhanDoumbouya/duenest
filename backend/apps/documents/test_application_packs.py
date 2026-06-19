"""
Tests for Application Pack Preparation (built on bundles):

* pack-template seeding into bundle requirements (and the editable result)
* feature gating for templates + activity (default founder_only)
* the bundle activity timeline endpoint (real events, owner isolation)

These features default to FOUNDER_ONLY, so the tests enable them explicitly via
``FeatureFlag`` rows to exercise the launched behaviour for a normal user.
"""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.features.models import FeatureFlag, Visibility

from .models import (
    DocumentActivity,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
)

User = get_user_model()


def enable(*keys):
    for key in keys:
        FeatureFlag.objects.update_or_create(
            key=key, defaults={"visibility": Visibility.ENABLED}
        )


class ApplicationPackBaseTest(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="StrongPassword123!DueNest",
        )
        self.other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="StrongPassword123!DueNest",
        )
        self.client.force_authenticate(user=self.owner)


class PackTemplateSeedingTest(ApplicationPackBaseTest):
    def test_create_with_template_seeds_editable_requirements(self):
        enable("application_pack_templates")
        response = self.client.post(
            "/api/v1/document-bundles/",
            {"title": "My scholarship", "template": "scholarship"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        bundle_id = response.data["id"]
        reqs = DocumentBundleRequirement.objects.filter(bundle_id=bundle_id)
        # Scholarship template defines several items, including required ones.
        self.assertGreater(reqs.count(), 0)
        self.assertTrue(reqs.filter(is_required=True).exists())
        self.assertTrue(reqs.filter(is_required=False).exists())
        # Bundle type follows the template; everything stays MISSING until attached.
        bundle = DocumentBundle.objects.get(id=bundle_id)
        self.assertEqual(
            bundle.bundle_type, DocumentBundle.BundleType.SCHOLARSHIP
        )
        self.assertTrue(
            all(
                r.status == DocumentBundleRequirement.Status.MISSING
                for r in reqs
            )
        )

    def test_template_ignored_when_feature_disabled(self):
        # Feature defaults to founder_only; a normal user must not get seeding.
        response = self.client.post(
            "/api/v1/document-bundles/",
            {"title": "No seed", "template": "scholarship"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            DocumentBundleRequirement.objects.filter(
                bundle_id=response.data["id"]
            ).count(),
            0,
        )

    def test_custom_template_seeds_nothing(self):
        enable("application_pack_templates")
        response = self.client.post(
            "/api/v1/document-bundles/",
            {"title": "Blank", "template": "custom"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            DocumentBundleRequirement.objects.filter(
                bundle_id=response.data["id"]
            ).count(),
            0,
        )

    def test_unknown_template_is_safe(self):
        enable("application_pack_templates")
        response = self.client.post(
            "/api/v1/document-bundles/",
            {"title": "Bad", "template": "not-a-real-template"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            DocumentBundleRequirement.objects.filter(
                bundle_id=response.data["id"]
            ).count(),
            0,
        )


class PackTemplatesEndpointTest(ApplicationPackBaseTest):
    URL = "/api/v1/document-bundles/pack-templates/"

    def test_blocked_when_feature_disabled(self):
        response = self.client.get(self.URL)
        self.assertEqual(
            response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE
        )

    def test_lists_templates_with_disclaimer_when_enabled(self):
        enable("application_pack_templates")
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        templates = response.data["templates"]
        keys = {t["key"] for t in templates}
        self.assertIn("scholarship", keys)
        self.assertIn("custom", keys)
        # Every template carries a non-official disclaimer.
        self.assertTrue(all(t["disclaimer"] for t in templates))


class PackActivityTimelineTest(ApplicationPackBaseTest):
    def _make_bundle(self, title="Pack"):
        return self.client.post(
            "/api/v1/document-bundles/", {"title": title}, format="json"
        ).data

    def test_blocked_when_feature_disabled(self):
        bundle = self._make_bundle()
        response = self.client.get(
            f"/api/v1/document-bundles/{bundle['id']}/activity/"
        )
        self.assertEqual(
            response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE
        )

    def test_returns_real_events_when_enabled(self):
        enable("application_pack_timeline")
        bundle = self._make_bundle("Visa pack")
        # Adding a requirement should produce an activity event.
        self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/",
            {"title": "Passport", "is_required": True},
            format="json",
        )
        response = self.client.get(
            f"/api/v1/document-bundles/{bundle['id']}/activity/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = {e["action"] for e in response.data["items"]}
        self.assertIn(DocumentActivity.Action.BUNDLE_CREATED, actions)
        self.assertIn(DocumentActivity.Action.BUNDLE_REQUIREMENT_ADDED, actions)

    def test_owner_isolation(self):
        enable("application_pack_timeline")
        bundle = self._make_bundle()
        self.client.force_authenticate(user=self.other)
        response = self.client.get(
            f"/api/v1/document-bundles/{bundle['id']}/activity/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inbox_file_attach_is_logged(self):
        enable("application_pack_timeline")
        bundle = self._make_bundle("Inbox pack")
        req = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/",
            {"title": "Transcript", "is_required": True},
            format="json",
        ).data
        # A standalone File Inbox file (no parent document) owned by the user.
        inbox_file = DocumentFile.objects.create(
            uploaded_by=self.owner,
            file=SimpleUploadedFile("transcript.pdf", b"%PDF-1.4 x"),
            original_filename="transcript.pdf",
            content_type="application/pdf",
        )
        link = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/{req['id']}/link-file/",
            {"file": inbox_file.id},
            format="json",
        )
        self.assertEqual(link.status_code, status.HTTP_200_OK)
        self.assertEqual(link.data["status"], "attached")
        response = self.client.get(
            f"/api/v1/document-bundles/{bundle['id']}/activity/"
        )
        actions = {e["action"] for e in response.data["items"]}
        self.assertIn(DocumentActivity.Action.ADDED_TO_BUNDLE, actions)
