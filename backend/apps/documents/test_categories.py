"""Tests for user-owned document categories (system + private, ownership-scoped)."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document, DocumentCategory

User = get_user_model()

URL = "/api/v1/document-categories/"


class DocumentCategoryTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPass123!Cat"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="StrongPass123!Cat"
        )
        # A system category (owner is null).
        self.system_cat = DocumentCategory.objects.create(name="Passport")

    def test_list_returns_system_and_own_only(self):
        DocumentCategory.objects.create(owner=self.alice, name="Alice Travel")
        DocumentCategory.objects.create(owner=self.bob, name="Bob Finance")
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = {c["name"] for c in res.data}
        self.assertIn("Passport", names)
        self.assertIn("Alice Travel", names)
        self.assertNotIn("Bob Finance", names)  # no cross-user leakage

    def test_create_private_category(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(URL, {"name": "Scholarship"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["is_system"])
        self.assertTrue(res.data["slug"])  # auto-derived
        cat = DocumentCategory.objects.get(name="Scholarship")
        self.assertEqual(cat.owner, self.alice)

    def test_create_requires_auth(self):
        res = self.client.post(URL, {"name": "Nope"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_duplicate_of_system_rejected(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(URL, {"name": "Passport"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_duplicate_of_own_rejected_case_insensitive(self):
        DocumentCategory.objects.create(owner=self.alice, name="Travel")
        self.client.force_authenticate(self.alice)
        res = self.client.post(URL, {"name": "travel"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_two_users_can_share_a_name(self):
        DocumentCategory.objects.create(owner=self.bob, name="Travel")
        self.client.force_authenticate(self.alice)
        res = self.client.post(URL, {"name": "Travel"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_blank_name_rejected(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(URL, {"name": "   "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_with_icon_and_color(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            URL,
            {"name": "Travel", "icon": "plane", "color": "#2563EB"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["icon"], "plane")
        self.assertEqual(res.data["color"], "#2563EB")

    def test_owner_can_rename_own_category(self):
        cat = DocumentCategory.objects.create(owner=self.alice, name="Skool")
        self.client.force_authenticate(self.alice)
        res = self.client.patch(
            f"{URL}{cat.id}/", {"name": "School"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        cat.refresh_from_db()
        self.assertEqual(cat.name, "School")

    def test_owner_can_delete_own_category(self):
        cat = DocumentCategory.objects.create(owner=self.alice, name="Temp")
        self.client.force_authenticate(self.alice)
        res = self.client.delete(f"{URL}{cat.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DocumentCategory.objects.filter(id=cat.id).exists())

    def test_cannot_edit_system_category(self):
        self.client.force_authenticate(self.alice)
        res = self.client.patch(
            f"{URL}{self.system_cat.id}/", {"name": "Hacked"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_edit_another_users_category(self):
        bob_cat = DocumentCategory.objects.create(owner=self.bob, name="Bob Only")
        self.client.force_authenticate(self.alice)
        res = self.client.patch(
            f"{URL}{bob_cat.id}/", {"name": "Stolen"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_uncategorized_filter(self):
        cat = DocumentCategory.objects.create(owner=self.alice, name="Travel")
        Document.objects.create(owner=self.alice, title="In category", category=cat)
        Document.objects.create(owner=self.alice, title="Loose doc")
        self.client.force_authenticate(self.alice)
        res = self.client.get("/api/v1/documents/?category=none")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        titles = {d["title"] for d in res.data["results"]}
        self.assertIn("Loose doc", titles)
        self.assertNotIn("In category", titles)
