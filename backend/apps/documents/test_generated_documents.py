"""Tests for the Generated Documents (drafts library) MVP."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import DocumentBundle, GeneratedDocument

User = get_user_model()

LIST = "/api/v1/generated-documents/"


class GeneratedDocumentTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="a@example.com", password="StrongPassword123!DN"
        )
        self.bob = User.objects.create_user(
            username="bob", email="b@example.com", password="StrongPassword123!DN"
        )
        self.alice_pack = DocumentBundle.objects.create(
            owner=self.alice, title="Scholarship pack"
        )
        self.bob_pack = DocumentBundle.objects.create(
            owner=self.bob, title="Bob's pack"
        )

    def _payload(self, **over):
        base = {
            "title": "Motivation letter",
            "document_type": "motivation_letter",
            "output_text": "Dear committee, [your name] applies…",
            "input_payload": {"instructions": "write a motivation letter", "tone": "formal"},
        }
        base.update(over)
        return base

    def test_save_draft(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(LIST, self._payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)
        body = res.json()
        self.assertEqual(body["status"], "draft")
        self.assertEqual(body["document_type"], "motivation_letter")
        obj = GeneratedDocument.objects.get(pk=body["id"])
        self.assertEqual(obj.owner, self.alice)

    def test_list_owner_scoped(self):
        GeneratedDocument.objects.create(owner=self.alice, title="A draft")
        GeneratedDocument.objects.create(owner=self.bob, title="Bob draft")
        self.client.force_authenticate(self.alice)
        res = self.client.get(LIST)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "A draft")

    def test_attach_to_own_pack(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            LIST, self._payload(related_pack=self.alice_pack.id), format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)
        self.assertEqual(res.json()["related_pack"], self.alice_pack.id)

    def test_cannot_attach_to_another_users_pack(self):
        self.client.force_authenticate(self.alice)
        res = self.client.post(
            LIST, self._payload(related_pack=self.bob_pack.id), format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(GeneratedDocument.objects.exists())

    def test_edit_and_mark_saved(self):
        draft = GeneratedDocument.objects.create(owner=self.alice, title="Draft")
        self.client.force_authenticate(self.alice)
        res = self.client.patch(
            f"{LIST}{draft.id}/",
            {"output_text": "Edited body", "status": "saved"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        draft.refresh_from_db()
        self.assertEqual(draft.output_text, "Edited body")
        self.assertEqual(draft.status, "saved")

    def test_delete(self):
        draft = GeneratedDocument.objects.create(owner=self.alice, title="Draft")
        self.client.force_authenticate(self.alice)
        res = self.client.delete(f"{LIST}{draft.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(GeneratedDocument.objects.filter(pk=draft.id).exists())

    def test_owner_isolation_on_detail(self):
        draft = GeneratedDocument.objects.create(owner=self.alice, title="Secret")
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(f"{LIST}{draft.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.delete(f"{LIST}{draft.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_filter_by_status_and_pack(self):
        GeneratedDocument.objects.create(owner=self.alice, title="d1", status="draft")
        GeneratedDocument.objects.create(owner=self.alice, title="s1", status="saved")
        GeneratedDocument.objects.create(
            owner=self.alice, title="p1", status="saved", related_pack=self.alice_pack
        )
        self.client.force_authenticate(self.alice)
        self.assertEqual(len(self.client.get(f"{LIST}?status=saved").json()), 2)
        self.assertEqual(
            len(self.client.get(f"{LIST}?related_pack={self.alice_pack.id}").json()), 1
        )

    def test_requires_authentication(self):
        res = self.client.post(LIST, self._payload(), format="json")
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
