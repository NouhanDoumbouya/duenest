"""
Text chunking for chunk-level RAG (deterministic, dependency-free, testable).

Splits a document's extracted/OCR body text into overlapping chunks that fit
comfortably in a prompt. Paragraph-aware where it can be (splits on blank lines),
falling back to fixed-size character windows with overlap so a single huge
paragraph still chunks safely. No model calls here — pure string work.

Sizes come from settings (``AI_RAG_CHUNK_SIZE`` etc.) with conservative defaults
so cost stays bounded; callers pass the resolved values in.
"""

from __future__ import annotations

import hashlib
import re

# Conservative fallbacks if a caller doesn't pass settings-derived values.
DEFAULT_CHUNK_SIZE = 1200
DEFAULT_CHUNK_OVERLAP = 150
DEFAULT_MAX_CHUNKS = 40
DEFAULT_MAX_CHARS = 60000

_WS_RUN = re.compile(r"[ \t\f\v]+")
_BLANKLINES = re.compile(r"\n\s*\n+")


def normalize_ai_text(text: str) -> str:
    """Collapse whitespace while preserving paragraph breaks.

    Tabs/repeated spaces become a single space; 3+ newlines collapse to a
    paragraph break (``\\n\\n``); CRLF is normalized. Deterministic and safe on
    empty/None input (returns "").
    """
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Trim trailing spaces on each line, collapse intra-line whitespace runs.
    lines = [_WS_RUN.sub(" ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    # Collapse 2+ blank lines to a single paragraph separator.
    text = _BLANKLINES.sub("\n\n", text)
    return text.strip()


def hash_text(text: str) -> str:
    """Stable SHA-256 hex digest of ``text`` (for change detection)."""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _split_window(segment: str, chunk_size: int, overlap: int) -> list[str]:
    """Fixed-size character windows with overlap over a single segment."""
    out: list[str] = []
    step = max(1, chunk_size - overlap)
    start = 0
    n = len(segment)
    while start < n:
        piece = segment[start : start + chunk_size].strip()
        if piece:
            out.append(piece)
        if start + chunk_size >= n:
            break
        start += step
    return out


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
    *,
    max_chunks: int = DEFAULT_MAX_CHUNKS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> list[str]:
    """Chunk ``text`` into overlapping, non-empty pieces.

    Paragraph-aware: paragraphs are packed up to ``chunk_size``; a paragraph
    larger than ``chunk_size`` is windowed with ``overlap``. The whole input is
    first capped at ``max_chars`` and the result at ``max_chunks`` (both bound
    cost). Returns ``[]`` for empty input.
    """
    text = normalize_ai_text(text)
    if not text:
        return []
    chunk_size = max(1, int(chunk_size))
    overlap = max(0, min(int(overlap), chunk_size - 1))
    if max_chars and len(text) > max_chars:
        text = text[:max_chars]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buffer = ""

    def flush():
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for para in paragraphs:
        if len(para) > chunk_size:
            # Big paragraph: flush what we have, then window the paragraph.
            flush()
            chunks.extend(_split_window(para, chunk_size, overlap))
            continue
        if not buffer:
            buffer = para
        elif len(buffer) + 2 + len(para) <= chunk_size:
            buffer = f"{buffer}\n\n{para}"
        else:
            flush()
            buffer = para
    flush()

    # Drop empties (defensive) and enforce the chunk cap.
    chunks = [c for c in chunks if c]
    if max_chunks and len(chunks) > max_chunks:
        chunks = chunks[:max_chunks]
    return chunks
