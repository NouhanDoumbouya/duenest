"""
Build/refresh semantic embeddings for documents (content-level RAG).

No-ops unless an embeddings key is configured (``EMBEDDINGS_CONFIGURED``). For
each non-trashed document it computes the same searchable snippet used for
grounding, and (re)embeds only when the snippet hash or model has changed —
so reruns are cheap and idempotent. Embeddings power the semantic ranking in
``apps.documents.ai_qa.gather_context``; without them retrieval stays lexical.
"""

from __future__ import annotations

import hashlib

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Build/refresh document embeddings for content-level RAG retrieval."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=50)
        parser.add_argument("--limit", type=int, default=0, help="0 = all")

    def handle(self, *args, **options):
        from apps.ai.embeddings import embed_documents, embeddings_available

        if not embeddings_available():
            self.stdout.write("Embeddings not configured — nothing to do.")
            return

        from apps.documents.ai_qa import _document_snippet
        from apps.documents.models import Document, DocumentEmbedding

        model = getattr(settings, "EMBEDDINGS_MODEL", "")
        batch_size = max(1, options["batch_size"])
        limit = options["limit"]

        existing = {
            e.document_id: (e.text_hash, e.model)
            for e in DocumentEmbedding.objects.all().only(
                "document_id", "text_hash", "model"
            )
        }

        pending: list[tuple] = []  # (doc, snippet, text_hash)
        qs = Document.objects.filter(is_trashed=False).order_by("id")
        if limit:
            qs = qs[:limit]
        for doc in qs.iterator():
            snippet = _document_snippet(doc)
            text_hash = hashlib.sha256(snippet.encode("utf-8")).hexdigest()
            if existing.get(doc.id) == (text_hash, model):
                continue
            pending.append((doc, snippet, text_hash))

        embedded = failed = 0
        for start in range(0, len(pending), batch_size):
            chunk = pending[start : start + batch_size]
            vectors = embed_documents([snippet for _doc, snippet, _h in chunk])
            if not vectors:
                failed += len(chunk)
                continue
            for (doc, _snippet, text_hash), vector in zip(chunk, vectors):
                DocumentEmbedding.objects.update_or_create(
                    document=doc,
                    defaults={
                        "owner": doc.owner,
                        "vector": vector,
                        "text_hash": text_hash,
                        "model": model,
                    },
                )
                embedded += 1

        self.stdout.write(
            f"Embeddings: embedded={embedded} pending={len(pending)} "
            f"failed={failed} (model={model})"
        )
