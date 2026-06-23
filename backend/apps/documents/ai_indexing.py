"""
Chunk-level RAG indexing service (explicit / manual — never auto-indexes the vault).

Pipeline: safe extracted text -> normalized chunks -> ``DocumentChunk`` rows ->
optional Voyage embeddings (only when configured). Embeddings are best-effort:
if the provider is unconfigured or fails, chunks are still stored and remain
retrievable by lexical scoring. Reindex is replace-on-change, so it never grows
uncontrolled duplicate chunks.

This module makes **no Anthropic calls** and sends **no file binaries** anywhere —
it works only over text the app already extracted (``DocumentExtraction.raw_text``)
plus safe metadata fallbacks.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .ai_chunking import (
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_MAX_CHARS,
    DEFAULT_MAX_CHUNKS,
    chunk_text,
    hash_text,
    normalize_ai_text,
)

logger = logging.getLogger(__name__)


def _rag(name: str, default):
    return getattr(settings, name, default)


def _metadata_text(document) -> str:
    """Compact key-field text — the last-resort source when no body text exists."""
    parts: list[str] = []
    if document.title:
        parts.append(f"Title: {document.title}")
    for label, value in (
        ("Type", document.document_type),
        ("Issuer", document.issuer),
        ("Country", document.country),
        ("Reference number", document.reference_number),
        ("Issue date", document.issue_date),
        ("Expiry date", document.expiry_date),
        ("Renewal date", document.renewal_date),
    ):
        if value:
            parts.append(f"{label}: {value}")
    if document.notes:
        parts.append(f"Notes: {document.notes}")
    return "\n".join(parts)


def get_document_text_for_ai(document) -> str:
    """
    Best available **safe** text for one document, deterministically.

    Order of preference: completed OCR/extraction ``raw_text`` (the real body
    text) -> document notes -> key metadata. Never reads file binaries and never
    triggers OCR — it only reuses text the app already extracted. Returns ``""``
    when nothing usable exists.
    """
    from .models import DocumentExtraction

    try:
        extractions = (
            DocumentExtraction.objects.filter(
                document=document,
                extraction_status=DocumentExtraction.Status.COMPLETED,
            )
            .exclude(raw_text="")
            .order_by("-created_at")
            .values_list("raw_text", flat=True)
        )
    except Exception:  # noqa: BLE001 — text gathering must never raise
        logger.warning("Document text gathering failed", exc_info=True)
        extractions = []

    seen: set[str] = set()
    body_parts: list[str] = []
    for raw in extractions:
        norm = normalize_ai_text(raw or "")
        if norm and norm not in seen:
            seen.add(norm)
            body_parts.append(norm)
    body = "\n\n".join(body_parts)
    if body.strip():
        return body

    notes = normalize_ai_text(getattr(document, "notes", "") or "")
    if notes.strip():
        return notes

    return normalize_ai_text(_metadata_text(document))


def get_index_status(document) -> dict:
    """Safe index status for a document (no content, just counts/flags)."""
    from .models import DocumentChunk

    qs = DocumentChunk.objects.filter(document=document)
    chunk_count = qs.count()
    embedded = qs.filter(embedding_vector__isnull=False).exists()
    return {
        "indexed": chunk_count > 0,
        "chunk_count": chunk_count,
        "embedded": embedded,
        "embeddings_configured": _embeddings_available(),
    }


def delete_document_chunks(document) -> int:
    """Delete all chunks for a document. Returns the number removed."""
    from .models import DocumentChunk

    deleted, _ = DocumentChunk.objects.filter(document=document).delete()
    return deleted


def _embeddings_available() -> bool:
    try:
        from apps.ai.embeddings import embeddings_available

        return embeddings_available()
    except Exception:  # noqa: BLE001
        return False


def _maybe_embed(chunks_texts: list[str]) -> tuple[list | None, str]:
    """
    Embed chunk texts when configured. Returns ``(vectors_or_None, state)`` where
    state is ``"ready"`` (vectors returned), ``"unavailable"`` (no key), or
    ``"failed"`` (configured but the call errored / mismatched).
    """
    if not _embeddings_available():
        return None, "unavailable"
    try:
        from apps.ai.embeddings import embed_documents

        vectors = embed_documents(chunks_texts)
    except Exception:  # noqa: BLE001 — embedding must never break indexing
        logger.warning("Chunk embedding raised; keeping lexical fallback")
        return None, "failed"
    if not vectors or len(vectors) != len(chunks_texts):
        return None, "failed"
    return vectors, "ready"


def index_document_for_rag(document, owner=None, force: bool = False) -> dict:
    """
    Index (or reindex) one document's body text into ``DocumentChunk`` rows.

    Explicit only — call this from an endpoint/command, never automatically over
    the whole vault. Replace-on-change: unchanged text is a no-op; changed text
    replaces the prior chunks atomically (no duplicates). Embeddings are added
    only when configured; failure degrades to lexical (chunks still stored).

    Returns a safe dict: ``{status, chunks_created, embeddings, embedded}`` where
    status is one of ``indexed`` / ``unchanged`` / ``no_text`` / ``forbidden``.
    """
    from .models import DocumentChunk

    result = {"status": "indexed", "chunks_created": 0, "embeddings": "unavailable",
              "embedded": False}

    # Owner check (defence in depth — endpoints also enforce ownership).
    if owner is not None and getattr(document, "owner_id", None) != getattr(
        owner, "id", None
    ):
        return {**result, "status": "forbidden"}

    text = get_document_text_for_ai(document)
    if not text.strip():
        return {**result, "status": "no_text"}

    size = int(_rag("AI_RAG_CHUNK_SIZE", DEFAULT_CHUNK_SIZE))
    overlap = int(_rag("AI_RAG_CHUNK_OVERLAP", DEFAULT_CHUNK_OVERLAP))
    max_chunks = int(_rag("AI_RAG_MAX_CHUNKS_PER_DOCUMENT", DEFAULT_MAX_CHUNKS))
    max_chars = int(_rag("AI_RAG_MAX_CHARS_PER_DOCUMENT", DEFAULT_MAX_CHARS))

    pieces = chunk_text(
        text, size, overlap, max_chunks=max_chunks, max_chars=max_chars
    )
    if not pieces:
        return {**result, "status": "no_text"}

    new_hashes = [hash_text(p) for p in pieces]

    # Idempotency: identical chunk set + not forced -> no-op.
    if not force:
        existing = list(
            DocumentChunk.objects.filter(document=document)
            .order_by("chunk_index")
            .values_list("text_hash", flat=True)
        )
        if existing == new_hashes:
            status = get_index_status(document)
            return {
                "status": "unchanged",
                "chunks_created": 0,
                "embeddings": "ready" if status["embedded"] else (
                    "unavailable" if not _embeddings_available() else "ready"
                ),
                "embedded": status["embedded"],
            }

    vectors, embed_state = _maybe_embed(pieces)
    now = timezone.now()
    embed_model = _rag("EMBEDDINGS_MODEL", "") if embed_state == "ready" else ""
    chunk_status = (
        DocumentChunk.Status.EMBEDDING_FAILED
        if embed_state == "failed"
        else DocumentChunk.Status.READY
    )

    rows = []
    for i, (piece, h) in enumerate(zip(pieces, new_hashes)):
        vector = vectors[i] if vectors else None
        rows.append(
            DocumentChunk(
                owner=document.owner,
                document=document,
                chunk_index=i,
                text=piece,
                text_hash=h,
                source_title=(document.title or "")[:255],
                token_estimate=len(piece),
                embedding_vector=vector,
                embedding_model=embed_model if vector else "",
                embedding_created_at=now if vector else None,
                status=chunk_status,
            )
        )

    # Replace-on-change atomically so a reindex never leaves duplicates.
    with transaction.atomic():
        DocumentChunk.objects.filter(document=document).delete()
        DocumentChunk.objects.bulk_create(rows)

    return {
        "status": "indexed",
        "chunks_created": len(rows),
        "embeddings": embed_state,
        "embedded": bool(vectors),
    }
