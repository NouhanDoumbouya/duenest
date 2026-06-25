# Integrations — OAuth Foundation V1

A safe, consistent foundation for **import-only** integrations. This branch lets a
user connect and disconnect an external account (Google in V1) and prepares the
token/account plumbing so future Drive/Calendar/Gmail import flows don't each
re-implement OAuth.

> **Scope is deliberately narrow.** This branch imports **nothing**. There is no
> Drive/Calendar/Gmail import, no automatic sync, no background jobs, no webhook
> receiver, and CertaNest never writes back to or deletes anything in a connected
> account. Those flows are deferred (see "Deferred").

## Status & gating

Everything here is behind feature flags that default to **founder-only**, so the
surface is invisible to normal users until deliberately launched:

| Flag | Gates | Default |
|---|---|---|
| `integrations` | The Integrations settings page + all endpoints | founder-only |
| `google_integrations` | Connecting a Google account | founder-only |
| `google_drive_import` | Future Drive import (not built) | founder-only |
| `google_calendar_import` | Future Calendar import (not built) | founder-only |
| `gmail_import` | Future Gmail import (not built) | founder-only |

The backend is the enforcement boundary: a disabled `integrations` flag makes
every endpoint return `503` (controlled `FeatureDisabled`).

## Supported providers

* **Google** — implemented foundation (OAuth 2.0 authorization-code + OpenID
  Connect userinfo for the account profile).
* **Microsoft / Dropbox / Other** — reserved enum values only; not implemented.

## Data model (`apps/integrations`)

**`ConnectedIntegrationAccount`** — one connected external account per user.

* `user` (FK), `organization` (FK, nullable — reserved for future org-level use;
  V1 connect flow is user-level only).
* `provider`, `provider_account_id`, `provider_email`, `display_name`.
* `scopes` (granted OAuth scopes), `scope_groups` (user-facing capability groups).
* `status`: `connected | expired | revoked | error | disconnected`.
* `access_token_ciphertext`, `refresh_token_ciphertext` — **encrypted** token
  envelopes (see "Token security"). Never serialized, never logged.
* `token_expires_at`, `last_refresh_at`, `last_checked_at`, `last_error_code`,
  `last_error_at`, timestamps, `disconnected_at`.
* Unique on `(user, provider, provider_account_id)` — no duplicate connections.

**`IntegrationOAuthState`** — short-lived, single-use OAuth `state`.

* Stores only a **salted SHA-256 hash** of the raw state (`state_hash`) — never
  the raw value. `redirect_path` (validated internal path), `scopes`,
  `scope_groups`, `expires_at` (10 min TTL), `consumed_at` (single-use).

## Token security

Tokens are stored **encrypted at rest** reusing the existing application
encryption (`apps.core.security.encryption.encrypt_field_value`): AES-256-GCM
envelope, per-value data key wrapped under the active KEK, AAD-bound to
`(model, field, account_id)`. We did **not** roll our own crypto.

Hard guarantees (covered by tests):

* Tokens are **never** returned by any serializer or endpoint.
* Tokens are **never** logged, and never placed in audit/operational metadata.
* Tokens are excluded from Django admin (no display, no form field).
* The OAuth callback redirects with a **status only** — never a token or code.
* Refresh tokens are never stored in plaintext; if encryption were unavailable the
  branch would fail rather than store them unsafely.

## OAuth state & redirect safety

* The raw `state` is high-entropy (`secrets.token_urlsafe(32)`), lives only in the
  authorization URL, and is matched on callback by hash.
* States are **single-use** (`consumed_at`) and **time-boxed** (10 min) — this
  blocks CSRF and replay.
* `redirect_path` is validated to be an **internal, relative** path
  (`/...`, no `//`, no scheme, no backslash). Anything else falls back to the
  default settings path — **no open redirects**.
* The callback identifies the user from the validated state row (not a cookie), so
  it is robust to cross-site redirect cookie behavior.

## Scopes strategy

Every scope is **read-only**; no write/modify/delete scope exists. Scopes are
requested per **scope group**, only when the user chooses them:

| Group | Read-only scope | Privacy-sensitive | Default selectable |
|---|---|---|---|
| `drive` | `drive.readonly` | no | yes |
| `calendar` | `calendar.readonly` | no | yes |
| `gmail` | `gmail.readonly` | **yes** | **no** |

Identity scopes (`openid email profile`) are always included to identify the
account. **Gmail is never part of a default selection** — it must be explicitly
chosen. When no group is chosen, the non-sensitive defaults (`drive`, `calendar`)
are used. Imports themselves remain unbuilt regardless of scope.

## API endpoints (`/api/v1/integrations/`)

| Method | Path | Purpose |
|---|---|---|
| GET | `providers/` | Safe provider cards (availability, configured, status, scope groups) |
| GET | `accounts/` | The user's connected accounts (no tokens) |
| POST | `google/start/` | Begin a Google connect; returns an authorization URL |
| GET | `google/callback/` | Google redirect: validate state, exchange code, store encrypted tokens, redirect to frontend with status only |
| POST | `accounts/{id}/disconnect/` | Best-effort revoke, clear tokens, mark disconnected |
| POST | `accounts/{id}/refresh/` | Refresh tokens (safe when provider unconfigured) |
| GET | `accounts/{id}/health/` | Recompute status from token expiry |

Responses contain only safe account metadata, provider status, and scope-group
labels — never tokens, secrets, or raw state. All authenticated endpoints require
the `integrations` flag; `google/start/` also requires `google_integrations`.

## Permissions

* A user sees and manages only their own connected accounts (`{id}` routes are
  owner-scoped; another user's id returns `404`).
* The callback is unauthenticated but state-validated (the user comes from the
  state row).
* Org-level integration accounts are modelled (nullable `organization`) but the
  V1 connect flow is user-level only — org-level connect is deferred.
* Founder/admin **never** see tokens. (A founder health summary can be added once
  the founder-admin surface is the target of a dedicated branch.)

## Audit & operational events

Recorded via the existing sinks (both sanitize metadata):

* Audit (owner-scoped): `integration_oauth_started`, `integration_connected`,
  `integration_connection_failed`, `integration_token_refreshed`,
  `integration_refresh_failed`, `integration_disconnected`,
  `integration_revoke_failed`.
* Allowed metadata: provider, scope group, account id, provider email, status,
  error code, result. **Forbidden:** access/refresh tokens, authorization code,
  raw OAuth state, provider response bodies, secrets, and any external file/mail
  content.

## Environment variables

Set these to enable the Google connect flow (never commit real values):

```env
GOOGLE_OAUTH_CLIENT_ID=...          # also used by Google login
GOOGLE_OAUTH_CLIENT_SECRET=...      # authorization-code flow
GOOGLE_OAUTH_REDIRECT_URI=https://<api-host>/api/v1/integrations/google/callback/
```

With any unset, the Google provider reports `configuration_required` and the UI
shows **"Not configured"** — it never crashes.

## Frontend

`/dashboard/settings/integrations` (linked from Settings). Shows provider cards
with status, selectable scope groups (Gmail marked privacy-sensitive and never
pre-selected), connect/disconnect/check actions, and trust copy:

* "CertaNest will only access what you choose to connect."
* "Imports will be review-before-save — nothing is added automatically."
* "No automatic deletion and no write-back to your connected account."
* "Gmail is privacy-sensitive and is requested only if you explicitly choose it."

No imported-data UI exists yet.

---

# Google Drive Import V1

Manual, **import-only**, review-before-save import of selected Google Drive files
into CertaNest. Gated by `integrations` + `google_integrations` +
`google_drive_import` (all founder-only by default). Drive is accessed with the
read-only `drive` scope group (`drive.readonly`) from the OAuth foundation —
**no new scope is added**. CertaNest never modifies, deletes, shares, or writes
back to Drive; there is no sync and no background job.

## Workflow

Open Integrations → "Import from Google Drive" → search/browse your Drive files →
select files → choose a destination → **review** → import. Each file returns its
own result; one file's failure never aborts the batch.

## Provider methods (`apps/integrations/providers/google.py`)

Read-only, network isolated for mocking, size-capped, and never logging
tokens/bodies: `list_drive_files`, `get_drive_file_metadata`,
`download_drive_file` (binary `alt=media` or Google-native `export` to PDF), and
`build_drive_file_payload`. Only safe metadata is surfaced — `provider_file_id`,
`name`, `mime_type`, `size`, `modified_time`, `type_label`, `is_folder`,
`is_google_workspace_file`, `exportable`. **Never** web/icon links, download URLs,
permissions, tokens, or content.

## Supported types

Imports the existing upload allowlist: **PDF, JPEG/PNG, DOC/DOCX** (≤ 10 MB).
Google Docs/Sheets/Slides are **exported to PDF**. Every imported file goes
through the same `validate_secure_upload` (size → extension → declared MIME →
magic bytes → structure → malware-scan) and is **encrypted at rest** via the
existing envelope encryption. Folders, shortcuts, Forms, oversized, and other
types are rejected with a clear reason: `unsupported_type`, `too_large`,
`not_downloadable`, `export_not_supported`, `provider_error`, `storage_error`,
`limit_reached`, `scan_unavailable`, `invalid_file`.

## Destinations

Owner-scoped only in V1: **File Inbox** (loose file), **Vault** (new Document),
**a folder** (Vault + primary folder, user-owned), **an application pack** (Vault +
a new attached `FILE` requirement, user-owned). Plan + storage limits are enforced
via the existing `enforce_plan_limit` / `enforce_storage_limit` — imports are not
a bypass. Organization destinations (case/folder/pack) are **deferred** and return
`destination_not_supported`.

## API (`/api/v1/integrations/google-drive/`)

`GET files/` (search/list, safe metadata) · `GET destinations/` (owner-scoped
options) · `POST import/preview/` (advisory type/size validation, no download) ·
`POST import/` (download selected → validate → encrypt → save; per-file results).
No tokens, download URLs, or raw Google responses are ever returned. Throttles:
`google_drive_list`, `google_drive_import`.

## Permissions & privacy

A user imports only from **their own** connected account (`account_id` is
owner-scoped; another user's id → 404). A founder cannot import from a user's
Drive. Audit events (`google_drive_import_previewed/started/file_imported/
file_import_failed/completed`) and an operational event
(`source=google_drive_import`) record **safe counts/reasons only** — never tokens,
download URLs, raw Google responses, Drive/document content, or raw file ids.

## Built on this foundation

* **Google Drive Import V1** — manual, import-only import of selected Drive files
  (detailed above).
* **Google Calendar Import V1** — manual, read-only import of calendar events into
  CertaNest deadlines + reminders. See
  [integrations-google-calendar.md](integrations-google-calendar.md).
* **Gmail Import V1** — manual, import-only import of selected Gmail attachments
  (detailed below).

---

# Gmail Import V1

Manual, **import-only**, review-before-save import of **selected Gmail
attachments**. Gmail is the most privacy-sensitive integration, so V1 is
deliberately conservative. Gated by `integrations` + `google_integrations` +
`gmail_import` (all founder-only by default). Uses the read-only `gmail.readonly`
scope from the OAuth foundation, requested **only** when the user explicitly
chooses the Gmail scope group.

CertaNest **never** scans the inbox automatically, monitors it in the background,
reads or stores email **bodies/snippets**, writes back to Gmail (no
modify/delete/archive/label/send), or calls AI. There is no sync and no webhook.

## Workflow

Open Integrations → "Import from Gmail" → search (user-triggered, bounded) →
review safe message metadata (sender / subject / date / attachment list) → select
specific attachments → choose a destination → **review** → import. Per-attachment
results; one failure never aborts the batch.

## Provider methods (`apps/integrations/providers/google.py`)

Read-only, isolated for mocking, never logging tokens/bodies:
`search_gmail_messages` (ids only), `get_gmail_message` (`format=metadata` —
headers + part tree, **no body data**), `download_gmail_attachment` (base64url
decode, size-capped), plus `build_gmail_message_payload` which surfaces ONLY safe
metadata (provider_message_id, thread_id, from_display/from_email, subject, date,
and an attachment list of filename/mime/size/attachment_id). **Never** the body,
snippet, raw headers, tokens, download URLs, or attachment content.

## Search

User-triggered and bounded. `has:attachment` is always applied; optional query
text, `from:`, date range (`after:`/`before:`), and a `filename:` file-type
filter; default `has:attachment newer_than:1y`. No mailbox-wide auto-scan, no
background search, no body indexing, no AI.

## Supported attachment types & destinations

Same upload allowlist as the rest of CertaNest: **PDF, JPEG/PNG, DOC/DOCX**
(≤ 10 MB). Each selected attachment runs through `validate_secure_upload`
(size → extension → MIME → magic bytes → structure → malware-scan) and is
**encrypted at rest**. Reasons: `unsupported_type`, `too_large`, `empty_file`,
`not_downloadable`, `provider_error`, `storage_error`, `limit_reached`,
`scan_unavailable`, `invalid_file`, `already_imported`. Destinations are the same
owner-scoped set as Drive (File Inbox / Vault / user-owned folder / user-owned
pack); org destinations deferred. Plan + storage limits enforced.

## Duplicate / idempotency

`ImportedGmailAttachment` stores **salted hashes** of the Gmail message +
attachment ids (never raw ids) plus safe file metadata (filename/mime/size) —
**never** email content. Preview flags `already_imported`; import skips duplicates
by default. A user may explicitly `force` a re-import.

## API (`/api/v1/integrations/gmail/`)

`GET messages/` (search; safe metadata) · `GET messages/{id}/attachments/` ·
`GET destinations/` · `POST import/preview/` · `POST import/`. No tokens, raw
Gmail payloads, email bodies, or download URLs are ever returned. Throttles:
`gmail_list`, `gmail_import`.

## Permissions & privacy

A user imports only from **their own** connected account (`account_id`
owner-scoped → 404 otherwise); a founder cannot import from a user's Gmail. Audit
events (`gmail_import_search_performed/previewed/started`,
`gmail_attachment_imported/skipped/failed`, `gmail_import_completed`) and an
operational event (`source=gmail_import`) record **safe counts/reasons only** —
never tokens, raw Gmail responses, email bodies, snippets, subjects, attachment
content, or raw message/attachment ids.

## Deferred (not on the foundation yet)

Gmail body import · automatic inbox scanning/monitoring · scheduled imports ·
Gmail push/webhooks · Gmail labels/modify/archive/delete/send · AI email analysis ·
contact import · full email-to-case automation · automatic/background sync · folder
mirroring · two-way sync · Drive/Calendar webhooks · Google Picker UI · write-back ·
external deletion · external file previews · full Google app verification ·
Microsoft/Dropbox providers · provider re-auth UX · org-level / shared-Drive
destinations · integration scheduled jobs · founder integration health console.
