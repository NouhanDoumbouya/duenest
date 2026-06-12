import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .constants import MAX_FILE_SIZE
from .models import Document, DocumentFile

User = get_user_model()

LIST_URL = "/api/v1/documents/"


def detail_url(document_id):
    return f"/api/v1/documents/{document_id}/"


def files_url(document_id):
    return f"/api/v1/documents/{document_id}/files/"


def file_detail_url(document_id, file_id):
    return f"/api/v1/documents/{document_id}/files/{file_id}/"


def make_pdf(name="passport.pdf", content=b"%PDF-1.4 fake pdf bytes"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


class DocumentAPITests(APITestCase):
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

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    # 1. Anonymous users cannot list documents.
    def test_anonymous_cannot_list_documents(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 2. Authenticated user can create a document.
    def test_authenticated_user_can_create_document(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {"title": "My Passport", "document_type": "passport"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "My Passport")
        self.assertEqual(Document.objects.count(), 1)

    # 3. Document owner is set automatically from the authenticated user.
    def test_owner_is_set_from_request_user(self):
        self.authenticate(self.alice)
        # Even if the client tries to set another owner, it must be ignored.
        response = self.client.post(
            LIST_URL,
            {"title": "Visa", "owner": self.bob.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = Document.objects.get(id=response.data["id"])
        self.assertEqual(document.owner, self.alice)

    # 4. Authenticated user can list only their own documents.
    def test_user_lists_only_their_own_documents(self):
        Document.objects.create(owner=self.alice, title="Alice Doc")
        Document.objects.create(owner=self.bob, title="Bob Doc")

        self.authenticate(self.alice)
        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Alice Doc")

    # 5. Authenticated user can retrieve their own document.
    def test_user_can_retrieve_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.authenticate(self.alice)
        response = self.client.get(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Alice Doc")

    # 6. Authenticated user cannot retrieve another user's document.
    def test_user_cannot_retrieve_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.get(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 7. Authenticated user can update their own document.
    def test_user_can_update_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Old Title")
        self.authenticate(self.alice)
        response = self.client.patch(
            detail_url(document.id),
            {"title": "New Title", "status": "archived"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        document.refresh_from_db()
        self.assertEqual(document.title, "New Title")
        self.assertEqual(document.status, "archived")

    def test_user_cannot_update_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.patch(
            detail_url(document.id), {"title": "Hacked"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        document.refresh_from_db()
        self.assertEqual(document.title, "Bob Doc")

    # 8. Authenticated user can delete their own document.
    def test_user_can_delete_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.authenticate(self.alice)
        response = self.client.delete(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Document.objects.filter(id=document.id).exists())

    def test_user_cannot_delete_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.delete(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Document.objects.filter(id=document.id).exists())

    # 9. Invalid date order is rejected.
    def test_expiry_before_issue_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {
                "title": "Bad Dates",
                "issue_date": "2026-01-10",
                "expiry_date": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expiry_date", response.data)

    def test_renewal_after_expiry_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {
                "title": "Bad Renewal",
                "expiry_date": "2026-01-01",
                "renewal_date": "2026-02-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("renewal_date", response.data)


# Route uploads to a throwaway dir so tests never touch real MEDIA_ROOT.
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-test-media-")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class DocumentFileAPITests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

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
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")

    def upload(self, document, upload=None):
        return self.client.post(
            files_url(document.id),
            {"file": upload or make_pdf()},
            format="multipart",
        )

    # 1. Anonymous users cannot list document files.
    def test_anonymous_cannot_list_files(self):
        response = self.client.get(files_url(self.alice_doc.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 2. Authenticated user can upload a valid file to their own document.
    def test_user_can_upload_valid_file(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.alice_doc)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DocumentFile.objects.count(), 1)

    # 3. Uploaded file metadata is stored correctly.
    def test_uploaded_metadata_is_stored(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.alice_doc, make_pdf(name="my passport.pdf"))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        file = DocumentFile.objects.get(id=response.data["id"])
        self.assertEqual(file.original_filename, "my passport.pdf")
        self.assertEqual(file.content_type, "application/pdf")
        self.assertGreater(file.file_size, 0)
        self.assertEqual(len(file.checksum), 64)  # sha256 hex
        self.assertEqual(file.uploaded_by, self.alice)
        # The stored path must not leak in the response.
        self.assertNotIn("file", response.data)
        self.assertNotIn("/media/", str(response.data.get("download_url", "")))
        # Filename is not used as the storage path (uuid-based).
        self.assertNotIn("my passport", file.file.name)

    # 4. Authenticated user can list only files for their own document.
    def test_user_lists_only_own_document_files(self):
        DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf(),
            original_filename="a.pdf",
            file_size=10,
        )
        DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(files_url(self.alice_doc.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["original_filename"], "a.pdf")

    # 5. Authenticated user cannot upload a file to another user's document.
    def test_user_cannot_upload_to_other_users_document(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.bob_doc)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DocumentFile.objects.count(), 0)

    # 6. Authenticated user cannot retrieve another user's document file.
    def test_user_cannot_retrieve_other_users_file(self):
        bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        # Even guessing the right document/file ids must not leak it.
        response = self.client.get(
            file_detail_url(self.bob_doc.id, bob_file.id)
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_download_other_users_file(self):
        bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(
            f"{file_detail_url(self.bob_doc.id, bob_file.id)}download/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 7. Authenticated user can delete their own document file.
    def test_user_can_delete_own_file(self):
        self.client.force_authenticate(self.alice)
        created = self.upload(self.alice_doc)
        file_id = created.data["id"]

        response = self.client.delete(
            file_detail_url(self.alice_doc.id, file_id)
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DocumentFile.objects.filter(id=file_id).exists())

    def test_owner_can_download_own_file(self):
        self.client.force_authenticate(self.alice)
        created = self.upload(self.alice_doc)
        file_id = created.data["id"]
        response = self.client.get(
            f"{file_detail_url(self.alice_doc.id, file_id)}download/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # 8. Invalid file type is rejected.
    def test_invalid_file_type_is_rejected(self):
        self.client.force_authenticate(self.alice)
        bad = SimpleUploadedFile(
            "evil.exe", b"MZ binary", content_type="application/x-msdownload"
        )
        response = self.upload(self.alice_doc, bad)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentFile.objects.count(), 0)

    # 9. Oversized file is rejected.
    def test_oversized_file_is_rejected(self):
        self.client.force_authenticate(self.alice)
        big = SimpleUploadedFile(
            "big.pdf",
            b"0" * (MAX_FILE_SIZE + 1),
            content_type="application/pdf",
        )
        response = self.upload(self.alice_doc, big)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentFile.objects.count(), 0)
