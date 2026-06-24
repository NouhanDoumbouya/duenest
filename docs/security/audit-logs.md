# Security — Audit Logs V1

## What this is (and isn't)

A unified, **owner-scoped** audit log that records security-relevant document and
sharing events so a user can answer *"who uploaded/opened/downloaded this, who
accepted a request, when was a room revoked?"* It is **append-only** and
**deterministic — no AI call, no AI credits**. It is **not** a public access log,
**not** a legal/compliance attestation, and **not** a replacement for the existing
per-feature activity trails.

It is a **new** model (`AuditLogEntry`, `apps/documents/models.py`, migration
`documents/0038_auditlogentry`), distinct from and not replacing the existing
trails (`DocumentFileActivity`, `RoomActivity`, `DocumentActivity`,
`QuickShareActivity`, `ProductEvent`), which are unchanged. Service layer:
`apps/documents/audit.py`.

## Owner-only access

- All endpoints require authentication and return **only the requesting user's
  own entries**: `GET /api/v1/audit-logs/`, `GET /api/v1/audit-logs/{id}/`,
  `GET /api/v1/audit-logs/summary/`.
- **Public actors can never read the audit log** — there is no public route.
- The owner-only UI is `/dashboard/security/audit` (list + filters + detail
  drawer + 30-day summary). No public UI.

## Event catalog (V1)

Only security-relevant **access/change** events are logged. Read-only dashboard
reads are **not** logged.

- **Document Requests:** created, email_sent, opened (public), file_uploaded
  (public), accepted, rejected, needs_replacement, cancelled, saved-to-vault,
  requirement satisfied (attach-to-pack).
- **Sharing Rooms:** created, opened (public), file previewed (public), file
  downloaded (public), item added, item removed, revoked, archived.
- **Protected Copies:** created, generated, failed, added_to_room, archived.
- **Applications / Packs:** application_created, application_status_changed,
  pack_created, pack_requirement_satisfied.

Public-route events are recorded with `actor_type` `public_link` (an anonymous
visitor), via `record_public_link_event`.

## Privacy rules (the point of this module)

### Never logged

Document contents, extracted text, private file URLs, raw storage keys, raw
public tokens, passwords/secrets, passport/ID numbers, AI prompts/responses, and
raw email bodies are **never** stored.

### Salted-hash network fingerprints

- IP address and user-agent are stored **only** as a salted SHA-256 hash
  (`hash_request_fingerprint`, using the `AUDIT_LOG_HASH_SALT` setting — env-backed
  with a development fallback). They are **never** stored in plaintext, and the
  model has no raw IP or user-agent columns at all.
- The API serializer **excludes `ip_hash` / `user_agent_hash` entirely** — the
  hashes are server-side only.
- `country_code` comes from a **CDN edge header** (no IP geolocation), so it is
  safe to store and is returned.

### Metadata sanitization

Event metadata is sanitized at write time by `safe_audit_metadata`: any key whose
name looks sensitive (url / token / storage / key / content / password / etc.) is
dropped through a forbidden-substring filter with a small exact-match allow-list,
and sizes/counts are capped. Allowed metadata is limited to safe values such as
`status_from` / `status_to`, file name/title, request/room/pack/application
titles, `due_date`, `result`, and `reason_category`.

## Best-effort (non-breaking)

`record_audit_event` is wrapped in try/except: a logging failure logs a
server-side warning and returns `None` — it **never raises**, so it can never
break the user action it is recording (same philosophy as transactional email and
AI metering).

## Data model — `AuditLogEntry`

`owner`; `actor_user` (nullable, `SET_NULL`); `actor_type`
(`owner` / `authenticated_user` / `public_link` / `system`); `actor_label`;
`event_type`; `category` (`document` / `file` / `document_request` /
`sharing_room` / `protected_copy` / `application` / `pack` / `security` /
`system`); `severity` (`info` / `warning` / `critical`); `object_type` /
`object_id` / `object_label`; `related_object_type` / `related_object_id` /
`related_object_label`; `ip_hash`; `user_agent_hash`; `country_code`; `metadata`
(JSON); `created_at`.

## API surface

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/audit-logs/` | List owner entries, newest first, paginated. Filters: `category`, `event_type`, `severity`, `object_type`, `object_id`, `date_from`, `date_to`, `search` (safe labels only). |
| `GET` | `/api/v1/audit-logs/{id}/` | Retrieve one owner-scoped entry. |
| `GET` | `/api/v1/audit-logs/summary/` | 30-day counts: `total_events_30d`, `public_link_events_30d`, `downloads_30d`, `uploads_30d`, `critical_events_30d`. |

Returned fields are safe-only and exclude the IP/UA hashes. See
`docs/api-spec.md` §37 for the full response shape.

## Future work

- B2B audit exports.
- A retention policy / automatic purge (V1 keeps entries **indefinitely**).
- Broader event coverage across more features.

See also `docs/security-plan.md` (Audit Logs V1), `docs/api-spec.md` §37,
`docs/PUBLIC_LINK_SECURITY.md`, and `docs/security/public-upload-links.md`.
