"""Regression: the document version-history list must be a plain array.

Like reminder rules, the frontend consumes `/documents/<id>/versions/` as a bare
array. With the project's global default pagination, a `ListAPIView` that doesn't
opt out returns `{count, results}` and breaks the Versions tab — even when empty.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

User = get_user_model()


class DocumentVersionListShapeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        self.document = Document.objects.create(owner=self.user, title="Passport")

    def test_versions_list_is_a_plain_array_not_paginated(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(f"/api/v1/documents/{self.document.id}/versions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Bare list even when empty — never the paginated {count, results} envelope.
        self.assertIsInstance(res.data, list)
        self.assertEqual(res.data, [])
