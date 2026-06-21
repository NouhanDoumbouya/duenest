# Chat with Documents / RAG

> Documents **existing**, verified code (`apps/documents/ai_qa.py`, `ai_chat.py`;
> `DocumentExtraction`, `DocumentEmbedding` models; tests `test_ai_qa.py`,
> `test_ai_chat.py`, `test_ai_rag.py`). Recorded for Phase 17. **Describes what the
> code actually does**, which differs from the original spec in a couple of places.

## Scope

Answer questions grounded **only** in the asking user's own, non-trashed documents,
returning the supporting snippets/citations. Chat reuses the same retrieval seam as Ask.

## How retrieval actually works (honest)

- **Owner-scoped.** Only the requesting user's documents are ever considered.
- **Retrieval is document-snippet level**, ranked by **keyword overlap by default**
  (`_rank` in `ai_qa.py`), with a **semantic (embeddings) seam** that activates when an
  embeddings key is configured (`DocumentEmbedding`). It is **not** chunk-level vector
  search by default — the lexical ranker is the floor; embeddings improve it when present.
- **Chat is stateless server-side**: conversation `history` is passed in by the caller,
  not persisted in a `ChatSession` table. (The original spec assumed persisted sessions /
  chunk tables; the implementation is simpler and honest about its limits.)

## What it does not claim

- No hallucinated answers beyond the retrieved context; "I could not find that" is a real
  outcome.
- Review important answers before relying on them.

## API

`document-ai-chat` (+ the Ask endpoints), owner-scoped, gated by `ai_features` +
`ai_chat` / `ai_document_qa` flags, and `apps.ai` config (not configured → honest result).

## Security

Owner-scoped retrieval; no cross-user document exposure; key-gated provider; rate-limited;
no secrets logged.

## Status

Backend implemented + tested (mocked provider). Live use needs `ANTHROPIC_API_KEY`;
semantic ranking additionally needs an embeddings key.

## Future

Chunk-level extraction + a real vector retriever (pgvector) behind the existing seam;
optional persisted chat sessions.
