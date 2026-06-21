"""Tests for content-level RAG: semantic ranking + the backfill command."""

from __future__ import annotations

from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.documents import ai_qa
from apps.documents.models import Document, DocumentEmbedding

User = get_user_model()


class SemanticRankTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        cls.passport = Document.objects.create(owner=cls.user, title="Passport")
        cls.insurance = Document.objects.create(owner=cls.user, title="Insurance")
        DocumentEmbedding.objects.create(
            document=cls.passport, owner=cls.user, vector=[1.0, 0.0], model="voyage-3"
        )
        DocumentEmbedding.objects.create(
            document=cls.insurance, owner=cls.user, vector=[0.0, 1.0], model="voyage-3"
        )

    def test_falls_back_to_keyword_when_embeddings_off(self):
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=False
        ), mock.patch("apps.ai.embeddings.embed_query") as eq:
            ctx = ai_qa.gather_context(self.user, "insurance")
        eq.assert_not_called()
        # keyword ranking surfaces the document whose text matches "insurance"
        self.assertEqual(ctx[0]["title"], "Insurance")

    def test_semantic_ranking_orders_by_cosine(self):
        # Query vector aligned with the insurance embedding [0,1].
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=[0.0, 1.0]):
            ctx = ai_qa.gather_context(self.user, "anything")
        self.assertEqual(ctx[0]["title"], "Insurance")
        # And a passport-aligned query flips the order.
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=[1.0, 0.0]):
            ctx = ai_qa.gather_context(self.user, "anything")
        self.assertEqual(ctx[0]["title"], "Passport")

    def test_no_stored_vectors_falls_back(self):
        DocumentEmbedding.objects.all().delete()
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=[1.0, 0.0]):
            ctx = ai_qa.gather_context(self.user, "insurance")
        # No embeddings stored -> keyword ranking still works
        self.assertEqual(ctx[0]["title"], "Insurance")

    def test_query_embed_failure_falls_back(self):
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=None):
            ctx = ai_qa.gather_context(self.user, "insurance")
        self.assertEqual(ctx[0]["title"], "Insurance")


class BuildEmbeddingsCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="o@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Passport")

    @override_settings(EMBEDDINGS_CONFIGURED=False)
    def test_noop_when_unconfigured(self):
        with mock.patch("apps.ai.embeddings.embed_documents") as ed:
            out = StringIO()
            call_command("build_document_embeddings", stdout=out)
        ed.assert_not_called()
        self.assertIn("not configured", out.getvalue())

    @override_settings(EMBEDDINGS_CONFIGURED=True, EMBEDDINGS_MODEL="voyage-3")
    def test_builds_then_skips_unchanged(self):
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch(
            "apps.ai.embeddings.embed_documents", return_value=[[0.5, 0.5]]
        ) as ed:
            call_command("build_document_embeddings", stdout=StringIO())
        self.assertEqual(ed.call_count, 1)
        self.assertTrue(
            DocumentEmbedding.objects.filter(document=self.doc).exists()
        )

        # Rerun: snippet unchanged -> nothing to embed.
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_documents") as ed2:
            out = StringIO()
            call_command("build_document_embeddings", stdout=out)
        ed2.assert_not_called()
        self.assertIn("embedded=0", out.getvalue())
