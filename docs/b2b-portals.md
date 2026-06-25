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

## Frontend

Owner/staff page `/dashboard/organizations/[orgId]/portal` (dashboard summary +
people + cases + review queue + case detail/actions). There is **no public UI**.

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
- **Organization document templates** (reusable case/checklist templates).
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
- `docs/NOTIFICATIONS.md` — the `portal_review_decision` and `portal_bulk_reminder`
  recipient emails.
- `docs/BILLING.md` — feature-flag gate, org entitlement, and the Teams limit table.
- `docs/security-plan.md` — membership-scoped access, org isolation, and the org
  entitlement gate.
- `docs/security/audit-logs.md` — the `portal_*` and `organization_plan_*` event
  catalog.
- `docs/roadmap.md` — "B2B Portals MVP" and "Teams Plan + Portal Limits V1"
  delivered sections.
