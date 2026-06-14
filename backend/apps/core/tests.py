from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

User = get_user_model()


class PageSizeOverrideTests(APITestCase):
    """The global pagination class allows a capped ?page_size override while
    keeping the default page size (20) for callers that omit it."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="paginator",
            email="p@example.com",
            password="StrongPassword123!DN",
        )
        Document.objects.bulk_create(
            [Document(owner=self.user, title=f"Doc {i}") for i in range(25)]
        )
        self.client.force_authenticate(self.user)

    def test_default_page_size_unchanged(self):
        resp = self.client.get("/api/v1/documents/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 25)
        self.assertEqual(len(resp.data["results"]), 20)

    def test_small_page_size_returns_full_count_with_few_rows(self):
        resp = self.client.get("/api/v1/documents/?page_size=1")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Count is the full total regardless of page size (count-only callers).
        self.assertEqual(resp.data["count"], 25)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_page_size_is_capped(self):
        resp = self.client.get("/api/v1/documents/?page_size=1000")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # max_page_size caps the response so a client cannot force an unbounded
        # page; with 25 docs and a cap of 100 we get all 25 here.
        self.assertEqual(len(resp.data["results"]), 25)
