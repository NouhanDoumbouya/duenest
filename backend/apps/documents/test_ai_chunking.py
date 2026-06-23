"""Pure chunking utilities — no DB, no network."""

from __future__ import annotations

from django.test import SimpleTestCase

from apps.documents.ai_chunking import (
    chunk_text,
    hash_text,
    normalize_ai_text,
)


class NormalizeTests(SimpleTestCase):
    def test_empty_is_empty(self):
        self.assertEqual(normalize_ai_text(""), "")
        self.assertEqual(normalize_ai_text(None), "")

    def test_collapses_whitespace_keeps_paragraphs(self):
        out = normalize_ai_text("a\t\t b   c\n\n\n\nsecond")
        self.assertEqual(out, "a b c\n\nsecond")

    def test_crlf_normalized(self):
        self.assertEqual(normalize_ai_text("a\r\nb"), "a\nb")


class HashTests(SimpleTestCase):
    def test_deterministic_and_distinct(self):
        self.assertEqual(hash_text("hello"), hash_text("hello"))
        self.assertNotEqual(hash_text("hello"), hash_text("world"))


class ChunkTextTests(SimpleTestCase):
    def test_empty_returns_no_chunks(self):
        self.assertEqual(chunk_text(""), [])
        self.assertEqual(chunk_text("   \n  "), [])

    def test_no_empty_chunks(self):
        chunks = chunk_text("para one\n\npara two\n\n\n\n", chunk_size=100)
        self.assertTrue(all(c.strip() for c in chunks))

    def test_overlap_between_windows(self):
        # A single long paragraph (no blank lines) is windowed with overlap.
        text = "0123456789" * 30  # 300 chars, no whitespace
        chunks = chunk_text(text, chunk_size=100, overlap=20, max_chunks=99)
        self.assertGreater(len(chunks), 1)
        # consecutive windows share the configured overlap
        self.assertEqual(chunks[0][-20:], chunks[1][:20])

    def test_max_chars_caps_input(self):
        text = "A" * 5000
        chunks = chunk_text(text, chunk_size=100, overlap=0, max_chars=100)
        self.assertEqual(len("".join(chunks)), 100)

    def test_max_chunks_enforced(self):
        text = "\n\n".join(f"paragraph number {i}" for i in range(100))
        chunks = chunk_text(text, chunk_size=20, overlap=0, max_chunks=3)
        self.assertLessEqual(len(chunks), 3)

    def test_short_paragraphs_pack_into_one_chunk(self):
        chunks = chunk_text("alpha\n\nbeta", chunk_size=1000, overlap=0)
        self.assertEqual(len(chunks), 1)
        self.assertIn("alpha", chunks[0])
        self.assertIn("beta", chunks[0])

    def test_overlap_clamped_below_chunk_size(self):
        # overlap >= chunk_size must not loop forever / produce empties
        chunks = chunk_text("x" * 50, chunk_size=10, overlap=100, max_chunks=99)
        self.assertTrue(chunks)
        self.assertTrue(all(c for c in chunks))
