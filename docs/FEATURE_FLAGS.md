# Feature Flags Lite

Lightweight kill switches so a founder can pause a risky feature during private
beta — quickly and safely, without removing code. This is **not** a rollout /
experimentation platform.

## Model

`apps/features` → `FeatureFlag`:

| field | meaning |
|---|---|
| `key` | stable feature key (unique) |
| `name`, `description` | human labels |
| `visibility` | `enabled` / `beta_only` / `founder_only` / `disabled` |
| `maintenance_message` | shown to users who can't use a paused feature |
| `updated_by`, `created_at`, `updated_at` | audit metadata |

Visibility is a single enum (there is no separate `is_enabled`).

## Resolution order

```
DB FeatureFlag row  →  env DUENEST_FEATURE_<KEY>  →  registry default
```

- **DB overrides env overrides default.**
- Env values are booleans: `DUENEST_FEATURE_QUICK_SHARE=false` → disabled.
- **Missing key / no override → ENABLED.** Every shipped feature is already
  tested, so the switch layer must never silently break one. Founders dial
  features *down*; they don't have to opt every feature *in*.
- `seed_feature_flags` creates a row for every registry key, so "missing" is
  rare in practice.

## Resolution semantics

`is_feature_enabled(key, user)`:

- `disabled` → `False` for everyone (including founders, so a paused feature is
  verifiably off; re-enable via admin/API).
- `enabled` → `True` for everyone.
- `founder_only` → `True` only for staff/superuser.
- `beta_only` → `True` for any authenticated user (no dedicated beta cohort field
  exists yet; documented as such) and founders; `False` for anonymous.

## Backend enforcement (the real boundary)

`apps/features/flags.py`:

- `is_feature_enabled(key, user=None) -> bool`
- `require_feature_enabled(key, user=None)` → raises `FeatureDisabled` (**HTTP
  503**) `{"detail", "feature", "status": "disabled"}` (no config leak).

Gated endpoints (this pass):

- Quick Share create (`quick_share`), receive-by-code (`quick_share_code`),
  public claim viewer (`quick_share_public_viewer`).
- Emergency pack create (`emergency_access`), emergency public viewer
  (`emergency_public_viewer`).
- OCR extraction create (`ocr`).
- Email reminder command (`email_reminders`) → forced no-send when disabled.

**Frontend hiding is never the security boundary** — the endpoints above 503
even if the UI is bypassed.

## Frontend behavior

- `GET /api/v1/features/` returns the resolved map for the current viewer.
- `FeatureFlagsProvider` + `useFeature(key)` / `useFeatures()` hooks.
- The dashboard sidebar **hides** nav items for disabled features.
- `DisabledFeatureCard` shows a calm "temporarily unavailable / beta-only /
  founder-only" state. Unknown keys and the pre-load window default to *visible*
  so the UI never hides something it isn't sure about.

## Founder / admin management

- **Django admin:** `FeatureFlag` is registered (inline-editable `visibility`).
- **API (founder-only):** `GET /api/v1/founder/feature-flags/`,
  `PATCH /api/v1/founder/feature-flags/<key>/` (`visibility`,
  `maintenance_message`). Changes are audit-logged via `log_founder_action`
  (`feature_enabled` / `feature_disabled` / `feature_visibility_changed` /
  `feature_maintenance_message_changed`) — keys and from→to only, never secrets.

## Seeding

```bash
python manage.py seed_feature_flags          # create missing rows (idempotent)
python manage.py seed_feature_flags --reset  # also reset rows to registry defaults
```

All keys seed `enabled` except `founder_console` and the **advanced scanner /
document-preparation tools**, which seed `founder_only`:
`scanner_advanced_tools`, `scan_to_safesend`, `scan_to_bundle`,
`scan_to_reminder`, `scan_safe_copy`, `scan_watermark`, `scan_compression`,
`scan_page_export`, `scan_redaction`, plus `document_merge` (File Inbox PDF
merge), `document_page_extract` (export PDF pages), `document_redaction`
(flatten + redact an existing PDF, experimental), `scan_pdf_import` (import a
PDF into the scanner), `document_compress` (shrink a scanned PDF), and
`duplicate_detection` (warn before adding a file matching an existing one;
checksum/name/size, never auto-deletes or replaces), and `document_versioning`
(version-history tab + restore previous metadata; the restore/replace **write**
endpoints are enforced server-side, not just hidden), `filename_templates`
(scanner quick clean-name chips; UI-only, editable), `scan_modes` (friendly
filter+quality presets; user-chosen, not auto-recognition), and
`advanced_document_preview` (image zoom controls in the file viewer; UI-only),
`batch_scan_actions` (move multiple selected inbox files to the Vault at once,
optionally under a category), `document_page_edit` (replace a bad page / add
a page in a PDF, lossless via pdf-lib, saved as a new version; experimental),
`scan_ocr` (on-device text extraction from a scanned page via Tesseract.js — the
image never leaves the browser; user-triggered, nothing auto-filled), and
`scan_hands_free` (continuous auto-capture batch mode: once a page is framed and
steady it is captured and committed, then the camera keeps going for the next
page; opt-in toggle, manual capture unchanged).
These stay invisible to normal users until a founder launches each one
(`beta_only` / `enabled`). They mostly gate UI
affordances on the scanner success screen; the underlying risky actions reuse
already server-gated flows (e.g. Quick Share create is enforced by `quick_share`
regardless of `scan_to_safesend`). See `DOCUMENT_SCANNER.md`.

The **Application Pack Preparation** keys also seed `founder_only`:
`application_pack_preparation` (master gate; also enforces the merged-PDF export
endpoint and gates the review screen + export-name field),
`application_pack_templates` (the pack-template list endpoint + `template`
seeding on bundle create), `application_pack_timeline` (the owner-only bundle
activity feed endpoint), and `application_pack_safesend` (the "Share pack safely"
shortcut into Quick Share). The template/timeline/merged-PDF endpoints are
enforced server-side (`503`); the SafeSend shortcut reuses the already-gated
`quick_share` flow. See `api-spec.md` §13B.3 / §28.2.

The **Vault Organization** keys also seed `founder_only`: `vault_bulk_actions`
(multi-select bar — move category, add tag, archive, trash, export, add-to-pack,
set-reminder; reuses existing per-document endpoints plus the owner-scoped bulk
export / add-documents routes), `vault_trash_undo` (inline Undo toast on
trash/archive/move), `vault_smart_views` (Smart Views panel on the Vault
overview), and `vault_table_view` (compact table view mode). All are UI-only over
existing owner-scoped data; the Vault behaves exactly as today when they are off.

The **Emergency safety check-in** key `emergency_checkin` (`founder_only`) gates
the "dead man's switch": the owner arms a deadline and, if they don't check in,
the `process_emergency_checkins` cron emails the pack's trusted contacts
(server-side, so it fires even with the phone off). The arm/extend/cancel
endpoints enforce the flag (`503` when off) and the cron honors it as a kill
switch (no-send when disabled). See `DOCUMENT_SCANNER.md`-style docs in
`api-spec.md` §Emergency.

The **Customizable QR** key `qr_customization` (`founder_only`) gates the custom
foreground/background color pickers, live scan-reliability warnings, named style
presets, quiet-zone control, saved default style, client-side logo upload, and
SVG export on the SafeSend link screen. UI-only: the QR still encodes only the
tokenized SafeSend URL and follows the same access/expiry/revoke rules. The
existing color presets and DueNest badge are unchanged when the flag is off.

The **AI** keys seed `founder_only`: `ai_features` (master gate),
`ai_document_extraction`, `ai_document_qa`, and `ai_document_drafting`. These
gate the Claude-powered document-intelligence features. They are gated **twice**:
by these flags AND at the platform level by `ANTHROPIC_API_KEY` — with no key
set, `settings.AI_CONFIGURED` is `False` and every AI call degrades to a clear
"not configured" result (`apps.ai.client`) regardless of the flags. Adding the
key activates the features with no code change; the flags then control who sees
each one. See `docs/architecture.md` (AI foundation) for the privacy note —
unlike local OCR, keyed AI calls send the relevant document text to Anthropic.

Recommended beta postures a founder may choose: set newer/sensitive features
(e.g. `emergency_public_viewer`, `secure_rooms`, `organizations`) to `beta_only`
until real-user QA is done; `email_reminders` stays `enabled` in dev but
production delivery is separately not configured (see
`PRIVATE_BETA_READINESS.md`).

## Emergency rollback

To pause a feature fast: Django admin → FeatureFlag → set `visibility=disabled`
(+ optional maintenance message), or `PATCH /founder/feature-flags/<key>/`. It
takes effect on the next request — no deploy.

## Limitations / deferred (future Feature Control Center)

Not built (intentionally): rollout percentages, country/plan targeting, cohorts,
A/B experiments, per-flag audit dashboard, a dedicated beta-cohort field. These
can come after beta.
