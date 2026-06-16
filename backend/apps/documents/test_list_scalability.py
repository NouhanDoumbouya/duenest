"""
Regression tests for the scalable document list (infrastructure sprint).

These lock in two things:
  1. Filtering/sorting correctness is preserved after moving the health filters
     into the database (PERF-001 fix).
  2. The list no longer materializes the whole vault before paginating — query
     time/rows stay bounded by page size, not total document count. We assert
     this via the number of rows the response serializes (one page) and a
     stable query count regardless of vault size.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

User = get_user_model()
URL = "/api/v1/documents/"


class DocumentListScalabilityTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPass123!List"
        )
        self.today = timezone.localdate()

    def _make(self, n, **kwargs):
        Document.objects.bulk_create(
            [Document(owner=self.alice, title=f"Doc {i}", **kwargs) for i in range(n)]
        )

    def test_list_paginates_at_db_level_not_full_vault(self):
        # Create more than one page worth of documents.
        self._make(45, expiry_date=self.today + timedelta(days=200))
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Full count is reported, but only one page (<=20) is serialized.
        self.assertEqual(res.data["count"], 45)
        self.assertLessEqual(len(res.data["results"]), 20)

    def test_query_count_is_stable_regardless_of_vault_size(self):
        """The list's query count must not grow with the number of documents.

        Before the fix, the whole vault was loaded + health-computed in Python;
        now it paginates at the DB, so a 10-doc and a 210-doc vault issue the
        same number of queries for one page.
        """
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.client.force_authenticate(self.alice)
        self._make(10, expiry_date=self.today + timedelta(days=200))
        with CaptureQueriesContext(connection) as small:
            self.client.get(URL)
        small_n = len(small.captured_queries)

        self._make(200, expiry_date=self.today + timedelta(days=200))
        with CaptureQueriesContext(connection) as large:
            self.client.get(URL)
        large_n = len(large.captured_queries)

        self.assertEqual(small_n, large_n)

    def test_needs_attention_filter_matches_health(self):
        # Expired docs need attention; archived docs never do (archived wins in
        # the status priority, so they are excluded even without a file).
        self._make(3, expiry_date=self.today - timedelta(days=5))  # expired
        self._make(
            4,
            expiry_date=self.today + timedelta(days=300),
            status=Document.Status.ARCHIVED,
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL, {"needs_attention": "true"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 3)
        for row in res.data["results"]:
            self.assertTrue(row["needs_attention"])

    def test_computed_status_filter_expired(self):
        self._make(2, expiry_date=self.today - timedelta(days=1))
        self._make(5, expiry_date=self.today + timedelta(days=300))
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL, {"computed_status": "expired"})
        self.assertEqual(res.data["count"], 2)
        self.assertTrue(all(r["computed_status"] == "expired" for r in res.data["results"]))

    def test_missing_file_filter(self):
        self._make(6, expiry_date=self.today + timedelta(days=300))
        self.client.force_authenticate(self.alice)
        # All seeded docs have no files → all "missing_file" via file_count=0.
        res = self.client.get(URL, {"missing_file": "true"})
        self.assertEqual(res.data["count"], 6)

    def test_pinned_floats_to_top(self):
        self._make(3, expiry_date=self.today + timedelta(days=300))
        Document.objects.create(
            owner=self.alice,
            title="Pinned doc",
            is_pinned=True,
            expiry_date=self.today + timedelta(days=300),
        )
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL)
        self.assertEqual(res.data["results"][0]["title"], "Pinned doc")

    def test_owner_scoping_preserved(self):
        bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="StrongPass123!List"
        )
        Document.objects.create(owner=bob, title="Bob doc")
        self._make(2, expiry_date=self.today + timedelta(days=300))
        self.client.force_authenticate(self.alice)
        res = self.client.get(URL)
        self.assertEqual(res.data["count"], 2)  # never sees Bob's doc
