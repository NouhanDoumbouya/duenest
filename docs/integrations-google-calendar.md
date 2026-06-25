# Integrations — Google Calendar Import V1

Manual, read-only, review-before-save import of Google Calendar events into
CertaNest deadlines + reminders. Built on top of the OAuth Foundation
(`apps/integrations`, see [integrations.md](integrations.md)).

> **Scope is deliberately narrow.** This is **import-only**. There is no automatic
> sync, no scheduled import, no webhooks, and CertaNest **never** creates, edits,
> or deletes events in Google Calendar (no write-back). No AI is involved — event
> selection and deadline classification are entirely manual.

## How an event becomes a CertaNest deadline

CertaNest reminders are **document-anchored**: a `DocumentReminderRule` always
belongs to a `Document` and takes its date from that document's
`expiry_date`/`renewal_date` — there is no free-form/standalone reminder. So each
imported event becomes:

1. a **new, fileless "deadline" `Document`** — `title` = the event's (sanitized)
   summary, `expiry_date` = the event's date, a generic `"Imported from Google
   Calendar."` note. No file is attached.
2. a **`DocumentReminderRule`** on that document — `on_expiry` (fires on the event
   date) by default, or `before_expiry` with a chosen lead when "remind me N days
   before" is set.

This reuses the real reminder services, so the imported deadline behaves
identically to a hand-made one: it appears in **Life Radar** and the **reminders**
page automatically, and it counts toward plan limits.

Because it creates a Document **and** a reminder, each imported event consumes one
`documents` slot and one `reminders` slot. Both limits are enforced per event
(never bypassed); an event that would exceed a limit fails with
`plan_limit_reached` while the rest of the batch continues.

## Destinations

| Destination | V1 | Notes |
|---|---|---|
| Personal deadline + reminder (`deadline`) | ✅ available | The only fully-supported destination. |
| Attach to an existing document | ⏳ deferred | Would either ignore the event date or overwrite a real document's expiry — unsafe, so deferred. |
| Organization case / pack / application deadline | ⏳ deferred | Returned as unavailable; org/case attachment is a later branch. |

The `destinations/` endpoint reports availability honestly so the UI never offers
a destination that isn't wired up.

## Duplicate detection / idempotency

`ImportedCalendarEvent` (in `apps/integrations`) records each imported event,
unique on `(owner, provider, provider_calendar_id, provider_event_id)`. It stores
only safe identifiers, a sanitized title, the event date, and FKs to the created
document/reminder (`SET_NULL`) — **never** a description, attendees, or raw
payload.

* Re-importing the same event is **skipped by default** (`already_imported`); the
  events list and preview flag already-imported events.
* A concurrent double-submit is caught by the DB unique constraint and reported as
  `skipped`, not a duplicate deadline.
* Forced re-import is **not** offered in V1.

## Recurring events

Events are listed with `singleEvents=true`, so a recurring series is expanded into
concrete dated instances. A selected instance imports as a normal one-off
deadline; when any recurring instance is imported the response includes the
warning *"Recurring events were imported as single one-off deadlines."* Series
expansion / "import the whole series" is deferred.

## API endpoints (`/api/v1/integrations/google-calendar/`)

| Method | Path | Purpose |
|---|---|---|
| GET | `destinations/` | Destination options for the picker (only `deadline` available in V1) |
| GET | `calendars/?account_id=` | The account's calendars (safe metadata only) |
| GET | `events/?account_id=&calendar_id=&time_min=&time_max=&query=&page_token=` | Upcoming events (single instances) + `next_page_token`, each annotated `already_imported` |
| POST | `import/preview/` | Classify selected events into importable / already-imported / invalid (no writes) |
| POST | `import/` | Import selected events; per-event success/skip/failure |

Import request/response shapes are in [api-spec.md](api-spec.md).

## Permissions & gating

* Requires the signed-in user plus all three flags: `integrations`,
  `google_integrations`, `google_calendar_import` (all default founder-only).
* A user can only act on **their own** connected Google account (`account_id` is
  owner-scoped; another user's id returns `404`).
* Public/unauthenticated users cannot import. Founders **cannot** import from a
  user's calendar from the founder console — these endpoints are user-scoped only.

## Security & privacy

* **Tokens** are read on demand from the encrypted `ConnectedIntegrationAccount`
  (AES-256-GCM envelope) and used only as a bearer header to Google. They are
  never returned to the frontend, never logged, and never placed in audit or
  operational metadata. An expired access token is refreshed once via the existing
  `services.refresh_account`; a failed refresh surfaces `reconnect_required`.
* **No raw Google API bodies** are stored. Provider responses are shaped into
  narrow safe payloads (`build_calendar_payload` / `build_event_payload`) that
  drop descriptions, attendees, conference/Meet links, htmlLink, and extended
  properties. Only title, date, all-day flag, location, status, updated time, and
  a recurring flag survive.
* **No event descriptions** are stored anywhere — not on the deadline document’s
  metadata, not in `ImportedCalendarEvent`, not in logs.
* The Google Calendar scope is **`calendar.readonly`** — already declared in the
  OAuth foundation's `calendar` scope group. No new or broader scope is requested,
  and no write scope exists.

## Audit & operational events

Recorded via the existing sinks (both sanitize metadata):

* **Audit** (owner-scoped, `documents` category): `google_calendar_import_previewed`,
  `google_calendar_import_started`, `google_calendar_event_imported`,
  `google_calendar_event_import_skipped`, `google_calendar_event_import_failed`,
  `google_calendar_import_completed`. Metadata uses allow-listed keys only
  (`action`, `status`, `count`, `skipped_count`, `failed_count`).
* **Operational** (founder-facing, `security` category): sources
  `google_calendar_list`, `google_calendar_import_preview`, `google_calendar_import`
  with safe counts + `destination_type` + reason/error codes.

## Environment variables

No new variables. Calendar import reuses the OAuth foundation's Google config
(`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` /
`GOOGLE_OAUTH_REDIRECT_URI`) and the existing `calendar.readonly` scope group.
With any unset, listing returns `not_configured` and the UI shows a clear notice
(it never crashes).

## Frontend

`/dashboard/settings/integrations/google-calendar` (linked from the Integrations
settings page once a Google account is connected). States handled: not-connected,
connected, reconnect-required, not-configured, loading calendars, empty calendar
list, loading events, empty event list, import in progress, completed, partial,
failed. Trust copy is shown throughout:

* "Import selected events only."
* "CertaNest will not create, edit, or delete events in Google Calendar."
* "No automatic sync is enabled."
* "Imported events become CertaNest reminders/deadlines after you confirm."
* "Event descriptions are not stored — only the title and date."

## Deferred (not in this branch)

Attach-to-existing-document destination · organization/case/pack/application
destinations · recurring-series expansion · automatic/background sync · scheduled
import · calendar webhooks · write-back / external event edits or deletion · AI
deadline detection or calendar summarization · Gmail import · Google Drive import.
