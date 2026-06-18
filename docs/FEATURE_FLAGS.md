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
(flatten + redact an existing PDF, experimental), and `scan_pdf_import` (import a
PDF into the scanner). These stay invisible to normal users until a founder
launches each one (`beta_only` / `enabled`). They mostly gate UI
affordances on the scanner success screen; the underlying risky actions reuse
already server-gated flows (e.g. Quick Share create is enforced by `quick_share`
regardless of `scan_to_safesend`). See `DOCUMENT_SCANNER.md`.

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
