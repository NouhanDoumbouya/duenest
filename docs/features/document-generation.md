# Document Generation (AI Drafting)

> Documents **existing**, verified code (`apps/documents/ai_draft.py`, endpoint
> `document-draft`; tests `test_ai_draft.py`). Recorded for Phase 17.

## Scope

Draft professional correspondence (letters / emails) grounded in the owner's own records —
e.g. "write a letter to request a replacement for my expired passport." Returns a subject
line + body.

## What it does not claim

- **Never invents facts.** Missing details are emitted as **placeholders** in square
  brackets (`[your address]`, `[date]`) — enforced by the system prompt.
- The draft is **a suggestion the user reviews and edits**, not a finished/authoritative
  document. No guaranteed application/ATS outcome; no legal advice.

## API

`document-draft`, owner-scoped, gated by `ai_features` + `ai_document_drafting`, and
`apps.ai` config (not configured → honest result). User-triggered only.

## Security

Owner-scoped grounding (only the user's documents); key-gated provider; rate-limited; no
secrets logged.

## Status

Backend implemented + tested (mocked provider). Frontend at `/dashboard/draft`. Live use
needs `ANTHROPIC_API_KEY`.
