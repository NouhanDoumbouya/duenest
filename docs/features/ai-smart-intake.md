# AI Smart Intake

> Documents **existing**, verified code (`apps/documents/ai_intake.py`, endpoint
> `file-inbox-intake`; tests `test_ai_intake.py`, 9 passing). Recorded for Phase 17.

## Scope

When a user selects an owned File Inbox file, CertaNest proposes a one-line summary,
suggested metadata fields (reused from extraction), and **confirm-gated** next actions
(create document / set reminder / add to pack / draft). The endpoint performs **no writes**;
the user confirms any action in its own flow.

## What it does not claim

- AI **suggests**; the user **confirms**. Nothing is saved automatically.
- No bulk/background processing — user-triggered only.

## API

`POST /api/v1/files/<id>/intake/` — owner-scoped. Gated by `ai_features` + `ai_intake`
flags (503 when off) and `apps.ai` config (no key → `200 {available:false}`). Per-user
rate-limited (`ai_intake` scope). Requires AI consent (`ai_consented`), else
`200 {available:false, reason:"consent_required"}`.

## Provider

`apps/ai` — provider-neutral, key-gated on `ANTHROPIC_API_KEY`; default `claude-opus-4-8`;
lazy `anthropic` SDK; degrades to a clear "not configured" result when no key is set.

## Security

- Owner-scoped (`_owned_file_queryset`).
- No secrets logged; provider/model/status only.
- Consent-gated; rate-limited.

## Status

Backend implemented + tested (mocked provider, including an error-path test). Live use
needs `ANTHROPIC_API_KEY`. Frontend intake surfacing lives in the document/file flows.
