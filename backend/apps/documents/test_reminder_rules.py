"""Regression tests for the per-document reminder-rules list endpoint.

The frontend (`getDocumentReminderRules`) consumes this endpoint as a **plain
array**. The project sets a global default pagination, so a `ListAPIView` that
doesn't opt out would return the `{count, results}` envelope instead — which made
the reminder-rules UI crash ("not loading"). These tests lock the array contract.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

User = get_user_model()


class ReminderRuleListShapeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        self.document = Document.objects.create(
            owner=self.user,
            title="Passport",
            expiry_date=date.today() + timedelta(days=365),
        )

    def _url(self) -> str:
        return f"/api/v1/documents/{self.document.id}/reminder-rules/"

    def test_list_is_a_plain_array_not_paginated(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Must be a bare list, never the paginated {count, results} envelope.
        self.assertIsInstance(res.data, list)
        self.assertEqual(res.data, [])

    def test_created_rule_appears_in_the_array(self):
        self.client.force_authenticate(self.user)
        create = self.client.post(
            self._url(),
            {"trigger_type": "before_expiry", "days_before": 30},
            format="json",
        )
        self.assertIn(
            create.status_code,
            (status.HTTP_200_OK, status.HTTP_201_CREATED),
            create.data,
        )
        res = self.client.get(self._url())
        self.assertIsInstance(res.data, list)
        self.assertEqual(len(res.data), 1)
