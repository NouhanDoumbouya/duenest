# Founder Console V1

**Status:** Implemented
**Scope:** Solo-founder operations for private beta
**Primary route:** `/founder`
**Compatibility route:** `/dashboard/founder/*` still exists for older links
**API prefix:** `/api/v1/founder/`

## Purpose

Founder Console V1 is DueNest's private operating center for a solo founder. It
shows product usage, activation, adoption, feedback, failures, security signals,
beta users, launch readiness, templates, and country-level activity without
turning founder access into a vault browser.

## Access Control

Founder API endpoints require:

- authentication
- `is_staff` or `is_superuser`

Normal authenticated users receive `403 Forbidden` for `/api/v1/founder/*`.
The frontend standalone shell at `/founder` checks `/api/v1/founder/me/` before
rendering console content. Normal user navigation only shows the founder link
after that backend check succeeds.

## Privacy Rules

Founder tools are designed for operations, not private-document inspection.

Founder views must not expose:

- document contents
- file contents or previews
- filenames in support summaries
- raw OCR text
- private notes
- physical document locations
- access codes or access-code hashes
- raw share tokens
- internal file paths
- passwords, JWTs, OAuth tokens, or secrets
- raw IP addresses in ordinary UI

Product-event metadata is sanitized before storage. Founder analytics use
aggregate records and safe metadata such as event type, counts, timestamps,
safe country labels, and product module names.

## Frontend Routes

```txt
/founder
/founder/analytics
/founder/waitlist
/founder/invites
/founder/activation
/founder/adoption
/founder/features
/founder/feedback
/founder/errors
/founder/security
/founder/templates
/founder/beta
/founder/launch
/founder/map
```

The `/founder` shell is visually separate from the normal dashboard. Existing
`/dashboard/founder/*` pages are compatibility routes.

## Implemented Areas

- Overview dashboard with KPI cards and date-range filter.
- Native SVG/CSS charts for user growth, active users, documents, files,
  failures, security events, attention breakdown, and feedback categories.
- Private beta waitlist review and invite-code management.
- Activation funnel from signup to first document, file, expiry date, reminder,
  checklist/bundle, and secure sharing.
- Feature adoption dashboard.
- Editable feature completion tracker.
- Feedback submission and founder triage board.
- Error/failure dashboard.
- Security overview and founder audit log storage.
- Checklist template management.
- Beta user profiles with invite status, persona, tags, notes, and safe usage
  summaries.
- Launch readiness cockpit with editable checklist and readiness percentage.
- Country activity dashboard as the privacy-safe V1 global map fallback.

## Backend Endpoints

Public/user-facing operational endpoints:

```txt
POST /api/v1/feedback/
POST /api/v1/errors/client/
POST /api/v1/waitlist/
POST /api/v1/invites/validate/
```

Founder endpoints:

```txt
GET   /api/v1/founder/me/
GET   /api/v1/founder/dashboard/?range=7d|30d|90d|all
GET   /api/v1/founder/analytics/?range=7d|30d|90d|all
GET   /api/v1/founder/private-beta/
GET   /api/v1/founder/waitlist/
GET   /api/v1/founder/waitlist/:entry_id/
PATCH /api/v1/founder/waitlist/:entry_id/
POST  /api/v1/founder/waitlist/:entry_id/create-invite/
GET   /api/v1/founder/invites/
POST  /api/v1/founder/invites/
GET   /api/v1/founder/invites/:invite_id/
PATCH /api/v1/founder/invites/:invite_id/
POST  /api/v1/founder/invites/:invite_id/disable/
GET   /api/v1/founder/activation-funnel/
GET   /api/v1/founder/feature-adoption/
GET   /api/v1/founder/feature-completion/
PATCH /api/v1/founder/feature-completion/:item_id/
GET   /api/v1/founder/feedback/
GET   /api/v1/founder/feedback/:feedback_id/
PATCH /api/v1/founder/feedback/:feedback_id/
GET   /api/v1/founder/templates/checklists/
POST  /api/v1/founder/templates/checklists/
GET   /api/v1/founder/templates/checklists/:template_id/
PATCH /api/v1/founder/templates/checklists/:template_id/
DELETE /api/v1/founder/templates/checklists/:template_id/
GET   /api/v1/founder/errors/
GET   /api/v1/founder/errors/:error_id/
PATCH /api/v1/founder/errors/:error_id/
POST  /api/v1/founder/errors/:error_id/resolve/
GET   /api/v1/founder/security-overview/
GET   /api/v1/founder/security-events/
GET   /api/v1/founder/audit-logs/
GET   /api/v1/founder/users/
GET   /api/v1/founder/users/:user_id/summary/
GET   /api/v1/founder/beta-users/
PATCH /api/v1/founder/beta-users/:profile_id/
GET   /api/v1/founder/launch-readiness/
PATCH /api/v1/founder/launch-readiness/:item_id/
GET   /api/v1/founder/country-activity/?range=7d|30d|90d|all
```

## Data Model

Founder Console uses:

- `ProductEvent` for privacy-minimized product analytics events.
- `FeedbackItem` for user feedback and founder triage.
- `AppErrorLog` for client/backend failure intake.
- `WaitlistEntry` for private beta requests.
- `InviteCode` and `InviteCodeUse` for controlled signup access.
- `FeatureCompletionItem` for editable feature maturity tracking.
- `LaunchChecklistItem` for launch readiness tracking.
- `BetaUserProfile` for founder-only beta metadata.
- `FounderAuditLog` for founder/admin action audit entries.

## Country Activity

`/founder/map` is implemented as a country activity dashboard, not a heavy map
dependency. It aggregates:

- active users by country
- new signups by country
- documents created by country
- share access by country
- security events by country

It uses approximate country metadata only. No GPS, street-level location, raw
IP addresses, or small-count city drilldowns are shown.

## Deferred

- Billing dashboard.
- AI analytics assistant.
- Advanced cohort retention and churn prediction.
- Consent-based sensitive support access.
- Full incident response center.
