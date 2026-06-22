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

## Cost & privacy notes

- $5 of credit is a demo budget — fine for piloting with a handful of users.
  Use `AI_MODEL=claude-haiku-4-5` to stretch it; switch to Opus for quality.
- The AI paths send the relevant document **text** to Anthropic; this is
  disclosed in-app, off by default, and opt-in per user. Privacy Mode redacts
  obvious identifiers first. Local OCR/keyword paths never leave the box.

## Turning it back off

Flip the flags back to `founder_only`/`disabled`, unset the key, or a user can
toggle their own consent off — any one of these stops the AI paths immediately.
