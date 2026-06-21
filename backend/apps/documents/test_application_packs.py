"""
Tests for Application Pack Preparation (built on bundles):

* pack-template seeding into bundle requirements (and the editable result)
* feature gating for templates + activity (default founder_only)
* the bundle activity timeline endpoint (real events, owner isolation)

These features default to FOUNDER_ONLY, so the tests enable them explicitly via
``FeatureFlag`` rows to exercise the launched behaviour for a normal user.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
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


def disable(*keys):
    # Pin a feature OFF so the "blocked when paused" path is tested explicitly,
    # independent of the registry default (these features now default to
    # beta_only, so a normal user would otherwise be allowed).
    for key in keys:
        FeatureFlag.objects.update_or_create(
            key=key, defaults={"visibility": Visibility.DISABLED}
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
        # With the feature paused, a normal user must not get template seeding.
        disable("application_pack_templates")
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


class PackExportNamingTest(ApplicationPackBaseTest):
    def _bundle_with_file(self):
        bundle = self.client.post(
            "/api/v1/document-bundles/", {"title": "My Pack"}, format="json"
        ).data
        req = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/",
            {"title": "Doc", "is_required": True},
            format="json",
        ).data
        inbox_file = DocumentFile.objects.create(
            uploaded_by=self.owner,
            file=SimpleUploadedFile("doc.pdf", b"%PDF-1.4 x"),
            original_filename="doc.pdf",
            content_type="application/pdf",
        )
        self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/{req['id']}/link-file/",
            {"file": inbox_file.id},
            format="json",
        )
        return bundle

    def test_custom_name_is_sanitized_and_used(self):
        bundle = self._bundle_with_file()
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-files/",
            {"name": "Scholarship / Application - 2026!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        disposition = response.headers["Content-Disposition"]
        self.assertIn("Scholarship_Application_2026.zip", disposition)

    def test_default_name_used_without_custom(self):
        bundle = self._bundle_with_file()
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-files/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Falls back to a dated, slugified default derived from the title.
        self.assertIn("my_pack", response.headers["Content-Disposition"].lower())


def _one_page_pdf_bytes() -> bytes:
    from io import BytesIO

    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


class PackMergedPdfTest(ApplicationPackBaseTest):
    def _bundle(self, title="Merge pack"):
        return self.client.post(
            "/api/v1/document-bundles/", {"title": title}, format="json"
        ).data

    def _attach_file(self, bundle, *, filename, content, content_type):
        req = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/",
            {"title": filename, "is_required": True},
            format="json",
        ).data
        f = DocumentFile.objects.create(
            uploaded_by=self.owner,
            file=SimpleUploadedFile(filename, content, content_type=content_type),
            original_filename=filename,
            content_type=content_type,
        )
        self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/{req['id']}/link-file/",
            {"file": f.id},
            format="json",
        )

    def test_blocked_when_feature_disabled(self):
        disable("application_pack_preparation")
        bundle = self._bundle()
        self._attach_file(
            bundle,
            filename="a.pdf",
            content=_one_page_pdf_bytes(),
            content_type="application/pdf",
        )
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/", {}
        )
        self.assertEqual(
            response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE
        )

    def test_merges_pdf_pages_in_order(self):
        enable("application_pack_preparation")
        bundle = self._bundle()
        self._attach_file(
            bundle,
            filename="first.pdf",
            content=_one_page_pdf_bytes(),
            content_type="application/pdf",
        )
        self._attach_file(
            bundle,
            filename="second.pdf",
            content=_one_page_pdf_bytes(),
            content_type="application/pdf",
        )
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/",
            {"name": "My Merged Pack 2026"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(
            "My_Merged_Pack_2026.pdf", response["Content-Disposition"]
        )
        # The two single-page PDFs should merge into a two-page document.
        from io import BytesIO

        from pypdf import PdfReader

        merged = PdfReader(BytesIO(b"".join(response.streaming_content)))
        self.assertEqual(len(merged.pages), 2)

    def test_cover_sheet_prepends_a_page(self):
        enable("application_pack_preparation")
        bundle = self._bundle()
        self._attach_file(
            bundle,
            filename="doc.pdf",
            content=_one_page_pdf_bytes(),
            content_type="application/pdf",
        )
        from io import BytesIO

        from pypdf import PdfReader

        # Without a cover: one document page.
        plain = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/", {}
        )
        self.assertEqual(
            len(PdfReader(BytesIO(b"".join(plain.streaming_content))).pages), 1
        )
        # With a cover: an extra page is prepended.
        with_cover = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/",
            {"cover": True},
            format="json",
        )
        self.assertEqual(with_cover.status_code, status.HTTP_200_OK)
        self.assertEqual(
            len(PdfReader(BytesIO(b"".join(with_cover.streaming_content))).pages),
            2,
        )

    def test_cover_only_export_without_documents_is_rejected(self):
        # A cover sheet must never be exported on its own.
        enable("application_pack_preparation")
        bundle = self._bundle()
        self._attach_file(
            bundle,
            filename="scan.png",
            content=b"\x89PNG\r\n fake png",
            content_type="image/png",
        )
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/",
            {"cover": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["state"], "no_pdfs")

    def test_non_pdf_files_are_skipped_not_merged(self):
        enable("application_pack_preparation")
        bundle = self._bundle()
        self._attach_file(
            bundle,
            filename="scan.png",
            content=b"\x89PNG\r\n fake png",
            content_type="image/png",
        )
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/export-merged-pdf/", {}
        )
        # No PDFs to merge -> honest 400, not an empty/broken file.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["state"], "no_pdfs")


class PackTemplatesEndpointTest(ApplicationPackBaseTest):
    URL = "/api/v1/document-bundles/pack-templates/"

    def test_blocked_when_feature_disabled(self):
        disable("application_pack_templates")
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
        disable("application_pack_timeline")
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

    def test_sharing_bundle_via_safesend_logs_pack_event(self):
        enable("application_pack_timeline")
        bundle = self._make_bundle("Shareable pack")
        req = self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/",
            {"title": "Passport", "is_required": True},
            format="json",
        ).data
        # The bundle must expose at least one available file to be shareable.
        inbox_file = DocumentFile.objects.create(
            uploaded_by=self.owner,
            file=SimpleUploadedFile("passport.pdf", b"%PDF-1.4 x"),
            original_filename="passport.pdf",
            content_type="application/pdf",
        )
        self.client.post(
            f"/api/v1/document-bundles/{bundle['id']}/requirements/{req['id']}/link-file/",
            {"file": inbox_file.id},
            format="json",
        )
        share = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "mode": "account_to_account",
                "permission": "view_only",
                "expires_at": (
                    timezone.now() + timedelta(minutes=10)
                ).isoformat(),
                "bundle_ids": [bundle["id"]],
            },
            format="json",
        )
        self.assertEqual(
            share.status_code, status.HTTP_201_CREATED, share.data
        )
        response = self.client.get(
            f"/api/v1/document-bundles/{bundle['id']}/activity/"
        )
        actions = {e["action"] for e in response.data["items"]}
        self.assertIn(DocumentActivity.Action.SHARED_VIA_SAFESEND, actions)

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
