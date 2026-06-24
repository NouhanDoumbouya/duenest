"""Chunk-level RAG: retrieval, AI integration (metering/budget), and endpoints.

Hermetic — the Anthropic + Voyage calls are always mocked; no real API calls.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai import client as ai_client
from apps.ai.client import AIResult
from apps.ai.models import AiPreference, AiUsage
from apps.documents import ai_qa
from apps.documents.ai_chunking import hash_text
from apps.documents.models import Document, DocumentChunk

User = get_user_model()

_CONFIGURED = dict(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
    AI_USAGE_METERING_ENABLED=True,
    AI_BUDGET_GUARD_ENABLED=True,
    AI_DAILY_TOKEN_CAP_USER=1_000_000,
    AI_DAILY_TOKEN_CAP_GLOBAL=1_000_000,
)


def _flags(value: bool):
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=value)


def _chunk(user, doc, idx, text, vector=None):
    return DocumentChunk.objects.create(
        owner=user,
        document=doc,
        chunk_index=idx,
        text=text,
        text_hash=hash_text(text),
        source_title=doc.title,
        embedding_vector=vector,
    )


def _fake_anthropic_json(payload: dict):
    """A fake anthropic module returning ``payload`` as JSON text."""
    response = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=json.dumps(payload))],
        stop_reason="end_turn",
        model="claude-opus-4-8",
        id="msg_test",
        usage=SimpleNamespace(input_tokens=42, output_tokens=12),
    )
    create = mock.Mock(return_value=response)
    instance = SimpleNamespace(messages=SimpleNamespace(create=create))
    return SimpleNamespace(Anthropic=mock.Mock(return_value=instance)), create


# --------------------------------------------------------------------------- #
# Retrieval
# --------------------------------------------------------------------------- #
class ChunkRetrievalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Passport")

    def test_owner_cannot_retrieve_another_users_chunks(self):
        _chunk(self.user, self.doc, 0, "secret passport number 12345")
        intruder = User.objects.create_user(
            username="i", email="i@x.com", password="StrongPassword123!DN"
        )
        out = ai_qa.retrieve_chunk_context(intruder, "passport")
        self.assertEqual(out["items"], [])
        self.assertEqual(out["mode"], "document_fallback")

    def test_lexical_retrieval_returns_relevant_chunk(self):
        _chunk(self.user, self.doc, 0, "The cat sat on the mat in the garden")
        _chunk(self.user, self.doc, 1, "Passport expiry date is 2030-01-01")
        out = ai_qa.retrieve_chunk_context(self.user, "passport expiry date")
        self.assertEqual(out["mode"], "chunk_lexical")
        self.assertIn("Passport expiry", out["items"][0]["excerpt"])

    def test_vector_retrieval_uses_embeddings(self):
        _chunk(self.user, self.doc, 0, "alpha content", vector=[1.0, 0.0])
        _chunk(self.user, self.doc, 1, "beta content", vector=[0.0, 1.0])
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=[0.9, 0.1]):
            out = ai_qa.retrieve_chunk_context(self.user, "anything")
        self.assertEqual(out["mode"], "chunk_vector")
        self.assertIn("alpha", out["items"][0]["excerpt"])  # nearest vector

    def test_falls_back_to_lexical_when_query_embed_fails(self):
        _chunk(self.user, self.doc, 0, "alpha content", vector=[1.0, 0.0])
        with mock.patch(
            "apps.ai.embeddings.embeddings_available", return_value=True
        ), mock.patch("apps.ai.embeddings.embed_query", return_value=None):
            out = ai_qa.retrieve_chunk_context(self.user, "alpha")
        self.assertEqual(out["mode"], "chunk_lexical")

    def test_no_chunks_signals_document_fallback(self):
        out = ai_qa.retrieve_chunk_context(self.user, "anything")
        self.assertEqual(out["mode"], "document_fallback")
        self.assertFalse(out["indexed"])

    @override_settings(AI_RAG_TOP_K=10, AI_RAG_MAX_CONTEXT_CHARS=50)
    def test_context_is_capped(self):
        for i in range(5):
            _chunk(self.user, self.doc, i, "X" * 40)
        out = ai_qa.retrieve_chunk_context(self.user, "x")
        total = sum(len(it["excerpt"]) for it in out["items"])
        self.assertLessEqual(total, 50)

    def test_sources_include_title_index_excerpt(self):
        _chunk(self.user, self.doc, 0, "Passport expiry date is 2030-01-01")
        retrieval = ai_qa.retrieve_chunk_context(self.user, "expiry")
        payload = {"answer": "2030-01-01", "answered": True, "cited_chunk_indexes": [1]}
        with mock.patch.object(
            ai_qa, "generate", return_value=AIResult(ok=True, data=payload, reason="ok")
        ):
            out = ai_qa._answer_from_chunks(self.user, "expiry", retrieval)
        self.assertTrue(out["available"])
        src = out["sources"][0]
        self.assertEqual(src["document_title"], "Passport")
        self.assertEqual(src["chunk_index"], 0)
        self.assertIn("2030", src["excerpt"])


@override_settings(**_CONFIGURED)
class AnswerRoutingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="r", email="r@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(
            owner=self.user, title="Passport", document_type="passport"
        )

    def test_uses_chunks_when_indexed(self):
        _chunk(self.user, self.doc, 0, "Passport expires 2030-01-01")
        payload = {"answer": "2030-01-01", "answered": True, "cited_chunk_indexes": [1]}
        with mock.patch.object(
            ai_qa, "generate", return_value=AIResult(ok=True, data=payload, reason="ok")
        ) as gen:
            out = ai_qa.answer_question(self.user, "passport expiry")
        self.assertIn(out["retrieval_mode"], {"chunk_lexical", "chunk_vector"})
        self.assertTrue(out["sources"])
        # passed through the client with user + feature for metering
        _, kwargs = gen.call_args
        self.assertEqual(kwargs["feature"], "document_qa")
        self.assertEqual(kwargs["user"], self.user)

    def test_falls_back_to_document_level_without_chunks(self):
        payload = {"answer": "metadata answer", "answered": True,
                   "cited_document_indexes": [1]}
        with mock.patch.object(
            ai_qa, "generate", return_value=AIResult(ok=True, data=payload, reason="ok")
        ):
            out = ai_qa.answer_question(self.user, "passport")
        self.assertEqual(out["retrieval_mode"], "document_fallback")
        self.assertFalse(out["indexed"])

    def test_insufficient_context_answer_is_safe(self):
        _chunk(self.user, self.doc, 0, "unrelated content about a bicycle")
        payload = {
            "answer": "I could not find enough information in the selected documents.",
            "answered": False,
            "cited_chunk_indexes": [],
        }
        with mock.patch.object(
            ai_qa, "generate", return_value=AIResult(ok=True, data=payload, reason="ok")
        ):
            out = ai_qa.answer_question(self.user, "what is my tax number")
        self.assertFalse(out["answered"])
        self.assertIn("could not find enough", out["answer"])


# --------------------------------------------------------------------------- #
# AI integration: real client chokepoint, metering + budget guard
# --------------------------------------------------------------------------- #
@override_settings(**_CONFIGURED)
class ChunkQAClientIntegrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="c", email="c@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Passport")
        _chunk(self.user, self.doc, 0, "Passport expiry date is 2030-01-01")

    def test_qa_records_aiusage_via_client(self):
        module, create = _fake_anthropic_json(
            {"answer": "2030-01-01", "answered": True, "cited_chunk_indexes": [1]}
        )
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            out = ai_qa.answer_question(self.user, "passport expiry")
        self.assertTrue(out["available"])
        rows = AiUsage.objects.filter(feature="document_qa")
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertEqual(row.status, "success")
        self.assertEqual(row.input_tokens, 42)
        self.assertEqual(row.user, self.user)

    def test_no_raw_prompt_or_response_stored_in_usage(self):
        module, _ = _fake_anthropic_json(
            {"answer": "2030-01-01", "answered": True, "cited_chunk_indexes": [1]}
        )
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            ai_qa.answer_question(self.user, "passport expiry")
        row = AiUsage.objects.get(feature="document_qa")
        blob = f"{row.feature}{row.model}{row.reason}{row.metadata}"
        self.assertNotIn("2030-01-01", blob)  # no response
        self.assertNotIn("passport expiry", blob)  # no prompt/question
        self.assertNotIn("Passport expiry date", blob)  # no chunk text

    @override_settings(AI_DAILY_TOKEN_CAP_USER=0)
    def test_budget_guard_blocks_before_anthropic(self):
        with mock.patch.object(ai_client, "_load_anthropic") as load:
            out = ai_qa.answer_question(self.user, "passport expiry")
        load.assert_not_called()  # never reached the provider
        self.assertEqual(out["reason"], "budget")
        self.assertEqual(AiUsage.objects.filter(status="blocked").count(), 1)


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
class IndexEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="api", email="api@x.com", password="StrongPassword123!DN"
        )
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.doc = Document.objects.create(owner=self.user, title="Passport")

    def _url(self, pk):
        return reverse("document-ai-index", args=[pk])

    def test_requires_auth(self):
        resp = self.client.post(self._url(self.doc.id), {}, format="json")
        self.assertIn(resp.status_code, (401, 403))

    def test_enforces_ownership(self):
        other = User.objects.create_user(
            username="other", email="other@x.com", password="StrongPassword123!DN"
        )
        other_doc = Document.objects.create(owner=other, title="Theirs")
        self.client.force_authenticate(self.user)
        with _flags(True):
            resp = self.client.post(self._url(other_doc.id), {}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_returns_chunk_count_status(self):
        self.client.force_authenticate(self.user)
        with _flags(True), mock.patch(
            "apps.documents.ai_indexing.get_document_text_for_ai",
            return_value="Passport body text " * 20,
        ):
            resp = self.client.post(self._url(self.doc.id), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "indexed")
        self.assertGreater(resp.data["chunks_created"], 0)

    def test_index_status_endpoint(self):
        _chunk(self.user, self.doc, 0, "body")
        self.client.force_authenticate(self.user)
        url = reverse("document-ai-index-status", args=[self.doc.id])
        with _flags(True):
            resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["indexed"])
        self.assertEqual(resp.data["chunk_count"], 1)


class QAEndpointSourcesTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="q", email="q@x.com", password="StrongPassword123!DN"
        )
        # Whole-vault Q&A is multi-document (Pro-only); grant Pro so the endpoint
        # path under test isn't blocked by the AI plan gate.
        from apps.billing.models import Plan, UserSubscription

        UserSubscription.objects.create(
            user=self.user, plan=Plan.objects.get(key="pro"),
            provider="manual", status="active", billing_interval="month",
        )
        AiPreference.objects.create(user=self.user, ai_enabled=True)
        self.client.force_authenticate(self.user)
        self.url = reverse("document-ask")

    def test_qa_returns_sources_without_signed_urls(self):
        payload = {
            "available": True,
            "reason": "ok",
            "answer": "2030-01-01",
            "answered": True,
            "citations": [],
            "sources": [
                {
                    "document_id": 1,
                    "document_title": "Passport",
                    "chunk_index": 0,
                    "page_number": None,
                    "excerpt": "Passport expiry date is 2030-01-01",
                }
            ],
            "retrieval_mode": "chunk_lexical",
            "indexed": True,
            "document_count": 1,
        }
        with _flags(True), mock.patch(
            "apps.documents.ai_qa.answer_question", return_value=payload
        ):
            resp = self.client.post(self.url, {"question": "expiry?"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["sources"])
        self.assertEqual(resp.data["retrieval_mode"], "chunk_lexical")
        # no raw signed file URLs leak into the source output
        self.assertNotIn("http", json.dumps(resp.data["sources"]))
