"""
Tests for the plan limits foundation: the usage endpoint, free-tier
enforcement on create paths, owner isolation, and the unlimited pro placeholder.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users import plans

from .models import Document, DocumentBundle, EmergencyAccessPack

User = get_user_model()

USAGE_URL = "/api/v1/plan/usage/"
DOCUMENTS_URL = "/api/v1/documents/"
BUNDLES_URL = "/api/v1/document-bundles/"
PACKS_URL = "/api/v1/emergency-packs/"


class PlanUsageTests(APITestCase):
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

    # --- Usage endpoint -----------------------------------------------------

    def test_usage_requires_authentication(self):
        response = self.client.get(USAGE_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usage_defaults_to_free_plan(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(USAGE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["plan"], plans.PLAN_FREE)
        self.assertTrue(response.data["is_free"])
        documents = response.data["resources"][plans.RESOURCE_DOCUMENTS]
        self.assertEqual(documents["used"], 0)
        self.assertEqual(documents["limit"], plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_DOCUMENTS))

    def test_usage_counts_are_owner_scoped(self):
        Document.objects.create(owner=self.bob, title="Bob doc")
        self.client.force_authenticate(self.alice)
        response = self.client.get(USAGE_URL)
        self.assertEqual(
            response.data["resources"][plans.RESOURCE_DOCUMENTS]["used"], 0
        )

    def test_usage_reflects_created_documents(self):
        Document.objects.create(owner=self.alice, title="Doc 1")
        Document.objects.create(owner=self.alice, title="Doc 2")
        # A trashed document should not count toward usage.
        Document.objects.create(owner=self.alice, title="Trashed", is_trashed=True)
        self.client.force_authenticate(self.alice)
        response = self.client.get(USAGE_URL)
        documents = response.data["resources"][plans.RESOURCE_DOCUMENTS]
        self.assertEqual(documents["used"], 2)

    # --- Free-tier enforcement ----------------------------------------------

    def test_document_limit_enforced_on_create(self):
        limit = plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_DOCUMENTS)
        for i in range(limit):
            Document.objects.create(owner=self.alice, title=f"Doc {i}")
        self.client.force_authenticate(self.alice)
        response = self.client.post(DOCUMENTS_URL, {"title": "One too many"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "plan_limit_exceeded")
        self.assertEqual(response.data["resource"], plans.RESOURCE_DOCUMENTS)
        # Nothing extra was written.
        self.assertEqual(
            Document.objects.filter(owner=self.alice).count(), limit
        )

    def test_bundle_limit_enforced_on_create(self):
        limit = plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_BUNDLES)
        for i in range(limit):
            DocumentBundle.objects.create(owner=self.alice, title=f"Bundle {i}")
        self.client.force_authenticate(self.alice)
        response = self.client.post(BUNDLES_URL, {"title": "Over limit"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["resource"], plans.RESOURCE_BUNDLES)

    def test_emergency_pack_limit_enforced_on_create(self):
        limit = plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_EMERGENCY_PACKS)
        for i in range(limit):
            EmergencyAccessPack.objects.create(owner=self.alice, title=f"Pack {i}")
        self.client.force_authenticate(self.alice)
        response = self.client.post(PACKS_URL, {"title": "Over limit"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["resource"], plans.RESOURCE_EMERGENCY_PACKS)

    def test_one_user_limit_does_not_block_another(self):
        limit = plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_DOCUMENTS)
        for i in range(limit):
            Document.objects.create(owner=self.alice, title=f"Doc {i}")
        # Bob is unaffected by Alice's usage.
        self.client.force_authenticate(self.bob)
        response = self.client.post(DOCUMENTS_URL, {"title": "Bob's first"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # --- Pro placeholder is unlimited ---------------------------------------

    def test_pro_placeholder_lifts_free_limits(self):
        # Pro keeps a high document cap (1,000) and stays unlimited elsewhere
        # (e.g. bundles), so creating past the Free document limit still succeeds.
        self.alice.plan = plans.PLAN_PRO_PLACEHOLDER
        self.alice.save(update_fields=["plan"])
        free_limit = plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_DOCUMENTS)
        for i in range(free_limit):
            Document.objects.create(owner=self.alice, title=f"Doc {i}")
        self.client.force_authenticate(self.alice)
        response = self.client.post(DOCUMENTS_URL, {"title": "Beyond free limit"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        usage = self.client.get(USAGE_URL)
        self.assertEqual(usage.data["plan"], plans.PLAN_PRO_PLACEHOLDER)
        # Documents are capped high (not unlimited); bundles stay unlimited.
        self.assertEqual(
            usage.data["resources"][plans.RESOURCE_DOCUMENTS]["limit"], 1000
        )
        self.assertTrue(
            usage.data["resources"][plans.RESOURCE_BUNDLES]["unlimited"]
        )

    def test_me_endpoint_exposes_plan(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["plan"], plans.PLAN_FREE)
