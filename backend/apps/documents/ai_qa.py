"""
"Ask your documents" — grounded Q&A over the owner's own vault (KEY-GATED).

When ``settings.AI_CONFIGURED`` is true AND the per-user ``ai_features`` +
``ai_document_qa`` flags are on, the owner can ask a natural-language question
("when does my visa expire?", "what's my passport number?", "where is my birth
certificate stored?") and Claude answers **grounded only in that user's own
documents**, citing the documents it used.

Design notes:
  * **Owner-scoped.** Only the asking user's non-trashed documents are ever
    considered. Nothing about other users is reachable.
  * **Retrieval is an interface.** :func:`gather_context` is the single seam that
    selects which documents to ground on. v1 uses each document's *structured
    fields + notes* (compact, high-signal, no extra dependency) ranked by simple
    keyword overlap with the question. A future embeddings/pgvector retriever can
    replace the body of this function behind a second flag without touching the
    answer path or the endpoint.
  * **Grounded + honest.** Claude is told to answer only from the supplied
    documents and to say so when the answer isn't there. Citations map back to
    real document ids/titles.
  * **Graceful.** No key / flag off / refusal / malformed output all return a
    structured "not available" answer — never an exception.

Privacy: like AI extraction, this sends the relevant document text/fields to
Anthropic when enabled. Off by default, opt-in per user. See
``docs/architecture.md`` (AI foundation).
"""

from __future__ import annotations

import logging
import re

from apps.ai.client import ai_available, generate
from apps.ai.privacy import maybe_redact

logger = logging.getLogger(__name__)

# How many documents to ground on per question, after ranking. Bounds cost and
# keeps the prompt well inside the context window for typical vaults.
_MAX_DOCS = 40
_MAX_NOTES_CHARS = 400
_MAX_QUESTION_CHARS = 500
_MAX_TOKENS = 1024

_ANSWER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string"},
        "answered": {"type": "boolean"},
        "cited_document_indexes": {"type": "array", "items": {"type": "integer"}},
    },
}

_SYSTEM = (
    "You answer the user's question using ONLY the documents provided below, which "
    "are the user's own personal records. Never use outside knowledge and never "
    "guess. Each document is numbered; cite the documents you used by their number "
    "in 'cited_document_indexes'. If the answer is not present in the documents, "
    "set 'answered' to false and say you couldn't find it in their documents. Be "
    "concise and refer to documents by their title, not their number, in the "
    "answer text."
)


def qa_enabled(user) -> bool:
    """True when document Q&A is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_document_qa", user
    )


def _document_snippet(doc) -> str:
    """A compact, high-signal text block for one document."""
    parts: list[str] = [f"Title: {doc.title}"]
    fields = [
        ("Type", doc.document_type),
        ("Issuer", doc.issuer),
        ("Country", doc.country),
        ("Reference number", doc.reference_number),
        ("Issue date", doc.issue_date),
        ("Expiry date", doc.expiry_date),
        ("Renewal date", doc.renewal_date),
        ("Status", doc.status),
        ("Stored at", doc.physical_location_label),
    ]
    for label, value in fields:
        if value:
            parts.append(f"{label}: {value}")
    if doc.notes:
        parts.append(f"Notes: {doc.notes[:_MAX_NOTES_CHARS]}")
    return "\n".join(parts)


_WORD_RE = re.compile(r"[a-z0-9]{3,}")


def _rank(question: str, snippets: list[tuple]) -> list[tuple]:
    """Order (doc, snippet) pairs by keyword overlap with the question.

    A deliberately simple lexical ranker — the seam a real embeddings retriever
    would replace. Ties keep the original (recency) order via a stable sort.
    """
    terms = set(_WORD_RE.findall(question.lower()))
    if not terms:
        return snippets

    def score(pair) -> int:
        text = pair[1].lower()
        return sum(1 for t in terms if t in text)

    return sorted(snippets, key=score, reverse=True)


def gather_context(user, question: str, *, limit: int = _MAX_DOCS) -> list[dict]:
    """
    Select the documents to ground the answer on (the retrieval seam).

    Returns a list of ``{"index", "document_id", "title", "text"}`` — owner-scoped,
    ranked by relevance to ``question``, capped at ``limit``.
    """
    from .models import Document

    docs = list(
        Document.objects.filter(owner=user, is_trashed=False).order_by("-updated_at")[
            : max(limit * 3, limit)
        ]
    )
    snippets = [(doc, _document_snippet(doc)) for doc in docs]
    # Prefer semantic (embeddings) ranking when an embeddings key is configured
    # and documents are indexed; otherwise fall back to lexical keyword ranking.
    ranked = (_semantic_rank(question, snippets) or _rank(question, snippets))[:limit]
    return [
        {"index": i + 1, "document_id": doc.id, "title": doc.title, "text": text}
        for i, (doc, text) in enumerate(ranked)
    ]


def _semantic_rank(question: str, snippets: list[tuple]) -> list[tuple] | None:
    """Cosine-rank by stored document embeddings, or ``None`` to fall back.

    Returns ``None`` (caller uses keyword ranking) when embeddings aren't
    configured, the query can't be embedded, or no candidate document has a
    stored embedding yet. Documents without an embedding sort last.
    """
    from apps.ai.embeddings import (
        cosine_similarity,
        embed_query,
        embeddings_available,
    )

    if not embeddings_available() or not snippets:
        return None
    query_vector = embed_query(question)
    if not query_vector:
        return None

    from .models import DocumentEmbedding

    doc_ids = [doc.id for doc, _ in snippets]
    vectors = {
        e.document_id: e.vector
        for e in DocumentEmbedding.objects.filter(document_id__in=doc_ids)
    }
    if not vectors:
        return None  # nothing indexed yet — keyword ranking is the honest answer

    scored = [
        (
            cosine_similarity(query_vector, vectors[doc.id]) if doc.id in vectors else -1.0,
            doc,
            text,
        )
        for doc, text in snippets
    ]
    scored.sort(key=lambda t: t[0], reverse=True)
    return [(doc, text) for _score, doc, text in scored]


def answer_question(user, question: str) -> dict:
    """
    Answer ``question`` grounded in ``user``'s documents.

    Always returns a dict; never raises. Shape::

        {available, reason, answer, answered, citations, document_count}

    ``available`` is False (with a ``reason``) when AI isn't configured, there
    are no documents, or the model call failed.
    """
    question = (question or "").strip()[:_MAX_QUESTION_CHARS]
    base = {
        "available": False,
        "answer": "",
        "answered": False,
        "citations": [],
        "document_count": 0,
    }
    if not question:
        return {**base, "reason": "empty_question"}
    if not ai_available():
        return {**base, "reason": "not_configured"}

    context = gather_context(user, question)
    if not context:
        return {**base, "reason": "no_documents"}

    blocks = "\n\n".join(
        f"[{c['index']}] {c['text']}" for c in context
    )
    blocks = maybe_redact(user, blocks)
    prompt = (
        f"Question: {question}\n\n"
        f"--- THE USER'S DOCUMENTS ---\n{blocks}"
    )
    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_ANSWER_SCHEMA,
        max_tokens=_MAX_TOKENS,
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error", "document_count": len(context)}

    data = result.data
    by_index = {c["index"]: c for c in context}
    citations = []
    seen: set[int] = set()
    for idx in data.get("cited_document_indexes") or []:
        c = by_index.get(idx)
        if c and c["document_id"] not in seen:
            seen.add(c["document_id"])
            citations.append({"document_id": c["document_id"], "title": c["title"]})

    return {
        "available": True,
        "reason": "ok",
        "answer": (data.get("answer") or "").strip(),
        "answered": bool(data.get("answered")),
        "citations": citations,
        "document_count": len(context),
    }
