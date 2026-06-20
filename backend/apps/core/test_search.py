"""Tests for the unified command-palette search endpoint."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document
from apps.features.models import FeatureFlag, Visibility
from apps.organizations.models import Organization, OrganizationMembership
from apps.subscriptions.models import Subscription

User = get_user_model()

SEARCH_URL = "/api/v1/search/"


class WorkspaceSearchTests(APITestCase):
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

    def _types(self, results):
        return {(item["type"], item["title"]) for item in results}

    def test_requires_authentication(self):
        response = self.client.get(SEARCH_URL, {"q": "passport"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_blank_query_returns_empty(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "   "})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_finds_documents_subscriptions_and_organizations(self):
        # Subscription Radar is deprecated; search only includes legacy
        # subscription rows when a founder re-enables the feature.
        FeatureFlag.objects.update_or_create(
            key="subscriptions", defaults={"visibility": Visibility.ENABLED}
        )
        Document.objects.create(owner=self.alice, title="UK Passport")
        sub = Subscription.objects.create(
            owner=self.alice,
            name="Passport renewal service",
            amount=Decimal("9.99"),
            currency="GBP",
        )
        org = Organization.objects.create(name="Passport Club", created_by=self.alice)
        OrganizationMembership.objects.create(
            organization=org,
            user=self.alice,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )

        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "passport"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        found = self._types(response.data["results"])
        self.assertIn(("document", "UK Passport"), found)
        self.assertIn(("subscription", sub.name), found)
        self.assertIn(("organization", "Passport Club"), found)
        for item in response.data["results"]:
            self.assertTrue(item["url"].startswith("/dashboard/"))

    def test_results_are_owner_scoped(self):
        Document.objects.create(owner=self.bob, title="Bob Passport")
        Subscription.objects.create(
            owner=self.bob,
            name="Bob Passport sub",
            amount=Decimal("1.00"),
            currency="USD",
        )
        org = Organization.objects.create(name="Bob Passport Org", created_by=self.bob)
        OrganizationMembership.objects.create(
            organization=org,
            user=self.bob,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )

        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "passport"})
        self.assertEqual(response.data["results"], [])

    def test_excludes_trashed_documents_and_archived_subscriptions(self):
        Document.objects.create(
            owner=self.alice, title="Trashed Passport", is_trashed=True
        )
        Subscription.objects.create(
            owner=self.alice,
            name="Archived Passport sub",
            amount=Decimal("1.00"),
            currency="USD",
            is_archived=True,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "passport"})
        self.assertEqual(response.data["results"], [])

    def test_deprecated_subscriptions_excluded_by_default(self):
        # With the default (disabled) flag, legacy subscription rows must not
        # appear in search even though documents/orgs still do.
        Document.objects.create(owner=self.alice, title="UK Passport")
        Subscription.objects.create(
            owner=self.alice,
            name="Passport renewal service",
            amount=Decimal("9.99"),
            currency="GBP",
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "passport"})
        types = {item["type"] for item in response.data["results"]}
        self.assertIn("document", types)
        self.assertNotIn("subscription", types)

    def test_matches_secondary_document_fields(self):
        Document.objects.create(
            owner=self.alice, title="My ID", issuer="Home Office"
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(SEARCH_URL, {"q": "home office"})
        titles = [item["title"] for item in response.data["results"]]
        self.assertIn("My ID", titles)
