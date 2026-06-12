from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Document

User = get_user_model()

LIST_URL = "/api/v1/documents/"


def detail_url(document_id):
    return f"/api/v1/documents/{document_id}/"


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
