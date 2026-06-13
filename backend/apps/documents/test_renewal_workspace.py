"""
Tests for the Document Renewal Workspace: checklists, templates, bundles,
timeline, and the OCR-assisted extraction foundation.

The focus is on the things that matter most for this layer: strict owner
isolation, progress/readiness calculation, timeline scoping, and the
review-before-apply guarantee for extraction.
"""

import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-renewal-test-")

from .models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentChecklistTemplate,
    DocumentExtraction,
    DocumentFile,
)

User = get_user_model()


def make_pdf(name="passport.pdf", content=b"%PDF-1.4 fake pdf bytes"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


class RenewalWorkspaceBaseTest(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="StrongPassword123!DueNest",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="StrongPassword123!DueNest",
        )
        self.alice_doc = Document.objects.create(
            owner=self.alice,
            title="Alice Passport",
            document_type="passport",
            expiry_date=timezone.localdate() + timedelta(days=20),
        )
        self.bob_doc = Document.objects.create(
            owner=self.bob,
            title="Bob Passport",
            document_type="passport",
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)


# ---- Checklist templates ---------------------------------------------------


class ChecklistTemplateTests(RenewalWorkspaceBaseTest):
    def setUp(self):
        super().setUp()
        call_command("seed_checklist_templates")

    def test_seed_is_idempotent(self):
        before = DocumentChecklistTemplate.objects.count()
        call_command("seed_checklist_templates")
        self.assertEqual(DocumentChecklistTemplate.objects.count(), before)

    def test_list_templates_requires_auth(self):
        response = self.client.get("/api/v1/documents/checklist-templates/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_templates_returns_system_templates(self):
        self.auth(self.alice)
        response = self.client.get("/api/v1/documents/checklist-templates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertGreaterEqual(len(results), 6)
        # Every template should carry its item count.
        self.assertTrue(all("item_count" in t for t in results))


# ---- Checklists ------------------------------------------------------------


class ChecklistTests(RenewalWorkspaceBaseTest):
    def checklists_url(self, document_id):
        return f"/api/v1/documents/{document_id}/checklists/"

    def test_create_checklist_for_document(self):
        self.auth(self.alice)
        response = self.client.post(
            self.checklists_url(self.alice_doc.id),
            {"title": "My renewal", "checklist_type": "renewal"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["owner"], self.alice.id)
        self.assertEqual(response.data["progress"]["percent"], 0)
        self.assertEqual(response.data["status"], "not_started")

    def test_cannot_create_checklist_on_another_users_document(self):
        self.auth(self.alice)
        response = self.client.post(
            self.checklists_url(self.bob_doc.id),
            {"title": "Sneaky"},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(DocumentChecklist.objects.filter(title="Sneaky").exists())

    def test_checklist_ownership_isolation(self):
        checklist = DocumentChecklist.objects.create(
            owner=self.bob, document=self.bob_doc, title="Bob list"
        )
        self.auth(self.alice)
        # Alice cannot see Bob's checklist, even via Bob's document id.
        response = self.client.get(
            f"/api/v1/documents/{self.bob_doc.id}/checklists/{checklist.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_from_template_materializes_items(self):
        call_command("seed_checklist_templates")
        template = DocumentChecklistTemplate.objects.get(slug="passport-renewal")
        self.auth(self.alice)
        due = (timezone.localdate() + timedelta(days=30)).isoformat()
        response = self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}/checklists/from-template/",
            {"template": template.id, "due_date": due},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        items = response.data["items"]
        self.assertEqual(len(items), template.item_templates.count())
        # Offsets produce real due dates on the items.
        self.assertTrue(any(i["due_date"] for i in items))

    def test_progress_calculation(self):
        checklist = DocumentChecklist.objects.create(
            owner=self.alice, document=self.alice_doc, title="List"
        )
        i1 = DocumentChecklistItem.objects.create(
            owner=self.alice, checklist=checklist, title="A", is_required=True
        )
        DocumentChecklistItem.objects.create(
            owner=self.alice, checklist=checklist, title="B", is_required=True
        )
        self.auth(self.alice)
        # Mark the first item complete -> 50%, in_progress.
        response = self.client.patch(
            f"/api/v1/documents/{self.alice_doc.id}/checklists/{checklist.id}/items/{i1.id}/",
            {"status": "completed"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["completed_at"])

        checklist.refresh_from_db()
        self.assertEqual(checklist.progress_percent, 50)
        self.assertEqual(checklist.status, "in_progress")

    def test_progress_completed_when_all_resolved(self):
        checklist = DocumentChecklist.objects.create(
            owner=self.alice, document=self.alice_doc, title="List"
        )
        DocumentChecklistItem.objects.create(
            owner=self.alice, checklist=checklist, title="A", status="completed"
        )
        item_b = DocumentChecklistItem.objects.create(
            owner=self.alice, checklist=checklist, title="B"
        )
        self.auth(self.alice)
        # Skipping the remaining item still resolves the checklist.
        self.client.patch(
            f"/api/v1/documents/{self.alice_doc.id}/checklists/{checklist.id}/items/{item_b.id}/",
            {"status": "skipped"},
        )
        checklist.refresh_from_db()
        self.assertEqual(checklist.progress_percent, 100)
        self.assertEqual(checklist.status, "completed")

    def test_cannot_link_other_users_document_to_item(self):
        checklist = DocumentChecklist.objects.create(
            owner=self.alice, document=self.alice_doc, title="List"
        )
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}/checklists/{checklist.id}/items/",
            {"title": "X", "linked_document": self.bob_doc.id},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---- Bundles ---------------------------------------------------------------


class BundleTests(RenewalWorkspaceBaseTest):
    def test_create_and_owner_scope(self):
        self.auth(self.alice)
        response = self.client.post(
            "/api/v1/document-bundles/",
            {"title": "Visa application", "bundle_type": "application"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        bundle_id = response.data["id"]

        # Bob cannot see Alice's bundle.
        self.auth(self.bob)
        response = self.client.get(f"/api/v1/document-bundles/{bundle_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_readiness_required_missing_reduces_score(self):
        bundle = DocumentBundle.objects.create(
            owner=self.alice, title="Pack", bundle_type="renewal"
        )
        self.auth(self.alice)
        # Two required requirements, one optional.
        self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/requirements/",
            {"title": "Passport", "is_required": True},
        )
        r2 = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/requirements/",
            {"title": "Photo", "is_required": True},
        ).data

        bundle.refresh_from_db()
        self.assertEqual(bundle.readiness_score, 0)

        # Satisfy one required requirement -> 50%.
        self.client.patch(
            f"/api/v1/document-bundles/{bundle.id}/requirements/{r2['id']}/",
            {"status": "completed"},
        )
        bundle.refresh_from_db()
        self.assertEqual(bundle.readiness_score, 50)

        readiness = self.client.get(
            f"/api/v1/document-bundles/{bundle.id}/readiness/"
        ).data
        self.assertEqual(readiness["required_missing"], 1)
        self.assertFalse(readiness["is_ready"])
        self.assertIn("Passport", readiness["missing_required_titles"])

    def test_link_document_marks_attached_and_recalculates(self):
        bundle = DocumentBundle.objects.create(
            owner=self.alice, title="Pack", bundle_type="renewal"
        )
        req = DocumentBundleRequirement.objects.create(
            owner=self.alice, bundle=bundle, title="Passport", is_required=True
        )
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/requirements/{req.id}/link-document/",
            {"document": self.alice_doc.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "attached")
        bundle.refresh_from_db()
        self.assertEqual(bundle.readiness_score, 100)

    def test_cannot_link_other_users_document(self):
        bundle = DocumentBundle.objects.create(
            owner=self.alice, title="Pack", bundle_type="renewal"
        )
        req = DocumentBundleRequirement.objects.create(
            owner=self.alice, bundle=bundle, title="Passport"
        )
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/requirements/{req.id}/link-document/",
            {"document": self.bob_doc.id},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_requirement_create_blocked_on_foreign_bundle(self):
        bundle = DocumentBundle.objects.create(
            owner=self.bob, title="Bob pack", bundle_type="renewal"
        )
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/requirements/",
            {"title": "X"},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---- Timeline --------------------------------------------------------------


class TimelineTests(RenewalWorkspaceBaseTest):
    def test_timeline_only_returns_own_events(self):
        # Bob has an expiring document too.
        self.bob_doc.expiry_date = timezone.localdate() + timedelta(days=10)
        self.bob_doc.save()

        self.auth(self.alice)
        response = self.client.get("/api/v1/documents/timeline/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        related_docs = {e["related_document"] for e in response.data["items"]}
        self.assertIn(self.alice_doc.id, related_docs)
        self.assertNotIn(self.bob_doc.id, related_docs)

    def test_timeline_event_type_filter(self):
        bundle = DocumentBundle.objects.create(
            owner=self.alice,
            title="Trip",
            bundle_type="travel",
            target_date=timezone.localdate() + timedelta(days=15),
        )
        self.auth(self.alice)
        response = self.client.get(
            "/api/v1/documents/timeline/?event_type=bundle_target_date"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            all(
                e["event_type"] == "bundle_target_date"
                for e in response.data["items"]
            )
        )
        self.assertTrue(
            any(e["related_bundle"] == bundle.id for e in response.data["items"])
        )

    def test_timeline_includes_document_expiry(self):
        self.auth(self.alice)
        response = self.client.get(
            "/api/v1/documents/timeline/?event_type=document_expiry"
        )
        ids = {e["id"] for e in response.data["items"]}
        self.assertIn(f"document_expiry:{self.alice_doc.id}", ids)


# ---- Extraction ------------------------------------------------------------


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class ExtractionTests(RenewalWorkspaceBaseTest):
    def setUp(self):
        super().setUp()
        self.alice_file = DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf(),
            original_filename="passport.pdf",
            content_type="application/pdf",
            file_size=24,
        )

    def extractions_url(self):
        return (
            f"/api/v1/documents/{self.alice_doc.id}"
            f"/files/{self.alice_file.id}/extractions/"
        )

    def test_create_extraction_returns_needs_review_when_no_text(self):
        self.auth(self.alice)
        response = self.client.post(self.extractions_url())
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # No OCR library installed -> graceful needs_review, not a failure.
        self.assertEqual(response.data["extraction_status"], "needs_review")
        self.assertEqual(response.data["owner"], self.alice.id)
        # Raw text is never exposed directly.
        self.assertNotIn("raw_text", response.data)

    def test_extraction_owner_scoped(self):
        extraction = DocumentExtraction.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=self.alice_file,
            extraction_status="needs_review",
        )
        self.auth(self.bob)
        response = self.client.get(
            f"/api/v1/documents/{self.alice_doc.id}"
            f"/files/{self.alice_file.id}/extractions/{extraction.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_review_then_apply_updates_only_chosen_fields(self):
        extraction = DocumentExtraction.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=self.alice_file,
            extraction_status="needs_review",
        )
        self.auth(self.alice)
        # Review: stage fields.
        self.client.patch(
            f"/api/v1/documents/{self.alice_doc.id}"
            f"/files/{self.alice_file.id}/extractions/{extraction.id}/",
            {
                "extracted_fields": {
                    "issuer": "HM Passport Office",
                    "reference_number": "AB1234567",
                }
            },
            format="json",
        )
        # Apply only the issuer.
        response = self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}"
            f"/files/{self.alice_file.id}/extractions/{extraction.id}/apply/",
            {"fields": ["issuer"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["applied_fields"], ["issuer"])

        self.alice_doc.refresh_from_db()
        self.assertEqual(self.alice_doc.issuer, "HM Passport Office")
        # The unchosen field must NOT have been written.
        self.assertNotEqual(self.alice_doc.reference_number, "AB1234567")

    def test_apply_cannot_touch_another_users_document(self):
        extraction = DocumentExtraction.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            file=self.alice_file,
            extraction_status="needs_review",
            extracted_fields={"issuer": "X"},
        )
        self.auth(self.bob)
        response = self.client.post(
            f"/api/v1/documents/{self.alice_doc.id}"
            f"/files/{self.alice_file.id}/extractions/{extraction.id}/apply/",
            {"fields": ["issuer"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.alice_doc.refresh_from_db()
        self.assertEqual(self.alice_doc.issuer, "")
