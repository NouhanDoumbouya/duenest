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
- **B2B Portals:** portal_person_created, portal_person_archived,
  portal_case_created, portal_case_status_changed, portal_case_archived,
  portal_case_pack_created, portal_case_room_created, portal_case_request_created.
  Recorded under category `system`, owner = the organization's owner user, actor =
  the acting member, with `metadata.org_id` for scoping.
- **B2B Review + Approval:** portal_review_started, portal_document_accepted,
  portal_document_rejected (severity `warning`), portal_document_needs_replacement,
  portal_recipient_notified. Same scoping (category `system`, owner = the org owner,
  actor = the acting member, `metadata.org_id`); metadata is limited to safe
  summaries (status_from / status_to, decision, request title, a short note
  summary) — never tokens, file URLs, or document contents.
- **Teams Plan + Portal Limits:** organization_plan_profile_created,
  organization_plan_changed, organization_portal_enabled,
  organization_portal_disabled, organization_portal_limit_reached. Recorded under
  category `system`, owner = the organization's owner user, with `metadata.org_id`
  for scoping. No plan secrets or billing tokens are stored.
- **B2B Bulk Reminder Emails:** portal_reminder_batch_created,
  portal_reminder_batch_sent, portal_reminder_recipient_sent,
  portal_reminder_recipient_skipped, portal_reminder_recipient_failed. Same scoping
  (category `system`, owner = the org owner, actor = the acting member,
  `metadata.org_id`); metadata is limited to safe keys (reminder_type, recipient /
  sent / skipped / failed counts, case id, reason category, result) — never a raw
  upload token, private file URL, storage key, document content, or full email body.
- **Organization Templates:** organization_template_created,
  organization_template_updated, organization_template_archived,
  portal_case_created_from_template, portal_template_pack_created,
  portal_template_room_created, portal_template_requests_created. Same scoping
  (category `system`, owner = the org owner, actor = the acting member,
  `metadata.org_id`); metadata is limited to safe keys (template_id, template_name,
  case_id, case_type, requirements_count, created_requests_count, result) — never a
  raw token, private file URL, storage key, document content, or email body.
- **Custom Document Organization:** document_folder_created, document_folder_updated,
  document_folder_archived, document_folder_moved, document_moved_to_folder,
  document_tag_created, document_tags_updated, document_collection_created,
  document_added_to_collection, document_removed_from_collection,
  organization_document_structure_updated, case_folder_created, person_folder_created,
  document_auto_filed. Recorded under category **`document`**, owner = the user who owns
  the documents (personal: the user; org: the org-owner user, with `metadata.org_id`),
  actor = the acting user. Metadata is limited to safe keys (folder / collection / tag
  id + name, document / case / person / organization id, tag_names, result) — never an
  R2 object key, file URL, public/sharing token, or document content. (Folders are
  virtual metadata over `Document` and never change a file's storage key.)
- **B2B Custom Fields and Statuses:** organization_custom_field_created,
  organization_custom_field_updated, organization_custom_field_archived,
  organization_custom_field_value_updated, organization_case_status_created,
  organization_case_status_updated, organization_case_status_archived,
  portal_case_custom_status_updated, default_case_statuses_seeded. Recorded under category
  `system`, owner = the organization's owner user, actor = the acting member, with
  `metadata.org_id` for scoping. **Privacy rule: a value update records only WHICH field
  keys changed (`changed_field_keys`), never the values themselves.** Metadata is limited
  to safe ids/keys/labels (field_id / field_key / field_label / field_type / target /
  status_id / status_key / status_label / case_id / person_id) — never a private file
  URL, public token, document content, or secret. (`field_key` / `status_key` /
  `changed_field_keys` were added to the metadata sanitizer's exact-match allow-list
  because they contain the substring "key"; they hold machine keys, never secret values.)

The **Organization Dashboard V1** (`GET …/portal/dashboard/`, §41) is a **reader**,
not a writer, of this log: its recent-activity feed reads the most recent **safe**
portal audit events for the org (filtered via `metadata.org_id`, returning only
`event_type` / `severity` / `object_label` / `related_object_label` / `actor_label`
/ `created_at` — no tokens, URLs, or content). Opening the dashboard itself records
**no event** (deliberate — read-only dashboard views are not logged, so the feed
stays free of noisy per-view entries).

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
titles, `due_date`, `result`, and `reason_category`. (`recipient_count` is on the
exact-match allow-list because the substring "ip" would otherwise drop it through
the forbidden-substring filter. Likewise `field_key` / `status_key` /
`changed_field_keys` are on the exact-match allow-list because they contain the
substring "key" — they hold machine keys, never secret values.)

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
