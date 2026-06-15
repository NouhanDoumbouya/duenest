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
