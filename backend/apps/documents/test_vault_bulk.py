"""
Tests for the Vault bulk backend endpoints:

* POST /documents/export-documents/        (ZIP of selected documents' files)
* POST /document-bundles/<id>/add-documents/ (add documents to a pack as
  attached requirements)

Focus: owner isolation, additive behavior, and honest empty states.
"""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentCategory,
    DocumentFile,
    DocumentTag,
)

User = get_user_model()


class VaultBulkBaseTest(APITestCase):
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

    def _doc(self, title, *, owner=None, with_file=True):
        owner = owner or self.owner
        doc = Document.objects.create(owner=owner, title=title)
        if with_file:
            DocumentFile.objects.create(
                document=doc,
                uploaded_by=owner,
                file=SimpleUploadedFile(f"{title}.pdf", b"%PDF-1.4 x"),
                original_filename=f"{title}.pdf",
                content_type="application/pdf",
            )
        return doc


class DocumentsBulkExportTest(VaultBulkBaseTest):
    URL = "/api/v1/documents/export-documents/"

    def test_exports_selected_documents_as_zip(self):
        a = self._doc("passport")
        b = self._doc("visa")
        response = self.client.post(
            self.URL, {"document_ids": [a.id, b.id]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/zip")
        body = b"".join(response.streaming_content)
        self.assertTrue(body.startswith(b"PK"))  # a real zip archive

    def test_other_users_documents_are_excluded(self):
        mine = self._doc("mine")
        theirs = self._doc("theirs", owner=self.other)
        # Only my document resolves to a file; theirs is ignored.
        response = self.client.post(
            self.URL, {"document_ids": [mine.id, theirs.id]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["X-Export-Files-Count"], "1")

    def test_documents_without_files_yield_400(self):
        empty = self._doc("no-file", with_file=False)
        response = self.client.post(
            self.URL, {"document_ids": [empty.id]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["state"], "no_files")

    def test_requires_ids(self):
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class DocumentsBulkActionTest(VaultBulkBaseTest):
    URL = "/api/v1/documents/bulk-action/"

    def test_move_category(self):
        cat = DocumentCategory.objects.create(owner=self.owner, name="Travel")
        a = self._doc("a", with_file=False)
        b = self._doc("b", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "move_category", "document_ids": [a.id, b.id], "category": cat.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 2)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.category_id, cat.id)
        self.assertEqual(b.category_id, cat.id)

    def test_archive(self):
        a = self._doc("a", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "archive", "document_ids": [a.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        a.refresh_from_db()
        self.assertEqual(a.lifecycle_status, Document.Lifecycle.ARCHIVED)

    def test_trash(self):
        a = self._doc("a", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "trash", "document_ids": [a.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        a.refresh_from_db()
        self.assertTrue(a.is_trashed)

    def test_add_tag(self):
        tag = DocumentTag.objects.create(owner=self.owner, name="urgent")
        a = self._doc("a", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "add_tag", "document_ids": [a.id], "tag": tag.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(tag, a.tags.all())

    def test_owner_isolation(self):
        mine = self._doc("mine", with_file=False)
        theirs = self._doc("theirs", owner=self.other, with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "archive", "document_ids": [mine.id, theirs.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Only my document is affected; the other user's is untouched.
        self.assertEqual(response.data["updated"], 1)
        theirs.refresh_from_db()
        self.assertNotEqual(theirs.lifecycle_status, Document.Lifecycle.ARCHIVED)

    def test_unknown_action_rejected(self):
        a = self._doc("a", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "nope", "document_ids": [a.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_use_another_users_category(self):
        their_cat = DocumentCategory.objects.create(owner=self.other, name="Theirs")
        a = self._doc("a", with_file=False)
        response = self.client.post(
            self.URL,
            {"action": "move_category", "document_ids": [a.id], "category": their_cat.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class BundleAddDocumentsTest(VaultBulkBaseTest):
    def _bundle(self):
        return DocumentBundle.objects.create(owner=self.owner, title="Visa pack")

    def test_adds_documents_as_attached_requirements(self):
        bundle = self._bundle()
        a = self._doc("passport")
        b = self._doc("transcript")
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/add-documents/",
            {"document_ids": [a.id, b.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["created"], 2)
        reqs = DocumentBundleRequirement.objects.filter(bundle=bundle)
        self.assertEqual(reqs.count(), 2)
        self.assertTrue(
            all(
                r.status == DocumentBundleRequirement.Status.ATTACHED
                and r.linked_document_id in {a.id, b.id}
                for r in reqs
            )
        )

    def test_is_additive_and_owner_scoped(self):
        bundle = self._bundle()
        DocumentBundleRequirement.objects.create(
            owner=self.owner, bundle=bundle, title="Existing"
        )
        mine = self._doc("mine")
        theirs = self._doc("theirs", owner=self.other)
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/add-documents/",
            {"document_ids": [mine.id, theirs.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Only my document was added; the pre-existing requirement is preserved.
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(
            DocumentBundleRequirement.objects.filter(bundle=bundle).count(), 2
        )

    def test_cannot_add_to_another_users_bundle(self):
        bundle = DocumentBundle.objects.create(owner=self.other, title="Theirs")
        mine = self._doc("mine")
        response = self.client.post(
            f"/api/v1/document-bundles/{bundle.id}/add-documents/",
            {"document_ids": [mine.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
