# B2B Portals MVP

An organization-facing **portal workspace** for managing people
(clients / students / applicants / employees) and their document **cases**.
Delivered **2026-06-24** on `b2b/portals-mvp` (backend complete + tested).

## What this is (and isn't)

The portal gives an organization one place to track **who** they are helping
(`PortalPerson`) and **what document case** is in progress for each person
(`PortalCase`) — a visa application, a scholarship file, employee onboarding, a
compliance check, a client file, and so on. From a case, a member can spin up the
document workflow (a checklist, a secure workspace, document requests), watch
deterministic progress, and work a review queue of uploads waiting on them.

It is explicitly an **MVP that orchestrates existing primitives**. It is **not**:

- a second upload system,
- a second sharing-room system,
- a second document-request system,
- an AI feature (it makes **no AI call** and consumes **no AI credits**), or
- a public-facing portal (it adds **no new public route**).

## Convergence decision

The whole point of this MVP is **reuse**. Rather than building a parallel B2B
stack, B2B Portals composes systems that already exist and are already tested.

### Reused

| Need | Reused primitive |
| --- | --- |
| Workspace + permissions | `Organization` + `OrganizationMembership` (roles owner / admin / member / viewer) |
| Case checklist + progress/readiness | `DocumentBundle` + `DocumentBundleRequirement` (`bundle_readiness`) |
| Case secure workspace | `SharingRoom` |
| Collect each document (recipient defaults to the case person; satisfies a pack requirement on acceptance) | `DocumentRequestLink` |
| Application/renewal lifecycle | `TrackedApplication` |
| Security/access event log | `AuditLogEntry` (unified audit logs) |

### Added (minimal)

Three new models in `apps/organizations` (migration `organizations/0005_*`):

- `PortalPerson`
- `PortalCase`
- `PortalCaseDocumentRequest` (a join linking a case to a `DocumentRequestLink`
  and a `DocumentBundleRequirement`)

### Left untouched (parallel / legacy)

The older or parallel organization systems are **not migrated, replaced, or
deleted** in this branch — they remain as-is:

- `OrganizationSecureRoom`
- `OrganizationDocument`
- the org-side `DocumentRequest` / collection campaigns
- the older personal `ShareRoom`

## Relationship to Sharing Rooms, Document Request Links, and packs

A portal **case** is a thin coordinator over the per-user document primitives:

- **`create-pack/`** creates and links a `DocumentBundle` — the case's checklist.
  Requirement satisfaction and the readiness score come straight from the existing
  `bundle_readiness`.
- **`create-room/`** creates and links a `SharingRoom` — the case's secure shared
  workspace. The recipient experience is the unchanged public Sharing Room page at
  `/room/{token}`.
- **`create-request/`** creates a `DocumentRequestLink` to collect a single
  document. The recipient defaults to the case's person, and on acceptance the
  upload can satisfy a pack requirement (recorded via `PortalCaseDocumentRequest`).
  The recipient uploads through the unchanged public page at
  `/document-request/{token}`.

So a case **points at** a bundle, a room, and a set of request links — it does not
re-implement any of them.

## Ownership model and organization-governed limits

The document primitives stay **User-owned** (no organization FK). Organization
access to a case is gated by **membership**, not by primitive ownership.

As of **Teams Plan + Portal Limits V1** (see below), a case's **room / request**
are owned by **one consistent user — the organization owner** (`_case_owner`
resolves to the org owner) and created with `enforce_limit=False`. So they
**no longer count against the creating member's personal plan limits** — the
acting member is still recorded as `created_by` / audit actor, but the resources
are governed by the **organization's plan**. This fixes the prior MVP's
personal-limit leak.

> **Remaining limitation.** A case's **pack** (`DocumentBundle`) and its uploaded
> files are still owned by the org-owner account and counted under that account's
> personal storage/file limits — org-owned storage is future work.

### Teams Plan + Portal Limits V1 (delivered 2026-06-24)

Portal resources (member seats, people, cases, document requests, sharing rooms)
are now governed by the **organization's plan**, via a new
`OrganizationPlanProfile` (`apps/organizations/models.py`, migration
`organizations/0006_organizationplanprofile`; OneToOne → `Organization`):
`plan` (`free` / `pro` / `teams_beta` / `teams` / `enterprise`), `status`,
`portal_enabled`, and optional per-org override caps (null = use the plan
default). **An org with no profile has portals disabled.** **Deterministic — no
AI. No live Stripe** (a plan is activated by a founder/beta command, not by
checkout).

Plan defaults live in one place — `apps/organizations/portal_limits.py`
(`ORG_PORTAL_PLAN_LIMITS`; `None` = unlimited):

| Plan | portal_enabled | members | portal_people | active_portal_cases | active_document_requests | active_sharing_rooms |
| --- | --- | --- | --- | --- | --- | --- |
| free / pro | no | 0 | 0 | 0 | 0 | 0 |
| teams_beta | yes | 5 | 100 | 50 | 200 | 50 |
| teams | yes | 10 | 500 | 250 | 1000 | 250 |
| enterprise | yes | unlimited | unlimited | unlimited | unlimited | unlimited |

**Two gates:** the `b2b_portals` feature flag controls **beta exposure** (`503
feature_disabled` when off); the org entitlement controls **actual usage** (`403
portal_not_enabled` when the org isn't on a Teams plan). Over-limit creates return
`403 organization_plan_limit_exceeded` (distinct from the personal
`plan_limit_exceeded`), enforced via `enforce_organization_portal_limit(org,
resource)` before each create; the member-seat cap is enforced on org invites
(active members + pending invites) when the org is on a Teams plan.

**Limits endpoint:** `GET /api/v1/organizations/{org_id}/portal/limits/` →
`{plan, portal_enabled, limits, usage, remaining}`, readable by **any member**
even when disabled (so the UI can show the paywall). Usage is org-wide but
portal-scoped only (never a member's unrelated personal rooms/requests); terminal
/ archived states free a slot.

**Activation (founder/beta — no Stripe):**

```bash
python manage.py set_organization_plan --org-id <id> --plan teams_beta \
  [--portal-enabled true|false] [--status active|trialing|disabled|cancelled]
```

This creates/updates the profile and records audit events. No new plan resource
on the personal billing layer was added and Stripe/billing is untouched — Teams
billing checkout / per-seat Stripe / invoices are future work
(`b2b/teams-billing-checkout`). See `docs/api-spec.md` §39 and `docs/BILLING.md`.

## Organization permission behaviour

- Every portal endpoint requires **authentication** and **membership** of the
  target organization.
- **Reads** are open to any member of that organization.
- **Writes** (create / update / archive people and cases, create pack / room /
  request) require an **admin or owner** role (`require_role(ADMIN_ROLES)`).
- **Org isolation:** a member only ever sees and acts on their own organization's
  people and cases.
- The entire surface is behind the **founder-only feature flag** `b2b_portals`
  (default `FOUNDER_ONLY`); when the flag is off for the user, the endpoints
  return `503`.
- There is **no public portal route**. Recipients continue through the existing
  `/document-request/{token}` and `/room/{token}` public pages.

## Endpoint surface

All under `/api/v1/organizations/{org_id}/portal/` (authenticated, member-scoped,
feature-gated; writes require admin/owner). Full request/response shapes are in
`docs/api-spec.md` §38.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/summary/` | Dashboard counts |
| `GET` | `/dashboard/` | Organization Dashboard V1 — operational metrics + action queues + plan usage (read-only) |
| `GET` `POST` | `/people/` | List / create people |
| `GET` `PATCH` | `/people/{id}/` | Retrieve / update a person |
| `POST` | `/people/{id}/archive/` | Archive a person |
| `GET` `POST` | `/cases/` | List / create cases |
| `GET` `PATCH` | `/cases/{id}/` | Retrieve / update a case |
| `POST` | `/cases/{id}/archive/` | Archive a case |
| `POST` | `/cases/{id}/create-pack/` | Create + link a `DocumentBundle` |
| `POST` | `/cases/{id}/create-room/` | Create + link a `SharingRoom` |
| `POST` | `/cases/{id}/create-request/` | Create a `DocumentRequestLink` |
| `GET` | `/cases/{id}/progress/` | Deterministic per-case progress |
| `GET` | `/review-queue/` | Case requests with an upload awaiting review (filterable; admin-decided) |
| `GET` | `/cases/{id}/review-items/` | Review items for one case |
| `POST` | `/cases/{id}/requests/{rid}/start-review/` | Mark an item `under_review` (admin) |
| `POST` | `/cases/{id}/requests/{rid}/review/` | Accept / reject / needs_replacement (admin) |
| `GET` | `/cases/{id}/requests/{rid}/decisions/` | Append-only decision history |
| `GET` | `/cases/{id}/requests/{rid}/file/preview/` `…/file/download/` | Stream the decrypted uploaded file (org-scoped proxy) |
| `GET` | `/limits/` | Org plan, `portal_enabled`, limits / usage / remaining (any member, even when disabled) |

The dashboard `summary` returns `people_total`, `active_cases`,
`people_waiting_for_documents`, `uploads_needing_review`, `overdue_cases`,
`ready_cases`, and `blocked_cases`.

Per-case `progress` is computed deterministically from the linked pack's
requirements (total / satisfied / missing / `readiness_score` via
`bundle_readiness`) and the case's document-request statuses (total / uploaded /
accepted / needs_replacement / uploads_needing_review), plus a `suggested_status`
(`waiting_for_review` if uploads are pending review; `ready` if all required
requirements are satisfied; otherwise `collecting_documents`). The review queue
lists case requests in `UPLOADED` / `UNDER_REVIEW`.

## Data model

- **`PortalPerson`** — `organization`, `created_by`, `full_name`, `email`,
  `phone`, `person_type` (`client` / `student` / `applicant` / `employee` /
  `family_member` / `other`), `status` (`active` / `waiting_for_documents` /
  `under_review` / `completed` / `archived`), `notes`, `archived_at`.
- **`PortalCase`** — `organization`, `person`, `created_by`, `title`, `case_type`
  (`visa` / `scholarship` / `admission` / `employee_onboarding` / `compliance` /
  `client_file` / `general`), `status` (`draft` / `collecting_documents` /
  `waiting_for_review` / `ready` / `submitted` / `completed` / `blocked` /
  `archived`), `priority` (`low` / `normal` / `high` / `urgent`), `due_date`,
  `linked_bundle` / `linked_application` / `linked_room` (all `SET_NULL` FKs to the
  `apps.documents` primitives), `notes`, `archived_at`.
- **`PortalCaseDocumentRequest`** — `case`, `document_request`
  (`DocumentRequestLink`), `requirement` (`DocumentBundleRequirement`); plus the
  **Review + Approval** metadata added in `0007`: `review_status` (`pending_upload`
  / `uploaded` / `under_review` / `accepted` / `rejected` / `needs_replacement` /
  `cancelled`, mirroring the linked link status), `reviewed_by`, `reviewed_at`,
  `review_note`, `rejection_reason`, `last_submitted_at`, `decision_count`.
- **`PortalCaseReviewDecision`** — append-only decision history: `case_request`,
  `organization`, `case`, `document_request`, `decision`, `note`, `decided_by`,
  `decided_at`, `previous_status`, `new_status`, `notified_recipient`.

Migrations: `organizations/0005_*` (MVP) and
`organizations/0007_portalcasereviewdecision_and_more` (Review + Approval).

## Audit

Portal events are recorded through the unified Audit Logs (`record_audit_event`,
category `system`, owner = the organization's owner user, actor = the acting
member, `metadata.org_id` for scoping):

`portal_person_created`, `portal_person_archived`, `portal_case_created`,
`portal_case_status_changed`, `portal_case_archived`, `portal_case_pack_created`,
`portal_case_room_created`, `portal_case_request_created`, and the **Review +
Approval** events `portal_review_started`, `portal_document_accepted`,
`portal_document_rejected` (severity `warning`),
`portal_document_needs_replacement`, `portal_recipient_notified`.

No document contents, tokens, or file URLs are stored (the same privacy rules as
the rest of Audit Logs V1 — see `docs/security/audit-logs.md`).

## Review + Approval (delivered 2026-06-25)

`b2b/review-approval-workflow` closes the loop: staff **review uploaded documents
and decide accept / reject / needs-replacement** from the review queue. Like the
rest of B2B Portals it **builds on Document Request Links + packs** and adds **no
duplicate upload, request-link, or sharing-room system**. Fully **deterministic —
no AI, no AI credits.**

### Workflow

A recipient uploads through the existing Document Request Link
(`/document-request/{token}`) → the upload appears in the org **review queue** →
a staff member opens the item, previews/downloads the uploaded file (org-scoped
secure proxy), and chooses **Accept / Reject / Needs-replacement** with a note →
the decision drives the **same** Document Request Link's accept / reject /
needs_replacement service functions → on **Accept** the linked pack requirement is
satisfied (via the existing attach-to-pack flow) and case progress recomputes → a
decision record + audit event are written → the recipient may optionally be emailed
for reject / needs-replacement.

### Statuses and rules

The item's `review_status` is one of `pending_upload` (no file yet) → `uploaded`
(awaiting review) → `under_review` (staff started) → `accepted` / `rejected` /
`needs_replacement` (or `cancelled`). It **mirrors the linked `DocumentRequestLink`
status, which stays authoritative.**

- A document **cannot be accepted without an uploaded file**.
- **Accept satisfies** the linked pack requirement; **reject does not**.
- **Needs-replacement reopens** the existing Document Request Link, so the
  recipient can re-upload, returning the item to the queue.
- Case progress recomputes after each decision (`suggested_status`:
  `waiting_for_review` when uploads are pending, `ready` when all required
  requirements are satisfied, else `collecting_documents`).

### File access (org-scoped proxy, no storage URL)

The uploaded file is an encrypted `DocumentFile` owned by the **org owner**. Since
a reviewing admin may be a different user, the personal `/api/v1/files/{id}/download/`
route would `404` for them — so review uses an **org-scoped secure proxy** that
streams the **decrypted bytes** (`.../file/preview/` and `.../file/download/`),
authenticated, org-member-gated, permission-first. **Never a raw storage URL or
token.**

### Recipient notification

Opt-in via `notify_recipient`, only on **reject / needs-replacement**, and only
when the request has a recipient email. It uses the shared branded-email path
(`send_branded_email`, template `portal_review_decision`, category transactional)
and carries the request title + reason + (for needs-replacement) the recipient's
own public upload-page link — **never** a private file URL, storage key, raw token,
or document content. See `docs/NOTIFICATIONS.md`.

### Permissions

Reading the review queue / case review items / the uploaded file = **any active
org member**; **making a decision** (start-review, accept, reject,
needs-replacement) = **admin/owner only** (`require_role(ADMIN_ROLES)`). Org
isolation, the Teams entitlement gate, and the `b2b_portals` feature flag still
apply.

### Data model added

`PortalCaseDocumentRequest` is **extended** with review metadata — `review_status`,
`reviewed_by`, `reviewed_at`, `review_note`, `rejection_reason`,
`last_submitted_at`, `decision_count` — and a new append-only
**`PortalCaseReviewDecision`** records each decision (case_request, organization,
case, document_request, decision, note, decided_by, decided_at, previous_status,
new_status, notified_recipient). Migration
`organizations/0007_portalcasereviewdecision_and_more`. Endpoints and shapes are in
`docs/api-spec.md` §40.

## Organization Dashboard (delivered 2026-06-25)

`b2b/organization-dashboard-v1` adds the portal's **operational command center**: a
single **read-only** endpoint (`GET …/portal/dashboard/`) that does one
deterministic READ over the existing portal data and returns operational
**metrics**, a handful of small **action queues**, and the org's **plan usage** —
so staff immediately know what to act on next. Fully **deterministic — no AI, no AI
credits, no storage/R2 reads, no file decryption.** Service:
`apps/organizations/portal_dashboard.py`.

### What it shows

* **Metrics** (deterministic aggregate queries) — people totals, case-status counts
  (`active` / `draft` / `collecting_documents` / `waiting_for_review` / `ready` /
  `submitted` / `completed` / `blocked` / `archived`), overdue and due-soon cases,
  document-request counts (active / needing-review / accepted / rejected /
  needs-replacement, by the **authoritative** `DocumentRequestLink` status), active
  and expiring sharing rooms, missing required documents, and operational-health
  signals (`readiness_average`, `percent_cases_ready`,
  `percent_cases_blocked_or_overdue`). The due-soon / expiring window is **7 days**.
* **Action queues** — `review_now`, `overdue_cases`, `missing_documents` (with up to
  5 requirement **titles** only), `needs_replacement`, `ready_cases`, and
  `recent_activity`. Each queue is hard-capped at **8** items (`recent_activity` at
  **10**); every `action_url` is a **relative app route**, never a public token or
  file URL.
* **Plan usage** — the **same** `build_organization_limit_payload` output returned by
  the limits endpoint (plan / `portal_enabled` / limits / usage / remaining).

### Read-only, reuses existing systems, adds no duplicates

It **reuses** the Teams plan/usage/limits payload (`build_organization_limit_payload`),
per-case readiness (`compute_case_progress`, only on the ≤ 8 returned queue cases),
and the unified Audit Log (recent activity, filtered to the org via
`metadata.org_id`). It introduces **no new model, no migration, and no duplicate
upload / request-link / sharing-room system**. There are **no writes**, and opening
the dashboard records **no audit event** (deliberate — avoids noisy per-view logs).

### Privacy guarantees

Returns only safe operational fields — **never** document contents, raw public
tokens, private file URLs, or storage keys. The uploaded-file proxy routes are
**not** surfaced on the dashboard (review-only). Any active org member may read;
non-members are denied; both the `b2b_portals` flag and the org Teams entitlement
still gate it. Full response shape is in `docs/api-spec.md` §41.

## Bulk Reminder Emails (delivered 2026-06-25)

`b2b/bulk-reminder-emails` lets staff turn the dashboard's operational queues into a
**controlled batch of branded reminder emails** to the recipients who must upload,
replace, or complete documents. It builds directly on the dashboard queues and
**Document Request Links** — it **reuses, never duplicates** the existing primitives
(`PortalPerson` / `PortalCase` / `PortalCaseDocumentRequest` / `DocumentRequestLink`,
the shared `send_branded_email` helper, and the unified Audit Log) and adds **no new
upload / request-link / sharing-room / email system**. Fully **deterministic — no AI,
no AI credits.** Service: `apps/organizations/portal_reminders.py`.

### Reminder types

* **`missing_documents`** — active cases with unsatisfied required pack requirements
  → the case person; includes up to **5** short missing requirement **titles** (titles
  only).
* **`overdue_requests`** — case requests whose `DocumentRequestLink` is still active
  and past `due_date` / `expires_at` → the request recipient (or case person); action
  link = the public upload page.
* **`needs_replacement`** — link status `needs_replacement` → the recipient; reopened
  upload link; includes a sanitized review reason.
* **`rejected_documents`** — link status `rejected` → the recipient; includes a
  sanitized reason.
* **`due_soon_cases`** — active cases due within **7 days** (excluding ready /
  submitted) → the case person.
* **`collecting_documents`** — active cases with missing required requirements **and**
  an active request → the case person.

### Preview → send flow

1. **Preview** (`GET …/portal/reminders/preview/?reminder_type=…`) returns recipient
   candidates with safe context plus `recently_reminded` / `eligible` / `skip_reason`
   (`""` | `no_email` | `recently_reminded`). Recipients with no email are ineligible.
2. **Create a batch** (`POST …/portal/reminders/batches/`) from the selected
   `candidate_id`s — the candidates are **recomputed server-side** (the client only
   echoes ids). With `send_now` it sends immediately; otherwise it stays a `draft` for
   `/send/`. Batches can also be listed, fetched with per-recipient outcomes, sent,
   and cancelled.
3. **Recipient selection** is via `selected_candidate_ids` (omit to select all current
   candidates); the batch is capped at **200** recipients.

Action links are recipient-facing only: the public upload page
(`/document-request/{token}`, only when the link can still accept an upload) or the
case Sharing Room page (`/room/{token}`, only when the room is open) — never a private
file URL or storage key. When no safe link exists, the email says the requester will
follow up.

### Cooldown

The same `reminder_type` is **not re-sent to the same recipient for the same
case/request within 3 days** (`COOLDOWN_DAYS`); those recipients are skipped with
reason `recently_reminded`. Staff may override with `override_recent_reminders=true`.
The cooldown is **re-checked at send time**, not only at preview, using
`PortalReminderRecipient` history as the source of truth.

### Email privacy rules

The branded `portal_bulk_reminder` email (category `transactional`) carries only
CertaNest branding, the organization/requester name, the reason, the requested
document(s) / case context, the due date, an action button **only when a safe public
link exists**, an optional staff `message_intro`, and a privacy note. It **never**
includes private file URLs, storage keys, document contents, or internal staff notes.
It respects `SuppressedEmail` + one-click unsubscribe and is logged in `EmailLog`.
Sending is best-effort per recipient — one suppressed/failed recipient never fails the
batch (`sent` / `partially_failed` / `failed`).

### Permissions

Preview / list / detail = any **active org member**; create / send / cancel =
**OWNER/ADMIN** only; non-members denied. Both the `b2b_portals` flag and the org
Teams entitlement still gate it. No public endpoint. New models
`PortalReminderBatch` / `PortalReminderRecipient` (new org migration). Full contract
and the five `portal_reminder_*` audit events are in `docs/api-spec.md` §42.

## Organization Templates (delivered 2026-06-25)

`b2b/organization-templates` lets an org define a **reusable case workflow once** and
create a portal case from it **in one step** — saving staff from re-entering the same
case type, title, priority, due offset, checklist, and pack/room/request choices every
time. Applying a template is **pure orchestration** over the existing primitives: it
reuses `create_portal_case` / `create_case_pack` / `create_case_room` /
`create_case_document_request` and adds **no second pack, room, request, or upload
system**. Templates are **configuration only** — they store **no document contents,
files, tokens, or recipient data**. Fully **deterministic — no AI, no AI credits.**
Service: `apps/organizations/portal_templates.py`.

### Data model

Two new models (`apps/organizations/models.py`, migration `organizations/0009_*`):

- **`OrganizationCaseTemplate`** — `organization`, `created_by`, `name`,
  `description`, `case_type`, `default_case_title` (supports the `{person_name}`
  placeholder), `default_priority`, `default_due_days`, `auto_create_pack`
  (default `true`), `auto_create_room` (default `true`), `auto_create_requests`
  (default `false`), `default_room_title`, `default_room_description`, `status`
  (`active` / `archived`), `archived_at`, timestamps.
- **`OrganizationCaseTemplateRequirement`** — `template`, `title`, `instructions`,
  `required`, `sort_order`, `request_message`, `due_days_offset`,
  `accepted_file_types` (an **advisory** JSON list, **not enforced in V1**),
  timestamps.

The same migration also **adds three `PortalCase.CaseType` values** —
`insurance_claim`, `grant`, `internship` — so those template case types round-trip;
an unknown `case_type` falls back to `general` on apply.

### Create-case-from-template workflow

`POST …/portal/templates/{id}/create-case/` with body `{person_id, title?, due_date?,
create_pack?, create_room?, create_requests?, send_request_emails?,
selected_requirement_ids?}` (omitted toggles fall back to the template's
`auto_create_*` defaults). The service:

1. **Validates** membership/role + the template is active + the template and person
   both belong to the org.
2. **Creates the `PortalCase`** — title from `default_case_title` (with
   `{person_name}` substituted) or the override; due date from the `due_date`
   override or the `default_due_days` offset; `case_type` + `priority` from the
   template. This step **enforces the active-case org limit** and is the only **hard
   blocker** (it raises the structured `organization_plan_limit_exceeded` 403 before
   anything is created).
3. **Optional pack** — reuses `create_case_pack`, then **enriches** each created
   requirement with its instructions / due date / sort order (which
   `create_case_pack` does not carry).
4. **Optional sharing room** — reuses `create_case_room`, applying the template's
   room title/description.
5. **Optional document requests** — one `DocumentRequestLink` per selected
   requirement (recipient = the case person, instructions = `request_message` or
   `instructions`, due = `due_days_offset` offset), linked to the matching pack
   requirement via `PortalCaseDocumentRequest`.

The result is `{case, pack_created, room_created, created_requests_count,
skipped_requirements, warnings, progress}`.

### Limits → warnings (best-effort optional resources)

Only the **active-case limit** is a hard blocker (see step 2). The **sharing-room**
and **document-request** org limits are **best-effort**: if a room/request hits its
limit it is **skipped and the case is still created**, with a `warnings` entry
(`room_limit_reached` / `request_limit_reached`).

> **Same pack-ownership limitation as the rest of B2B Portals.** The template pack's
> underlying `DocumentBundle` is owned by the **org-owner user**, so it still counts
> against that account until org-owned storage/pack entitlement exists. Packs are not
> separately org-limited in V1.

### Optional request emails

Requests created from a template **do not send email by default**. With
`send_request_emails=true`, each recipient is notified by **reusing** the shared
`send_branded_email` helper + the existing `portal_bulk_reminder` template (no new
email system). The email carries only the **public upload link** + safe context —
**never** a private file URL, raw token, or document content — and respects
suppression / unsubscribe.

### Permissions

List / detail = any **active org member**; create / edit / archive / duplicate /
create-case = **OWNER/ADMIN** only (the same policy as manual case creation). Org
isolation, the `b2b_portals` flag, and the org Teams entitlement all still apply.

### Audit

Seven events through the unified Audit Log (category `system`, owner = the org owner,
actor = the acting member, `metadata.org_id`): `organization_template_created`,
`organization_template_updated`, `organization_template_archived`,
`portal_case_created_from_template`, `portal_template_pack_created`,
`portal_template_room_created`, `portal_template_requests_created`. Metadata is
limited to safe keys (template_id, template_name, case_id, case_type,
requirements_count, created_requests_count, result) — never tokens, private file URLs,
storage keys, document contents, or email bodies. Endpoints and shapes are in
`docs/api-spec.md` §43.

## Document Organization (delivered 2026-06-25)

Organizations can structure their portal-collected documents with **virtual folders,
tags, manual collections, and saved/smart views** scoped to the org. This builds on the
existing primitives — it is **metadata over the existing `Document` model** and adds
**no duplicate storage / upload / request system**. It **never** changes a file's R2
object key, **never** exposes a file URL / storage key / token, and is **never** access
control. Fully **deterministic — no AI.** Shared service:
`apps/documents/folders.py` (scope-parameterized; the same code powers the personal
vault). Endpoints + shapes are in `docs/api-spec.md` §44.

### Org folder tree

A read returns the org folder tree, tags, collections, and the structure preference
(`GET …/portal/document-organization/`). System folders are seeded for the org —
**Unfiled, Cases, People, Protected copies**. Folders nest via `parent` (same scope
only); moving a folder rejects cycles and never touches storage. `folder_type`
distinguishes user folders (`normal`) from `system` / `case` / `person` / `template`
auto-folders.

### Structure preferences (`OrganizationDocumentStructurePreference`, one per org)

`PATCH …/portal/document-organization/preferences/` (OWNER/ADMIN) controls how the
portal auto-structures documents:

- **`structure_mode`** — `by_person` (default), `by_case`, `by_document_type`,
  `by_template`, or `custom`. This drives case-folder placement: `by_person` → under the
  person folder; `by_case` → under `Cases/{case_type}`; `custom` → under
  `default_root_folder`.
- **`auto_create_case_folder`** / **`auto_create_person_folder`** — default `true`.
- **`auto_file_accepted_uploads`** — default **`false`** (opt-in; see below).
- **`default_root_folder`** — used in `custom` mode.

### Case / person / template folders

`ensure_person_folder` creates a person folder under **People**; `ensure_case_folder`
places a case folder per the structure mode and then seeds the case template's
`OrganizationTemplateFolderBlueprint` subfolders (an ordered list of default subfolder
names — configuration only, no document data).

### Opt-in auto-filing (with a vault-copy caveat)

When an org sets `auto_file_accepted_uploads=true`, accepting a portal upload (see
"Review + Approval" above) **also** materializes the upload as a vault `Document` via
the existing `save_request_file_to_vault` — owned by the **org-owner user**, enforcing
that owner's document plan limit — and files it into the case folder. It is
**best-effort**: it never raises and never blocks the accept flow, and with the
preference off (the default) the accept flow is completely unchanged. **Caveat:** the
vault copy counts against the **org-owner user's personal document limit** until
org-owned storage exists (`b2b/teams-billing-checkout`).

### Permissions and no public exposure

**Read** (tree / contents / tags / collections / saved-views) = any **active member**;
**create / edit / archive / move / structure-preference** = **OWNER/ADMIN** only;
non-members denied. Behind the `b2b_portals` flag + the org Teams entitlement, org-
isolated. There is **no public folder endpoint** — public document-request recipients
and sharing-room viewers can never browse the folder tree, and folder placement grants
no access. Org limits: `teams_beta` = 500 folders / 200 tags / 100 collections; `teams`
= 2000 / 500 / 500; `enterprise` = unlimited.

### Audit

Through the unified Audit Log (category `document`): `document_folder_created/updated/
archived/moved`, `document_moved_to_folder`, `document_tag_created`,
`document_tags_updated`, `document_collection_created`, `document_added_to_collection`,
`document_removed_from_collection`, `organization_document_structure_updated`,
`case_folder_created`, `person_folder_created`, `document_auto_filed`. Safe metadata
only — never an R2 key, file URL, token, or document content.

## Custom Fields and Statuses (delivered 2026-06-25)

Organization admins can attach **org-defined custom fields** to portal people and cases
and define **custom case statuses** — used across case creation, case detail, filtering,
the dashboard, and templates — **without** a CRM, a form builder, dynamic DB columns, or
raw SQL. **Deterministic — no AI, no AI credits.** Service:
`apps/organizations/custom_fields.py`; models in migration `organizations/0010`.

This reuses the existing portal people/case system — there is **no duplicate people or
case model**, and **no dynamic per-org tables/columns**. Field values live in a single
JSON column on a dedicated value model.

### Custom fields (values are validated JSON, never a dynamic column)

- `OrganizationCustomField` defines a field on a **person** or a **case** with a
  `field_type` (short_text / long_text / number / date / boolean / single_select /
  multi_select / email / phone / url), an optional `options` list (for selects), a
  `required` flag, and a `key` that is **unique per org+target**.
- `OrganizationCustomFieldValue` stores **one value per field per target** (person XOR
  case) as **validated JSON** — size-limited and validated by `field_type` at write
  time. There are **no dynamic database columns and no raw SQL**: the cases-list custom
  filters (`custom_status`, `cf_key`+`cf_value`) use Django ORM JSONField lookups only.
- Setting values returns the changed keys; unknown or **archived** field keys are
  skipped. A required field cannot be cleared.

### Custom case statuses (the fixed system status stays authoritative)

- `OrganizationCaseStatusDefinition` defines an org status with a `category` (planning /
  collecting / reviewing / ready / submitted / completed / blocked / closed). Custom
  statuses **layer on top of** the fixed `PortalCase.Status` — they never replace it.
- Setting a case's custom status (`POST .../cases/{id}/status/`) writes the
  `custom_status` FK **and keeps the system `status` in sync** from the category
  (planning→draft, collecting→collecting_documents, reviewing→waiting_for_review,
  ready→ready, submitted→submitted, completed→completed, blocked→blocked,
  closed→completed), so dashboards, reminders, and review keep working unchanged.
- `seed-defaults` idempotently creates a workflow-mirroring set (Planning, Collecting
  Documents, In Review, Ready to Submit, Submitted, Accepted, Rejected, Withdrawn,
  Renewal Needed). Archiving a status deactivates it (and drops its default flag);
  existing cases keep referencing it via the FK (`SET_NULL`).

### Template defaults

A case template (`OrganizationCaseTemplate`) may carry a `default_custom_status_key` and
a `default_custom_field_values` map; on create-case-from-template they are applied after
the case is created, and any custom field values submitted with the request override the
template defaults. **Best-effort** — a bad value becomes a warning, never discards the
case.

### Internal-only in V1

Field `visibility` (`public_readonly` / `public_editable`) is **stored for future use**
but **V1 is internal-only**: custom fields and statuses are **never exposed on public
request/room pages** — only authenticated org members see them.

### Permissions

**Read** (lists / schema / values) = any **active member**; **create / edit / archive**
fields+statuses and **set** values/status = **OWNER/ADMIN**; non-members denied. Org
isolation enforced (a field / status / value cannot cross org boundaries). Behind the
`b2b_portals` flag + Teams entitlement. `field_type` and `target` are immutable after a
field is created.

### Limits (server-side caps, no Stripe)

`teams_beta` = 50 fields / 30 statuses / 50 options-per-field; `teams` = 200 / 100 / 200;
`enterprise` = unlimited.

### Audit

Through the unified Audit Log (`metadata.org_id`): `organization_custom_field_created/
updated/archived`, `organization_custom_field_value_updated`,
`organization_case_status_created/updated/archived`, `portal_case_custom_status_updated`,
`default_case_statuses_seeded`. **Privacy-first:** a value update records only **which**
field keys changed (`changed_field_keys`), **never the values themselves**; metadata
holds only safe ids/keys/labels — never a file URL, token, document content, or secret.

## Frontend

Owner/staff surface under `/dashboard/organizations/[orgId]/portal`. There is
**no public portal UI** (the only public routes remain the per-token request and
room pages, which expose no internal folders/tags/custom fields).

### Portal UX structure (UX Polish V1, 2026-06-25)

The portal reads as **one connected command center**, not a set of separate
pages. Every surface renders a shared **portal nav** (`PortalNav`,
`components/features/portals/portal-nav.tsx`):

| Tab | Route | Purpose |
| --- | --- | --- |
| **Overview** | `/portal` | What needs attention, how cases are tracking, quick actions |
| **Cases** | `/portal/cases` | Filterable list of every case; create / from template |
| **People** | `/portal/people` | Filterable list of everyone served; add person |
| **Documents** | `/portal/documents` | Folder/tag/collection/smart-view lens |
| **Templates** | `/portal/templates` | Reusable case blueprints |
| **Settings** | `/portal/settings/customization` | Custom fields + case statuses |

**Review** and **Reminders** are not tabs — they are surfaced as queues/actions
from the Overview, where the work is done. Back links go to **Back to
organization** (case detail uses **Back to cases**).

- **Overview (`portal/page.tsx`).** Hierarchy, top to bottom: a **Needs
  attention** lead (only non-zero items as chips that jump to their queue, or a
  calm "all caught up"), six overview metric cards, the **Needs attention** work
  queues (review / overdue / missing / needs-replacement / ready, each capped
  with an honest "+N more"), then a sidebar of **Quick actions** + Templates +
  Plan usage + Recent activity. Empty workspace → a guided four-step setup.
- **Cases / People sub-pages.** Real filterable lists. Cases: search + a Focus
  lens (needs review / missing documents / due soon / overdue / ready) +
  system-status + custom-status + person filters. People: search + status + type.
  Filtering is **client-side** over the loaded set via pure, tested helpers
  (`filterPortalCases` / `filterPortalPeople` in `lib/portals.ts`) — no extra API
  calls. Each case card shows a plain-language **next action** (`caseNextAction`).
- **Case detail (`portal/cases/[caseId]/page.tsx`).** A prominent, tone-matched
  **next-action banner** (`CaseNextActionBanner`) answers "what is this case
  waiting on?" using the same wording as the case cards.

### Trust + plain-language microcopy

- Public room page states **"Only the files {org} chose to share appear here."**
- Public request/room **error** states use a warning icon (a prior bug used a
  success shield).
- Customization avoids leaking system internals: a custom status reads **"Counts
  as *Waiting for review* for readiness and queues"** rather than the raw
  `maps_to_system_status` key; the field machine key is labelled **"Reference"**.
- Folder placement is **organization only** — it never grants access and is never
  shown on public pages (see "Document Organization" above).

### Component-test infrastructure

This branch added the first **component render tests** to the frontend: `jsdom` +
`@testing-library/react`, opted in **per file** with a `// @vitest-environment
jsdom` docblock so the existing node-environment logic tests are untouched.
Covered: `PortalNav`, `CaseCard`, `PersonCard`, plus pure-logic tests for the
filter / next-action helpers.

## Future work

- **Teams billing checkout + per-seat Stripe + invoices** and **org-owned storage**
  (`b2b/teams-billing-checkout`) so a case's pack and uploaded files no longer draw
  down the org-owner's personal storage. (Org entitlement + portal limits are
  **delivered** — see "Teams Plan + Portal Limits V1" above.)
- **Advanced approvals** beyond the delivered accept/reject/needs-replacement
  workflow (see "Review + Approval" above): multi-level approval chains, reviewer
  assignment, SLA / due-date tracking, bulk review actions, and AI-assisted
  document validation.
- **Recurring reminder campaigns** and **drip sequences**, **WhatsApp / SMS**
  channels, **organization-owned email templates**, advanced delivery analytics,
  marketing newsletters, and per-recipient custom editing. (Single-batch **Bulk
  Reminder Emails** are **delivered** — see "Bulk Reminder Emails" above.)
- **Template versioning, bulk case creation, CSV import, conditional/branching
  requirements, a public template marketplace, cross-org template sharing, and
  AI template generation.** (Single-org reusable case **templates** are
  **delivered** — see "Organization Templates" above.)
- An **analytics dashboard** for the organization.
- **Broader / advanced RBAC** and approval chains beyond the current
  member-read / admin-write split.

## See also

- `docs/api-spec.md` §38 — endpoint contract, models, progress/summary shapes.
- `docs/api-spec.md` §39 — Teams Plan + Portal Limits V1 (entitlement model, limit
  table, error codes, limits endpoint).
- `docs/api-spec.md` §40 — Review + Approval Workflow V1 (review endpoints, review
  fields + `PortalCaseReviewDecision`, statuses/rules, org-scoped file proxy).
- `docs/api-spec.md` §41 — Organization Dashboard V1 (read-only metrics + action
  queues + plan usage; response shape, caps, privacy guarantees).
- `docs/api-spec.md` §42 — Bulk Reminder Emails V1 (reminder types, preview/send,
  cooldown, batch shapes, audit events).
- `docs/api-spec.md` §43 — Organization Templates V1 (template + requirement shapes,
  CRUD/duplicate/archive, create-case body/result, limit→warning behavior).
- `docs/api-spec.md` §44 — Custom Document Organization V1 (personal + org folder/tag/
  collection/saved-view endpoints, smart-view filter whitelist, structure preferences,
  opt-in auto-filing, limits, audit).
- `docs/api-spec.md` §45 — B2B Custom Fields and Statuses V1 (field definition/value
  endpoints, field types + validation, status category→system mapping, template
  defaults, dashboard/filter additions, limits, audit).
- `docs/NOTIFICATIONS.md` — the `portal_review_decision` and `portal_bulk_reminder`
  recipient emails.
- `docs/BILLING.md` — feature-flag gate, org entitlement, and the Teams limit table.
- `docs/security-plan.md` — membership-scoped access, org isolation, and the org
  entitlement gate.
- `docs/security/audit-logs.md` — the `portal_*` and `organization_plan_*` event
  catalog.
- `docs/roadmap.md` — "B2B Portals MVP" and "Teams Plan + Portal Limits V1"
  delivered sections.

## Onboarding & Demo Workspaces (delivered 2026-06-25)

A deterministic setup guide and a safe sample workspace for the B2B portal.

- **Setup guide** (`apps/organizations/onboarding.py`): `build_org_onboarding_payload`
  returns an 8-step checklist DERIVED from the org's real data — create template,
  add person, create case, request documents, review an upload, organize files,
  send a reminder, check activity — plus the single deterministic `next_action`.
  Only the dismissed flag + the demo record live on the new
  `OrganizationOnboarding` model; the steps are always computed live (no AI).
- **Demo workspace** (`apps/organizations/demo.py`): `create_organization_demo_workspace`
  reuses the real services to build a "Scholarship Application Demo" template, a
  "Demo Applicant" person, a case from the template, sample custom fields/statuses,
  and a People / Demo Applicant / Scholarship Application folder tree. It is
  **idempotent**, **sends no email** (the person has no address;
  `send_request_emails=False`), **calls no AI**, and creates **no document files
  or real-looking identity data** — requirement titles are obvious placeholders.
  Every object is tagged `[Demo]` and its id recorded in
  `OrganizationOnboarding.demo_refs`; `cleanup_organization_demo_workspace` removes
  them all (case, person, template, statuses, fields, folders, request links, pack).
- **Endpoints** (members read, admin write, behind the b2b_portals flag + Teams
  entitlement): `GET .../portal/onboarding/`, `POST .../portal/onboarding/dismiss/`,
  `POST .../portal/demo/`, `POST .../portal/demo/cleanup/`.
- **Frontend**: an `OrgOnboardingCard` on the portal Overview (live checklist +
  progress + next action + demo CTA + dismiss). The founder Organizations
  list/detail show a **Demo** badge for orgs with a demo workspace.

**Limitation:** demo records are real and count toward plan limits until removed
(kept minimal). Personal onboarding + personal demo data are unchanged (they
already existed in `apps/users`).
