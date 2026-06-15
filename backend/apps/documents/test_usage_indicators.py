"""Tests for document usage indicators (in_bundle / in_emergency) in the API."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
)

User = get_user_model()


class DocumentUsageIndicatorTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPass123!Use"
        )
        self.doc = Document.objects.create(owner=self.alice, title="Passport")
        self.client.force_authenticate(self.alice)

    def _get(self):
        res = self.client.get(f"/api/v1/documents/{self.doc.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res.data

    def test_defaults_false(self):
        data = self._get()
        self.assertFalse(data["in_bundle"])
        self.assertFalse(data["in_emergency"])

    def test_in_bundle_true_when_linked(self):
        bundle = DocumentBundle.objects.create(owner=self.alice, title="Visa application")
        DocumentBundleRequirement.objects.create(
            owner=self.alice,
            bundle=bundle,
            title="Passport requirement",
            linked_document=self.doc,
        )
        self.assertTrue(self._get()["in_bundle"])

    def test_in_emergency_true_when_in_pack(self):
        pack = EmergencyAccessPack.objects.create(owner=self.alice, title="Emergency")
        EmergencyAccessPackItem.objects.create(
            owner=self.alice, pack=pack, document=self.doc
        )
        self.assertTrue(self._get()["in_emergency"])

    def test_list_endpoint_includes_indicators(self):
        res = self.client.get("/api/v1/documents/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = res.data["results"][0]
        self.assertIn("in_bundle", row)
        self.assertIn("in_emergency", row)

    def test_in_bundle_filter(self):
        # self.doc is unbundled; add a second doc that is in a bundle.
        bundled = Document.objects.create(owner=self.alice, title="Bundled doc")
        bundle = DocumentBundle.objects.create(owner=self.alice, title="Visa app")
        DocumentBundleRequirement.objects.create(
            owner=self.alice, bundle=bundle, title="req", linked_document=bundled
        )

        in_res = self.client.get("/api/v1/documents/?in_bundle=true")
        in_titles = {d["title"] for d in in_res.data["results"]}
        self.assertIn("Bundled doc", in_titles)
        self.assertNotIn("Passport", in_titles)

        out_res = self.client.get("/api/v1/documents/?in_bundle=false")
        out_titles = {d["title"] for d in out_res.data["results"]}
        self.assertIn("Passport", out_titles)
        self.assertNotIn("Bundled doc", out_titles)

    def test_shared_filter_smoke(self):
        # No active shares -> ?shared=true returns nothing, ?shared=false returns all.
        shared = self.client.get("/api/v1/documents/?shared=true")
        self.assertEqual(shared.status_code, status.HTTP_200_OK)
        self.assertEqual(shared.data["count"], 0)
        unshared = self.client.get("/api/v1/documents/?shared=false")
        self.assertGreaterEqual(unshared.data["count"], 1)

    def test_pin_toggle_filter_and_ordering(self):
        Document.objects.create(owner=self.alice, title="Aardvark")  # sorts first by title
        pinned = Document.objects.create(owner=self.alice, title="Zebra")
        # Pin via PATCH.
        patch = self.client.patch(
            f"/api/v1/documents/{pinned.id}/", {"is_pinned": True}, format="json"
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertTrue(patch.data["is_pinned"])

        # ?pinned=true returns only the pinned doc.
        only_pinned = self.client.get("/api/v1/documents/?pinned=true")
        titles = [d["title"] for d in only_pinned.data["results"]]
        self.assertEqual(titles, ["Zebra"])

        # Pinned floats to the top even when sorting by title ascending.
        ordered = self.client.get("/api/v1/documents/?ordering=title")
        self.assertEqual(ordered.data["results"][0]["title"], "Zebra")
