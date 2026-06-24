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

## Application document generator (V1)

The AI Application Document Generator introduces a generate → review → export →
save-to-pack flow. The following security controls apply:

- **Review-before-save (editable).** The `POST .../generate/` endpoint returns
  structured content only; nothing is written to the vault automatically. The
  user reviews and can edit the draft via `PATCH .../{id}/` before persisting.
  No auto-share and no auto-submit: the user must explicitly call export or
  save-to-pack to persist a file.
- **Edit path never calls AI or charges credits.** When `structured_content` is
  edited the backend deterministically rebuilds the preview and recomputes
  `ats_score`, `quality_score`, and the structured `warnings` — no provider is
  contacted and no credits are consumed. Exports render from the edited content.
- **Structured warnings surfaced to the user.** Each generation/draft returns
  `warnings` as `{ type, severity, message }` objects (ATS-structure,
  content-quality, and model `quality_checks` items) plus a deterministic
  `quality_score`, so the user sees concrete quality/risk signals before export.
- **Encrypted at rest.** Exported PDF and DOCX files are stored as
  `DocumentFile` records with the same AES-256-GCM encryption used for all vault
  files. No new encryption scheme or storage path is introduced.
- **Private-only download.** The `download_url` in the export response is always
  `/api/v1/files/{id}/download/` — an authenticated, owner-only route. Raw
  R2/storage URLs are never returned.
- **No passport/ID in model context.** `build_application_context_from_profile`
  strips passport numbers and national-ID numbers before passing any context to
  the AI provider. This is enforced at the service layer, not just the view.
- **No-hallucination policy enforced at the prompt level.** The model is
  instructed to use only the supplied Smart Profile, application, and pack data.
  Missing information surfaces in `quality_checks.missing_information`, never
  invented. This reduces the risk of fabricated credentials or dates.
- **Existing gates reused.** Consent (`AiPreference.ai_enabled`), rollout flags
  (`application_document_generation` + `ai_features`), plan entitlement
  (`ai_application_document_generation`, Pro-only), monthly AI credit metering,
  and the infrastructure budget guard all apply to the generate step. No second
  metering or bypass path exists.
- **0 credits on any failure.** Blocked plan, consent missing, provider error,
  validation failure, AI refusal, and budget guard all charge 0 credits. Credits
  are consumed only after `ai_call_succeeded`.
- **Export and save-to-pack make no AI call.** They re-use the stored
  `structured_content`; no provider is contacted and no credits are consumed.
  They do enforce the standard file count and storage plan limits.
- **New dependency audit.** `python-docx==1.1.2` is pure-Python OOXML, no
  system or LibreOffice dependencies, no network calls. PDFs use the existing
  `fpdf2` library. Neither library introduces a new secret or credential surface.

See `docs/security-plan.md` (AI Application Document Generator V1 subsection)
and `docs/api-spec.md` §32 for the full spec.
