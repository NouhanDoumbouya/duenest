# Security — AI & Document Intelligence

Covers the AI features (`apps/ai`, and `apps/documents/ai_*`): Smart Intake, Ask / Chat
(RAG), and Drafting/Generation.

## Key-gated by design

- AI is **off until configured.** `apps/ai/config.py` resolves `AI_CONFIGURED` from
  `ANTHROPIC_API_KEY` (provider `anthropic`, default model `claude-opus-4-8`). With no key,
  features degrade to a clear **"not configured"** result — they never fake an answer.
- The `anthropic` SDK is imported lazily, so lean installs without it still run.

## Owner-scoped grounding

- All AI retrieval is **owner-scoped**: only the requesting user's own, non-trashed
  documents are ever considered. No cross-user document exposure.
- Answers are grounded in retrieved snippets; "I could not find that" is a real outcome.

## Consent & rate limiting

- AI actions are **consent-gated** (`ai_consented`); without consent the endpoint returns
  `{available:false, reason:"consent_required"}`.
- Per-user **rate limits** (e.g. `ai_intake` scope) and per-feature flags (`ai_features`,
  `ai_intake`, `ai_chat`, `ai_document_qa`, `ai_document_drafting`) gate access (503 when
  paused).

## Cost control

- **User-triggered only** — no automatic/background/bulk AI processing.
- `AI_MAX_TOKENS` / model are env-configured; timeouts and provider errors surface as
  honest UI states ("AI request failed. Try again.").
- Automated tests mock the provider — **no live AI calls in the test suite.**

## Review-first

- AI **suggests; the user confirms.** Smart Intake performs no writes; drafts/answers are
  suggestions to review. Drafting never invents facts (uses `[placeholders]`).

## Logging

- Provider / model / status are logged for observability; **secrets and API keys are never
  logged.**

## Honest limits

- Retrieval is lexical by default with an embeddings seam (semantic ranking only when an
  embeddings key is configured). AI can be wrong — review important details.
