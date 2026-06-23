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

from django.conf import settings

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


def gather_context(
    user, question: str, *, limit: int = _MAX_DOCS, document_id: int | None = None
) -> list[dict]:
    """
    Select the documents to ground the answer on (the retrieval seam).

    Returns a list of ``{"index", "document_id", "title", "text"}`` — owner-scoped,
    ranked by relevance to ``question``, capped at ``limit``.

    When ``document_id`` is given, grounding is restricted to that single
    document. It stays owner-scoped, so a foreign or unknown id simply yields no
    context (and the caller reports ``no_documents``) — never another user's data.
    This powers a contextual "ask about this document" entry point without the
    model ever seeing the rest of the vault.
    """
    from .models import Document

    owned = Document.objects.filter(owner=user, is_trashed=False)
    if document_id is not None:
        docs = list(owned.filter(id=document_id))
    else:
        docs = list(owned.order_by("-updated_at")[: max(limit * 3, limit)])
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


# --- Chunk-level RAG (document body content) -------------------------------
#
# Where the document-level path above grounds on each document's *metadata
# snippet*, the chunk path grounds on slices of the actual extracted body text
# (``DocumentChunk``). It is owner-scoped, prefers vector similarity when chunks
# are embedded, falls back to lexical scoring, and — when a document has no
# chunks at all — defers to the document-level path so nothing regresses.

_CHUNK_ANSWER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string"},
        "answered": {"type": "boolean"},
        "cited_chunk_indexes": {"type": "array", "items": {"type": "integer"}},
    },
}

_CHUNK_SYSTEM = (
    "You answer the user's question using ONLY the numbered excerpts below, which "
    "are slices of the user's own documents. Never use outside knowledge and never "
    "guess or fabricate dates, names, ID numbers, or deadlines. If the excerpts do "
    "not contain enough information, set 'answered' to false and reply exactly: 'I "
    "could not find enough information in the selected documents.' When you do "
    "answer, be concise, state any dates/deadlines clearly, and list the excerpt "
    "numbers you used in 'cited_chunk_indexes'."
)

_NO_CONTEXT_MESSAGE = "I could not find enough information in the selected documents."


def _rag_setting(name: str, default):
    return getattr(settings, name, default)


def _lexical_rank_chunks(question: str, chunks: list) -> list[tuple]:
    """Order chunks by keyword overlap with the question (stable). -> [(score, chunk)]."""
    terms = set(_WORD_RE.findall(question.lower()))
    scored = []
    for ch in chunks:
        text = (ch.text or "").lower()
        score = sum(1 for t in terms if t in text) if terms else 0
        scored.append((float(score), ch))
    scored.sort(key=lambda t: t[0], reverse=True)
    return scored


def _rank_chunks(question: str, chunks: list) -> tuple[str, list[tuple]]:
    """Return ``(mode, [(score, chunk), ...])`` — vector when possible, else lexical."""
    from apps.ai.embeddings import (
        cosine_similarity,
        embed_query,
        embeddings_available,
    )

    has_vectors = any(getattr(c, "embedding_vector", None) for c in chunks)
    if embeddings_available() and has_vectors:
        query_vector = embed_query(question)
        if query_vector:
            scored = [
                (
                    cosine_similarity(query_vector, c.embedding_vector)
                    if c.embedding_vector
                    else -1.0,
                    c,
                )
                for c in chunks
            ]
            scored.sort(key=lambda t: t[0], reverse=True)
            return "chunk_vector", scored
    return "chunk_lexical", _lexical_rank_chunks(question, chunks)


def retrieve_chunk_context(
    user, question: str, *, document_id: int | None = None
) -> dict:
    """
    Owner-scoped chunk retrieval. Returns ``{items, mode, indexed}``.

    ``items`` are the top chunks (capped by ``AI_RAG_TOP_K`` and
    ``AI_RAG_MAX_CONTEXT_CHARS``), each ``{index, document_id, document_title,
    chunk_index, page_number, excerpt, text, score}``. ``mode`` is
    ``chunk_vector`` / ``chunk_lexical``; when the user has no chunks (for the
    selected scope) it returns ``mode="document_fallback"`` with no items so the
    caller defers to the document-level path. Never returns another user's chunks.
    """
    from .models import DocumentChunk

    top_k = max(1, int(_rag_setting("AI_RAG_TOP_K", 5)))
    max_ctx = max(1, int(_rag_setting("AI_RAG_MAX_CONTEXT_CHARS", 10000)))

    qs = DocumentChunk.objects.filter(owner=user)  # owner scope = security boundary
    if document_id is not None:
        qs = qs.filter(document_id=document_id)
    chunks = list(qs.select_related("document"))
    if not chunks:
        return {"items": [], "mode": "document_fallback", "indexed": False}

    mode, ranked = _rank_chunks(question, chunks)

    items: list[dict] = []
    used = 0
    for score, ch in ranked[:top_k]:
        excerpt = (ch.text or "").strip()
        if not excerpt:
            continue
        if used + len(excerpt) > max_ctx:
            excerpt = excerpt[: max(0, max_ctx - used)].strip()
        if not excerpt:
            break
        used += len(excerpt)
        title = ch.source_title or getattr(ch.document, "title", "") or "Document"
        items.append(
            {
                "index": len(items) + 1,
                "document_id": ch.document_id,
                "document_title": title,
                "chunk_index": ch.chunk_index,
                "page_number": ch.page_number,
                "excerpt": excerpt,
                "text": excerpt,
                "score": round(float(score), 4),
            }
        )
        if used >= max_ctx:
            break

    return {"items": items, "mode": mode, "indexed": True}


def _answer_from_chunks(user, question: str, retrieval: dict) -> dict:
    """Generate a chunk-grounded answer + source excerpts."""
    items = retrieval["items"]
    blocks = "\n\n".join(f"[{it['index']}] {it['excerpt']}" for it in items)
    blocks = maybe_redact(user, blocks)
    prompt = f"Question: {question}\n\n--- EXCERPTS FROM THE USER'S DOCUMENTS ---\n{blocks}"
    result = generate(
        prompt=prompt,
        system=_CHUNK_SYSTEM,
        output_schema=_CHUNK_ANSWER_SCHEMA,
        max_tokens=_MAX_TOKENS,
        user=user,
        feature="document_qa",
    )
    base = {
        "available": False,
        "answer": "",
        "answered": False,
        "citations": [],
        "sources": [],
        "retrieval_mode": retrieval["mode"],
        "indexed": True,
        "document_count": len({it["document_id"] for it in items}),
    }
    if not result.ok or not isinstance(result.data, dict):
        # Budget pause / refusal / error — surface a safe reason, never raise.
        return {**base, "reason": "budget" if result.reason == "budget" else "error"}

    data = result.data
    by_index = {it["index"]: it for it in items}
    cited = data.get("cited_chunk_indexes") or []
    chosen = [by_index[i] for i in cited if i in by_index] or items

    sources, seen = [], set()
    for it in chosen:
        key = (it["document_id"], it["chunk_index"])
        if key in seen:
            continue
        seen.add(key)
        sources.append(
            {
                "document_id": it["document_id"],
                "document_title": it["document_title"],
                "chunk_index": it["chunk_index"],
                "page_number": it["page_number"],
                "excerpt": it["excerpt"][:300],
            }
        )

    # Document-level citations kept for backward compatibility with the UI.
    citations, seen_docs = [], set()
    for it in chosen:
        if it["document_id"] not in seen_docs:
            seen_docs.add(it["document_id"])
            citations.append(
                {"document_id": it["document_id"], "title": it["document_title"]}
            )

    return {
        "available": True,
        "reason": "ok",
        "answer": (data.get("answer") or "").strip(),
        "answered": bool(data.get("answered")),
        "citations": citations,
        "sources": sources,
        "retrieval_mode": retrieval["mode"],
        "indexed": True,
        "document_count": len({it["document_id"] for it in items}),
    }


def _answer_from_documents(user, question: str, *, document_id: int | None) -> dict:
    """Document-level metadata RAG — the preserved fallback path."""
    base = {
        "available": False,
        "answer": "",
        "answered": False,
        "citations": [],
        "sources": [],
        "retrieval_mode": "no_context",
        "indexed": False,
        "document_count": 0,
    }
    context = gather_context(user, question, document_id=document_id)
    if not context:
        return {**base, "reason": "no_documents"}

    blocks = "\n\n".join(f"[{c['index']}] {c['text']}" for c in context)
    blocks = maybe_redact(user, blocks)
    prompt = f"Question: {question}\n\n--- THE USER'S DOCUMENTS ---\n{blocks}"
    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_ANSWER_SCHEMA,
        max_tokens=_MAX_TOKENS,
        user=user,
        feature="document_qa",
    )
    if not result.ok or not isinstance(result.data, dict):
        reason = "budget" if result.reason == "budget" else "error"
        return {
            **base,
            "reason": reason,
            "retrieval_mode": "document_fallback",
            "document_count": len(context),
        }

    data = result.data
    by_index = {c["index"]: c for c in context}
    citations, seen = [], set()
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
        "sources": [],
        "retrieval_mode": "document_fallback",
        "indexed": False,
        "document_count": len(context),
    }


def answer_question(
    user, question: str, *, document_id: int | None = None
) -> dict:
    """
    Answer ``question`` grounded in ``user``'s documents.

    Prefers chunk-level retrieval over the document's extracted body text
    (``DocumentChunk``); when the document(s) aren't indexed yet it falls back to
    the document-level metadata path so behaviour never regresses. Always returns
    a dict; never raises. Shape::

        {available, reason, answer, answered, citations, sources,
         retrieval_mode, indexed, document_count}
    """
    question = (question or "").strip()[:_MAX_QUESTION_CHARS]
    base = {
        "available": False,
        "answer": "",
        "answered": False,
        "citations": [],
        "sources": [],
        "retrieval_mode": "no_context",
        "indexed": False,
        "document_count": 0,
    }
    if not question:
        return {**base, "reason": "empty_question"}
    if not ai_available():
        return {**base, "reason": "not_configured"}

    if bool(_rag_setting("AI_RAG_ENABLED", True)):
        retrieval = retrieve_chunk_context(user, question, document_id=document_id)
        if retrieval["items"]:
            return _answer_from_chunks(user, question, retrieval)

    return _answer_from_documents(user, question, document_id=document_id)
