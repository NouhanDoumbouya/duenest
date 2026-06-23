"""Chunk-level RAG indexing service tests (DB-backed; embeddings mocked)."""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.documents import ai_indexing
from apps.documents.ai_indexing import (
    delete_document_chunks,
    get_document_text_for_ai,
    get_index_status,
    index_document_for_rag,
)
from apps.documents.models import (
    Document,
    DocumentChunk,
    DocumentExtraction,
    DocumentFile,
)

User = get_user_model()

_RAG = dict(
    AI_RAG_CHUNK_SIZE=100,
    AI_RAG_CHUNK_OVERLAP=10,
    AI_RAG_MAX_CHUNKS_PER_DOCUMENT=40,
    AI_RAG_MAX_CHARS_PER_DOCUMENT=60000,
)


@override_settings(**_RAG)
class GetDocumentTextTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="t", email="t@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Passport")

    def _extraction(self, raw, status=DocumentExtraction.Status.COMPLETED):
        f = DocumentFile.objects.create(
            document=self.doc,
            uploaded_by=self.user,
            file=SimpleUploadedFile("p.pdf", b"%PDF-1.4 data"),
            original_filename="p.pdf",
        )
        return DocumentExtraction.objects.create(
            owner=self.user, document=self.doc, file=f,
            extraction_status=status, raw_text=raw,
        )

    def test_prefers_completed_extraction_raw_text(self):
        self._extraction("Passport No X1234567 expires 2030-01-01")
        text = get_document_text_for_ai(self.doc)
        self.assertIn("X1234567", text)

    def test_ignores_non_completed_extractions(self):
        self._extraction("draft text", status=DocumentExtraction.Status.PROCESSING)
        self.doc.notes = "Fallback notes here"
        self.doc.save()
        text = get_document_text_for_ai(self.doc)
        self.assertIn("Fallback notes", text)
        self.assertNotIn("draft text", text)

    def test_falls_back_to_notes_then_metadata(self):
        self.assertIn("Passport", get_document_text_for_ai(self.doc))  # title metadata
        self.doc.notes = "Stored in the blue folder"
        self.doc.save()
        self.assertIn("blue folder", get_document_text_for_ai(self.doc))

    def test_no_text_when_nothing_available(self):
        blank = Document.objects.create(owner=self.user, title="")
        self.assertEqual(get_document_text_for_ai(blank), "")


@override_settings(**_RAG)
class IndexDocumentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Visa")

    def _patch_text(self, text):
        return mock.patch.object(
            ai_indexing, "get_document_text_for_ai", return_value=text
        )

    def test_indexing_creates_chunks(self):
        with self._patch_text("A" * 250):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["status"], "indexed")
        self.assertGreater(result["chunks_created"], 0)
        rows = DocumentChunk.objects.filter(document=self.doc)
        self.assertEqual(rows.count(), result["chunks_created"])
        self.assertTrue(all(r.owner_id == self.user.id for r in rows))

    def test_reindex_unchanged_does_not_duplicate(self):
        with self._patch_text("stable content " * 20):
            first = index_document_for_rag(self.doc, owner=self.user)
            count_after_first = DocumentChunk.objects.filter(document=self.doc).count()
            second = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(first["status"], "indexed")
        self.assertEqual(second["status"], "unchanged")
        self.assertEqual(second["chunks_created"], 0)
        self.assertEqual(
            DocumentChunk.objects.filter(document=self.doc).count(), count_after_first
        )

    def test_reindex_changed_text_replaces_chunks(self):
        with self._patch_text("original text " * 20):
            index_document_for_rag(self.doc, owner=self.user)
            old_hashes = set(
                DocumentChunk.objects.filter(document=self.doc).values_list(
                    "text_hash", flat=True
                )
            )
        with self._patch_text("completely different content " * 25):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["status"], "indexed")
        new_hashes = set(
            DocumentChunk.objects.filter(document=self.doc).values_list(
                "text_hash", flat=True
            )
        )
        self.assertFalse(old_hashes & new_hashes)  # fully replaced

    def test_no_text_is_skipped(self):
        with self._patch_text("   "):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["status"], "no_text")
        self.assertEqual(DocumentChunk.objects.filter(document=self.doc).count(), 0)

    def test_forbidden_when_owner_mismatch(self):
        other = User.objects.create_user(
            username="x", email="x@x.com", password="StrongPassword123!DN"
        )
        with self._patch_text("secret " * 30):
            result = index_document_for_rag(self.doc, owner=other)
        self.assertEqual(result["status"], "forbidden")
        self.assertEqual(DocumentChunk.objects.filter(document=self.doc).count(), 0)

    def test_embeddings_unavailable_still_creates_lexical_chunks(self):
        # Default: no embeddings key -> chunks stored without vectors.
        with self._patch_text("lexical body " * 20):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["embeddings"], "unavailable")
        self.assertFalse(result["embedded"])
        rows = DocumentChunk.objects.filter(document=self.doc)
        self.assertTrue(rows.exists())
        self.assertTrue(all(r.embedding_vector is None for r in rows))

    def test_embeddings_attached_when_configured(self):
        def fake_embed(texts):
            return [[0.1, 0.2, 0.3] for _ in texts]

        with self._patch_text("embed me " * 30), mock.patch.object(
            ai_indexing, "_embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_documents", side_effect=fake_embed):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["embeddings"], "ready")
        self.assertTrue(result["embedded"])
        rows = DocumentChunk.objects.filter(document=self.doc)
        self.assertTrue(all(r.embedding_vector == [0.1, 0.2, 0.3] for r in rows))

    def test_embedding_failure_does_not_crash_keeps_lexical(self):
        with self._patch_text("body " * 30), mock.patch.object(
            ai_indexing, "_embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_documents", return_value=None):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["embeddings"], "failed")
        self.assertFalse(result["embedded"])
        rows = DocumentChunk.objects.filter(document=self.doc)
        self.assertTrue(rows.exists())
        self.assertTrue(
            all(r.status == DocumentChunk.Status.EMBEDDING_FAILED for r in rows)
        )
        # text is retained for lexical fallback
        self.assertTrue(all(r.text for r in rows))

    def test_embedding_raising_is_handled(self):
        with self._patch_text("body " * 30), mock.patch.object(
            ai_indexing, "_embeddings_available", return_value=True
        ), mock.patch(
            "apps.ai.embeddings.embed_documents", side_effect=RuntimeError("boom")
        ):
            result = index_document_for_rag(self.doc, owner=self.user)
        self.assertEqual(result["embeddings"], "failed")
        self.assertTrue(DocumentChunk.objects.filter(document=self.doc).exists())

    def test_delete_and_status(self):
        with self._patch_text("content " * 20):
            index_document_for_rag(self.doc, owner=self.user)
        status = get_index_status(self.doc)
        self.assertTrue(status["indexed"])
        self.assertGreater(status["chunk_count"], 0)
        removed = delete_document_chunks(self.doc)
        self.assertGreater(removed, 0)
        self.assertFalse(get_index_status(self.doc)["indexed"])
