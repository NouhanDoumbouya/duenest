"""Tests for the key-gated embeddings layer (content-level RAG)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from apps.ai import embeddings as emb

_CONFIGURED = dict(
    EMBEDDINGS_CONFIGURED=True,
    VOYAGE_API_KEY="vk-test",
    EMBEDDINGS_MODEL="voyage-3",
)


class ResolveEmbeddingsSettingsTests(SimpleTestCase):
    def _get(self, values):
        return lambda key, default="": values.get(key, default)

    def test_no_key_not_configured(self):
        out = emb.resolve_embeddings_settings(self._get({}))
        self.assertFalse(out["EMBEDDINGS_CONFIGURED"])
        self.assertEqual(out["EMBEDDINGS_MODEL"], emb.DEFAULT_MODEL)

    def test_key_configures(self):
        out = emb.resolve_embeddings_settings(self._get({"VOYAGE_API_KEY": "vk"}))
        self.assertTrue(out["EMBEDDINGS_CONFIGURED"])

    def test_unknown_provider_not_configured(self):
        out = emb.resolve_embeddings_settings(
            self._get({"EMBEDDINGS_PROVIDER": "openai", "VOYAGE_API_KEY": "vk"})
        )
        self.assertFalse(out["EMBEDDINGS_CONFIGURED"])


class CosineTests(SimpleTestCase):
    def test_identical_vectors(self):
        self.assertAlmostEqual(emb.cosine_similarity([1, 0], [1, 0]), 1.0)

    def test_orthogonal(self):
        self.assertAlmostEqual(emb.cosine_similarity([1, 0], [0, 1]), 0.0)

    def test_degenerate(self):
        self.assertEqual(emb.cosine_similarity([], [1]), 0.0)
        self.assertEqual(emb.cosine_similarity([0, 0], [0, 0]), 0.0)


class EmbedTests(SimpleTestCase):
    @override_settings(EMBEDDINGS_CONFIGURED=False)
    def test_not_configured_returns_none(self):
        with mock.patch.object(emb, "_load_voyage") as load:
            self.assertIsNone(emb.embed_query("hi"))
        load.assert_not_called()

    @override_settings(**_CONFIGURED)
    def test_embed_query_uses_sdk(self):
        client = mock.Mock()
        client.embed.return_value = SimpleNamespace(embeddings=[[0.1, 0.2, 0.3]])
        module = SimpleNamespace(Client=mock.Mock(return_value=client))
        with mock.patch.object(emb, "_load_voyage", return_value=module):
            out = emb.embed_query("when does my passport expire")
        self.assertEqual(out, [0.1, 0.2, 0.3])
        _, kwargs = client.embed.call_args
        self.assertEqual(kwargs["input_type"], "query")

    @override_settings(**_CONFIGURED)
    def test_sdk_missing_returns_none(self):
        with mock.patch.object(emb, "_load_voyage", side_effect=ImportError):
            self.assertIsNone(emb.embed_documents(["a"]))

    @override_settings(**_CONFIGURED)
    def test_transport_error_returns_none(self):
        client = mock.Mock()
        client.embed.side_effect = RuntimeError("boom")
        module = SimpleNamespace(Client=mock.Mock(return_value=client))
        with mock.patch.object(emb, "_load_voyage", return_value=module):
            self.assertIsNone(emb.embed_documents(["a"]))

    @override_settings(**_CONFIGURED)
    def test_count_mismatch_returns_none(self):
        client = mock.Mock()
        client.embed.return_value = SimpleNamespace(embeddings=[[0.1]])  # 1 for 2 texts
        module = SimpleNamespace(Client=mock.Mock(return_value=client))
        with mock.patch.object(emb, "_load_voyage", return_value=module):
            self.assertIsNone(emb.embed_documents(["a", "b"]))
