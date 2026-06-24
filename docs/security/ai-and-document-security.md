# Security — AI & Document Intelligence

Covers the AI features (`apps/ai`, and `apps/documents/ai_*`): Smart Intake, Ask / Chat
(RAG), and Drafting/Generation.

## Key-gated by design

- AI is **off until configured.** `apps/ai/config.py` resolves `AI_CONFIGURED` from
  `ANTHROPIC_API_KEY`. With no key, features degrade to a clear **"not configured"**
  result — they never fake an answer.
- The default model is a **Haiku-class model** (`AI_MODEL_HAIKU`), not Opus. Opus is
  reserved for founder/admin or an explicit `AI_MODEL` operator override, and for
  system (user=None) calls. This keeps costs bounded by default.
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

## Plan credits (product limits)

AI usage is also governed by **monthly plan credits** — a separate, product-level layer
on top of consent and rate limiting:

- Free: 10 credits/month, basic features only (single-doc Q&A, summary, extraction,
  deadline extraction, reminder suggestion). Haiku model only.
- Pro: 200 credits/month, all features. Haiku by default; Sonnet allowed for heavier
  features when `AI_PRO_SONNET_ENABLED=true`.
- Credits are consumed only after a successful call. Blocked or failed calls never spend.
- New blocked reasons: `ai_feature_not_in_plan`, `ai_credits_exhausted`,
  `ai_index_limit_exceeded` — all return graceful `200` with `upgrade: true` where
  applicable.

## Cost control

- **User-triggered only** — no automatic/background/bulk AI processing.
- **Infrastructure budget guard** (`AI_DAILY_TOKEN_CAP_USER`, `AI_DAILY_TOKEN_CAP_GLOBAL`,
  `AI_MONTHLY_COST_LIMIT_USD`) remains fully active and independent of plan credits.
  Both layers must pass; either can block a call.
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

## Safe URL fetch (requirement link import)

The Requirement Link → Checklist feature fetches a single user-provided URL
server-side. Security controls applied:

- **Scheme allowlist** — `http`/`https` only; `file://`, `ftp://`, `javascript:`,
  `data:`, etc. are rejected.
- **SSRF guard** — the host is DNS-resolved before connecting; private, loopback,
  link-local, reserved, multicast, and unspecified IP ranges are blocked.
- **Redirect cap** — max 3 hops; each hop is re-validated against scheme and IP rules.
- **Timeout** — 10 s per request.
- **Size cap** — responses larger than 2 MB are rejected.
- **Content guard** — only `text/html` and `text/plain` are accepted.
- **No crawling** — exactly the one user-supplied URL is fetched; no link-following.
- **No raw HTML stored** — only the structured extraction result and short source
  snippets are persisted in `RequirementExtractionDraft`; no R2 calls.
- **Existing gates reused** — consent, plan entitlement (Pro-only), monthly credits
  (5 per success), and the infrastructure budget guard all apply normally.
- **V1 limitation** — DNS-rebinding (TOCTOU) is not fully mitigated; the IP check
  is at resolution time, not at connection time. This covers the common SSRF case
  for a user-pasted URL in a personal vault.

See `docs/security-plan.md` §18 and `docs/api-spec.md` §13B.8a for details.
