# Founder Console V1

**Status:** Implemented foundation  
**Scope:** Solo-founder operations for private beta  
**Primary route:** `/dashboard/founder`  
**API prefix:** `/api/v1/founder/`

## Purpose

Founder Console V1 gives a solo founder enough operational visibility to run
DueNest during private beta without casually exposing private user vault data.

It supports:

- aggregate product health metrics
- activation funnel analysis
- document feature adoption tracking
- in-app feedback collection and triage
- checklist template management
- lightweight client/backend error monitoring
- security/audit overview
- privacy-safe user support metadata

## Founder Access Control

Founder endpoints require authentication plus staff/superuser access. The
backend permission class is `IsFounderUser`, which allows only users where
`is_staff` or `is_superuser` is true.

Normal authenticated users receive `403 Forbidden` for founder endpoints. The
frontend hides Founder Console navigation unless `/api/v1/founder/me/`
confirms access.

## Privacy-Safe Support Principle

Founder tools are designed for operations, not vault browsing.

The console intentionally excludes:

- document contents
- document titles in support summaries
- filenames in support summaries
- raw OCR text
- private notes
- physical document locations
- access codes and access-code hashes
- raw share tokens
- internal file paths
- passwords, JWTs, OAuth tokens, and secrets

Support access to sensitive user data is intentionally deferred until an
explicit user-consent and logging model exists.

## Dashboard Metrics

`GET /api/v1/founder/dashboard/` returns aggregate metrics:

- total and new users
- active users based on first-party events and login timestamps
- documents, files, reminders, share links
- attention-needed count
- checklists, bundles, exports, emergency packs
- feedback and open error counts
- recent product activity summary by event type

The endpoint does not return individual document data.

## Activation Funnel

`GET /api/v1/founder/activation-funnel/` tracks the first-value path:

1. signed up
2. created first document
3. uploaded first file
4. added expiry or renewal date
5. viewed Attention Needed
6. created reminder
7. created checklist or bundle
8. created secure share link

Counts come from real user-owned records and product events. No fake funnel
numbers are generated.

## Feature Adoption

`GET /api/v1/founder/feature-adoption/` reports per-feature usage:

- file preview
- secure sharing
- access-code sharing
- reminders
- Attention Needed
- checklists
- bundles
- timeline
- extraction
- export
- emergency packs
- proof records
- trash restore

Each feature includes user count, total event/record count, adoption percent,
and last-7-day/last-30-day activity.

## Feedback Board

Users submit feedback through:

```txt
POST /api/v1/feedback/
```

Founder management endpoints:

```txt
GET   /api/v1/founder/feedback/
GET   /api/v1/founder/feedback/:feedback_id/
PATCH /api/v1/founder/feedback/:feedback_id/
```

The frontend user form is at `/dashboard/feedback`. The founder board supports
filtering and status/priority/founder-note updates.

## Template Management

Founder checklist template endpoints:

```txt
GET    /api/v1/founder/templates/checklists/
POST   /api/v1/founder/templates/checklists/
GET    /api/v1/founder/templates/checklists/:template_id/
PATCH  /api/v1/founder/templates/checklists/:template_id/
DELETE /api/v1/founder/templates/checklists/:template_id/
```

`DELETE` deactivates the template (`is_active=false`) instead of hard-deleting
it. Editing a template affects future checklist creation only; existing
user-owned checklists are already materialized and are not rewritten.

## Error Monitoring

Client errors are submitted through:

```txt
POST /api/v1/errors/client/
```

Founder endpoints:

```txt
GET   /api/v1/founder/errors/
GET   /api/v1/founder/errors/:error_id/
PATCH /api/v1/founder/errors/:error_id/
POST  /api/v1/founder/errors/:error_id/resolve/
```

Error metadata is sanitized before storage. Stack traces are only returned to
founder users when Django `DEBUG` is enabled.

## Security Overview

`GET /api/v1/founder/security-overview/` returns safe aggregate signals:

- failed login attempts in 24 hours
- wrong share-code attempts in 24 hours
- expired/revoked share-link access attempts in 24 hours
- suspicious events in 7 days
- high-download account count
- recent safe security event summaries

Raw IP addresses are not shown in ordinary founder UI.

## User Metadata Limitations

Founder user endpoints:

```txt
GET /api/v1/founder/users/
GET /api/v1/founder/users/:user_id/summary/
```

They show account metadata and counts only:

- user id, email, joined date, last login
- onboarding status
- counts for documents, files, reminders, checklists, bundles, shares,
  exports, feedback, emergency packs, and proof records
- deletion request status
- plan placeholder
- safe recent activity summary by event type

They do not show document titles, filenames, OCR text, notes, file paths,
access codes, share tokens, or physical locations.

## Intentionally Deferred

The following are deliberately not implemented in Founder Console V1:

- billing dashboard
- global activity map
- advanced user segmentation
- support access with user consent
- AI analytics assistant
- cohort retention analytics
- churn prediction
- full incident response center
