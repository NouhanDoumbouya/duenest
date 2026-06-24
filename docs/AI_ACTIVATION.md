# Activating AI

CertaNest's AI features are built **dark**: fully shipped, tested, and dormant
until a founder turns them on. Activation is deliberate and reversible. This is
the runbook.

## What's gated, and by what

An AI feature runs for a user only when **all** of these are true:

1. **A key is configured** — `ANTHROPIC_API_KEY` is set (`settings.AI_CONFIGURED`).
2. **The feature flag is on** for that user — `ai_features` (master) plus the
   per-feature flag (`ai_document_extraction`, `ai_document_qa`,
   `ai_document_drafting`, `ai_pack_copilot`, `ai_briefing`, `ai_chat`,
   `ai_intake`, `ai_briefing` for the digest). All default `founder_only`.
3. **The user has consented** — they turned AI on (Settings → AI & privacy, or
   the in-app "Turn on AI" card). Off until they opt in, regardless of 1–2.

Local OCR / keyword retrieval never depend on any of this — they always work.

## Step 1 — Configure the key(s)

Set on the backend (Railway service variables / `backend/.env`):

```
ANTHROPIC_API_KEY=sk-ant-...
# Optional cost lever while testing — Haiku is ~5x cheaper than the Opus default:
# AI_MODEL=claude-haiku-4-5
```

Optional, for semantic (content-level) retrieval — a **separate** key:

```
VOYAGE_API_KEY=...            # without it, retrieval stays keyword-based
# then index documents:
python manage.py build_document_embeddings
```

`pip install -r requirements.txt` already includes `anthropic` and `voyageai`
(both lazy-imported; absent keys = features stay off, no crash).

## Step 2 — Flip the flags

Founder Console → Feature Flags (or `seed_feature_flags` / admin). Move from
`founder_only` to `beta_only` (any signed-in user) or `enabled` (everyone):

- `ai_features` — the master gate (required for any AI surface).
- Then the specific features you want live, e.g. `ai_briefing`, `ai_document_qa`,
  `ai_chat`, `ai_pack_copilot`, `ai_document_drafting`, `ai_document_extraction`,
  `ai_intake`.

The **Assistant** sidebar group and the AI affordances appear for users the
flags resolve on for.

## Step 3 — Users opt in (consent)

Even with the key + flags on, AI does nothing until the user turns it on:

- The in-app **"Turn on your AI assistant"** card (Assistant → Briefing / Ask /
  Chat), or
- **Settings → AI & privacy** — consent toggle, optional **Privacy Mode**
  (mask sensitive values before any AI request), and the data stance.

## Step 4 (optional) — the weekly digest

The opt-in weekly briefing email needs: AI configured, email configured
(`EMAIL_PROVIDER`), the user's `ai_briefing` flag on, and the user opted in to
the digest (Notification preferences). Then either run on a schedule:

- `ENABLE_CELERY_BEAT=true` (Mon 08:00 UTC), or
- a platform cron: `python manage.py send_ai_digests` (use `--dry-run` first).

## Requirement link import

Paste a scholarship, visa, university, or other application URL into a pack to
extract a requirements checklist without any manual typing.

- **What it does:** the backend safely fetches the single user-provided URL (no
  crawling, no following links), Claude extracts required/optional documents,
  deadlines, eligibility notes, and submission instructions with source
  citations, the user reviews the draft, and selects items to apply to the pack.
  Nothing is added until the user approves (Extract → Review → Apply).
- **Plan:** Pro-only (`ai_requirement_checklist` entitlement).
- **Credits:** 5 AI credits per successful extraction. Failed fetches, blocked
  requests, and AI errors charge 0 credits. The Apply step is free.
- **Consent:** `AiPreference.ai_enabled` must be on.
- **Safe fetch:** fetches only the single user-provided URL; rejects non-http/https
  schemes; resolves the host and blocks private/loopback/reserved IPs (SSRF guard);
  caps redirects (max 3), request timeout (10 s), and response size (2 MB);
  accepts HTML/text only. No raw HTML is stored — only the structured extracted
  payload and short source snippets.
- **Flags:** `ai_requirement_import` (default `founder_only`) + `ai_features` master gate.
  Returns `503` when off.
- **Endpoints:** `POST .../requirements/import-link/` (extract) and
  `POST .../requirements/import-link/{draft_id}/apply/` (apply). See
  `docs/api-spec.md` §13B.8a for the full spec.

## Plan credits

AI usage is now metered with **monthly AI credits** (not per-day actions):
- **Free:** 10 credits/month, 3 AI-indexed documents, basic features only (summary,
  single-doc Q&A, deadline extraction, reminder suggestion, extraction).
- **Pro:** 200 credits/month, 300 AI-indexed documents, all features including
  multi-doc Q&A, drafting, pack copilot, readiness checks.

Credits cost 1–5 per feature call (see `docs/BILLING.md` "AI plan limits" for the
full table). A credit is spent only after a genuinely successful AI call — blocked,
failed, or consent-missing calls never consume a credit.

## Model routing

- **Free:** Haiku only (set via `AI_MODEL_HAIKU`).
- **Pro:** Haiku by default; Sonnet for heavier features when `AI_PRO_SONNET_ENABLED=true`.
- **Opus:** founder/admin or explicit `AI_MODEL` override only. Opus is not the
  default model for normal Free/Pro AI.

## Cost & privacy notes

- $5 of credit is a demo budget — fine for piloting with a handful of users.
  `AI_MODEL_HAIKU` (Haiku-class) is the default; `AI_MODEL` is the operator
  override (set to Opus for founder-level work). Do not set Opus as the default
  on a small balance.
- The AI paths send the relevant document **text** to Anthropic; this is
  disclosed in-app, off by default, and opt-in per user. Privacy Mode redacts
  obvious identifiers first. Local OCR/keyword paths never leave the box.

## Turning it back off

Flip the flags back to `founder_only`/`disabled`, unset the key, or a user can
toggle their own consent off — any one of these stops the AI paths immediately.
