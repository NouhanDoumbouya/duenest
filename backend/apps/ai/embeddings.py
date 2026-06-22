"""
Embeddings layer for content-level retrieval (RAG) — KEY-GATED, built dark.

Anthropic has no first-party embeddings model, so CertaNest pairs Claude with a
dedicated embeddings provider (Voyage AI by default). This is a *separate* key
from ``ANTHROPIC_API_KEY``:

  * No ``VOYAGE_API_KEY`` set -> ``EMBEDDINGS_CONFIGURED`` is False. The retrieval
    seam (``apps.documents.ai_qa.gather_context``) keeps using its lexical
    keyword ranking exactly as today — nothing changes.
  * Add the key -> document/query embeddings activate and retrieval becomes
    semantic, transparently improving Ask / Chat / Pack Copilot. No per-feature
    flag: it's an internal quality upgrade to the existing seam.

``resolve_embeddings_settings`` is pure (no Django imports) for unit testing. The
``voyageai`` SDK is imported lazily, so lean installs without it (and every code
path when no key is set) run fine. Every call degrades to ``None`` on failure —
callers must treat ``None`` as "fall back to keyword retrieval".
"""

from __future__ import annotations

import logging
import math
from typing import Callable

from django.conf import settings

logger = logging.getLogger(__name__)

Getter = Callable[[str, str], str]

DEFAULT_MODEL = "voyage-3"


def resolve_embeddings_settings(get: Getter) -> dict:
    """Return embeddings settings derived from env vars (pure function)."""
    provider = (get("EMBEDDINGS_PROVIDER", "voyage") or "voyage").strip().lower()
    api_key = (get("VOYAGE_API_KEY", "") or "").strip()
    model = (get("EMBEDDINGS_MODEL", "") or "").strip() or DEFAULT_MODEL
    configured = provider == "voyage" and bool(api_key)
    return {
        "EMBEDDINGS_PROVIDER": provider,
        "VOYAGE_API_KEY": api_key,
        "EMBEDDINGS_MODEL": model,
        "EMBEDDINGS_CONFIGURED": configured,
    }


def embeddings_available() -> bool:
    """True when an embeddings key is configured (``settings.EMBEDDINGS_CONFIGURED``)."""
    return bool(getattr(settings, "EMBEDDINGS_CONFIGURED", False))


def _load_voyage():
    """Import the SDK lazily. Isolated so tests can patch it without the SDK."""
    import voyageai  # noqa: PLC0415 - intentional lazy import (optional dependency)

    return voyageai


def _embed(texts: list[str], input_type: str) -> list[list[float]] | None:
    if not texts or not embeddings_available():
        return None
    try:
        voyageai = _load_voyage()
    except ImportError:
        logger.warning("Embeddings configured but the 'voyageai' SDK is not installed")
        return None
    try:
        client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
        result = client.embed(
            texts,
            model=getattr(settings, "EMBEDDINGS_MODEL", DEFAULT_MODEL),
            input_type=input_type,
        )
        vectors = list(getattr(result, "embeddings", []) or [])
        if len(vectors) != len(texts):
            return None
        return vectors
    except Exception:  # noqa: BLE001 - embeddings must never break the caller
        logger.warning("Embeddings call failed", exc_info=True)
        return None


def embed_documents(texts: list[str]) -> list[list[float]] | None:
    """Embed corpus texts for storage. ``None`` on any failure."""
    return _embed(texts, "document")


def embed_query(text: str) -> list[float] | None:
    """Embed a single query string. ``None`` on any failure."""
    vectors = _embed([text], "query")
    return vectors[0] if vectors else None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity of two equal-length vectors; 0.0 on degenerate input."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)
