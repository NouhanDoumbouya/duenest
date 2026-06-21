# Document Requests

> Documents **existing**, verified code (`apps/share_requests`) plus the
> organization variant (`apps/organizations`). Not new in this branch — recorded
> here because Phase 17 asks for it.

## Scope

A DueNest user requests a missing document from someone via a secure public upload
link, tracks it, reviews the upload, and accepts / requests changes / revokes.

## What it does not claim

- The public link grants **upload-only** access to that one request — not access to the
  owner's vault.
- No account is required for the recipient to upload.

## Models (`apps/share_requests/models.py`)

`ShareRequest`, `ShareRequestItem`, `ShareRequestResponse`. (The organization-scoped
variant uses `apps/organizations`: `DocumentRequest`, `DocumentRequestSubmission`.)

## API

Owner (auth):
- `share-requests` — list / create
- `share-request-detail` — retrieve / update / revoke
- `share-request-respond` — accept / request changes

Public (token, `AllowAny`, throttled `public_access_code`):
- `share-request-submit` — fetch safe request info + upload to the request token

## Security

- Public endpoints are `AllowAny` but **token-scoped** and rate-limited
  (`public_access_code` throttle). See `docs/security/public-upload-links.md`.
- Owner endpoints enforce ownership.
- Uploaded files flow into the standard encrypted `DocumentFile` storage.

## Status

Backend + frontend exist (`/dashboard/requests`, public `request/[token]`). Verified
present via the route/app inventory; covered by the app's own tests.

## Cross-feature

Accepted uploads land in File Inbox (`DocumentFile`, `document=null`), so they reuse the
existing organize → Vault → attach-to-pack flows.
