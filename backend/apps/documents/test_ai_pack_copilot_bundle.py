"""Tests for turning a Pack Copilot analysis into a real bundle."""

from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from unittest import mock

from apps.documents.ai_pack_copilot import create_bundle_from_copilot
from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
)

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
)


def _flags(value: bool):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


class CreateBundleServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        cls.passport = Document.objects.create(
            owner=cls.user, title="UK Passport", document_type="passport"
        )

    def test_creates_bundle_with_linked_and_missing_requirements(self):
        bundle = create_bundle_from_copilot(
            self.user,
            goal="UK Skilled Worker visa",
            deadline="2026-09-01",
            requirements=[
                {"name": "Valid passport", "description": "x", "document_ids": [self.passport.id]},
                {"name": "Bank statements", "description": "y", "document_ids": []},
            ],
        )
        self.assertEqual(bundle.owner, self.user)
        self.assertEqual(bundle.title, "UK Skilled Worker visa")
        self.assertEqual(bundle.bundle_type, DocumentBundle.BundleType.APPLICATION)
        self.assertEqual(bundle.target_date, date(2026, 9, 1))

        reqs = list(bundle.requirements.order_by("sort_order"))
        self.assertEqual(len(reqs), 2)
        self.assertEqual(reqs[0].linked_document_id, self.passport.id)
        self.assertEqual(reqs[0].status, DocumentBundleRequirement.Status.ATTACHED)
        self.assertIsNone(reqs[1].linked_document_id)
        self.assertEqual(reqs[1].status, DocumentBundleRequirement.Status.MISSING)

    def test_foreign_document_ids_are_rejected(self):
        other = User.objects.create_user(
            username="intruder", email="i@x.com", password="StrongPassword123!DN"
        )
        secret = Document.objects.create(owner=other, title="Secret Other Doc")
        bundle = create_bundle_from_copilot(
            self.user,
            goal="goal",
            requirements=[{"name": "Req", "description": "", "document_ids": [secret.id]}],
        )
        req = bundle.requirements.first()
        # the other user's document must NOT be linked
        self.assertIsNone(req.linked_document_id)
        self.assertEqual(req.status, DocumentBundleRequirement.Status.MISSING)

    def test_blank_requirement_names_skipped(self):
        bundle = create_bundle_from_copilot(
            self.user,
            goal="goal",
            requirements=[{"name": "  ", "description": "x"}, {"name": "Real", "description": "y"}],
        )
        self.assertEqual(bundle.requirements.count(), 1)


@override_settings(**_CONFIGURED)
class CreateBundleEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("document-pack-copilot-create-bundle")

    def test_flag_off_returns_503(self):
        resp = self.client.post(self.url, {"goal": "x", "requirements": []}, format="json")
        self.assertEqual(resp.status_code, 503)

    def test_missing_goal_is_400(self):
        with _flags(True):
            resp = self.client.post(self.url, {"goal": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_creates_and_returns_bundle_id(self):
        doc = Document.objects.create(owner=self.user, title="UK Passport")
        with _flags(True):
            resp = self.client.post(
                self.url,
                {
                    "goal": "UK visa",
                    "deadline": "2026-09-01",
                    "requirements": [
                        {"name": "Passport", "description": "", "document_ids": [doc.id]},
                        {"name": "Statements", "description": "", "document_ids": []},
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("bundle_id", resp.data)
        bundle = DocumentBundle.objects.get(id=resp.data["bundle_id"])
        self.assertEqual(bundle.owner, self.user)
        self.assertEqual(bundle.requirements.count(), 2)
