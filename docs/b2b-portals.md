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

## Ownership model and the known plan-limit limitation

The document primitives stay **User-owned** (no organization FK). A case's
pack / room / request are owned by the case's **creating member** (`created_by`),
so the existing owner-scoped services and ownership checks apply unchanged.
Organization access to a case is gated by **membership**, not by primitive
ownership.

> **Known MVP limitation.** Because portal-created primitives are owned by the
> creating member, they currently count against that **member's personal plan
> limits** (Free: 1 pack / 3 rooms / 5 request links). A **Teams-tier plan** that
> lifts these limits for organization workspaces is **future work**
> (`b2b/portals-teams-plan`). Since the portal is founder/beta-gated, this only
> affects beta testers today. No new plan resource was added and Stripe/billing is
> untouched (see `docs/BILLING.md`).

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
| `GET` | `/review-queue/` | Case requests with an upload awaiting review |

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
  (`DocumentRequestLink`), `requirement` (`DocumentBundleRequirement`).

Migration: `organizations/0005_*`.

## Audit

Portal events are recorded through the unified Audit Logs (`record_audit_event`,
category `system`, owner = the organization's owner user, actor = the acting
member, `metadata.org_id` for scoping):

`portal_person_created`, `portal_person_archived`, `portal_case_created`,
`portal_case_status_changed`, `portal_case_archived`, `portal_case_pack_created`,
`portal_case_room_created`, `portal_case_request_created`.

No document contents, tokens, or file URLs are stored (the same privacy rules as
the rest of Audit Logs V1 — see `docs/security/audit-logs.md`).

## Frontend

Owner/staff page `/dashboard/organizations/[orgId]/portal` (dashboard summary +
people + cases + review queue + case detail/actions). There is **no public UI**.

## Future work

- **Teams-tier plan + lifted limits** (`b2b/portals-teams-plan`) so portal-created
  packs / rooms / requests no longer draw down the creating member's personal plan.
- A portal **review / approval workflow** (multi-step review states, approvals).
- **Bulk reminders** across people / cases.
- **Organization document templates** (reusable case/checklist templates).
- An **analytics dashboard** for the organization.
- **Broader / advanced RBAC** and approval chains beyond the current
  member-read / admin-write split.

## See also

- `docs/api-spec.md` §38 — endpoint contract, models, progress/summary shapes.
- `docs/BILLING.md` — feature-flag gate and the plan-limit limitation.
- `docs/security-plan.md` — membership-scoped access and org isolation.
- `docs/security/audit-logs.md` — the `portal_*` event catalog.
- `docs/roadmap.md` — "B2B Portals MVP — delivered (2026-06-24)".
