# Security — Public Upload Links

Covers the token-based public upload flows: personal **Document Requests**
(`apps/share_requests`), **Document Request Links V1** (`apps/documents`,
`DocumentRequestLink`), and **Portal** document requests (`apps/organizations`).

## Principles

- **Token-scoped, not account-scoped.** A public link grants access to **one request**
  only — never the owner's/organization's vault or other requests.
- **Unguessable tokens.** Public identifiers are random, URL-safe, and reveal no internal
  IDs.
- **Account-free for the recipient.** Uploading does not require a CertaNest account.

## Controls (verified)

- Public endpoints are `AllowAny` but **rate-limited** (`public_access_code` throttle) and
  resolve the request strictly by token.
- Expired / revoked requests reject uploads.
- Uploads are validated and stored in the standard **encrypted** `DocumentFile` storage
  (AES-256-GCM); no plaintext on disk.
- Owner/organization endpoints enforce ownership / membership; non-members cannot read
  org data.
- Tests: `apps/organizations/test_public_upload_security.py`,
  `apps/documents/test_public_access_lockout.py`,
  `apps/documents/test_secure_upload.py`.

## Data exposure

- Public request pages expose only minimal, safe fields (title/instructions/status) — never
  internal document metadata or other requests.
- Uploaded files go only to the requester/organization.

## Document Request Links V1 (`DocumentRequestLink`)

Single-recipient, single-document collection. See `docs/security-plan.md` for the
full subsection. Key points:

- Unguessable 256-bit `secrets.token_urlsafe` token; public `GET` reveals only
  the upload metadata (requested title/type, instructions, due/expiry, recipient
  name, a safe `from_name` + "CertaNest", status, `can_upload`) — **never** the
  owner's email, vault, notes, or any file URL.
- Upload allowed only when not expired/cancelled/accepted/rejected and within the
  upload allowance (`needs_replacement` re-opens upload). The file is stored as an
  **encrypted, owner-owned `DocumentFile`** and served only via the authenticated
  owner route `/api/v1/files/{id}/download/`; it is never returned to the
  recipient. Public upload also enforces the **owner's** file/storage plan limits.
- **Nothing is auto-accepted** — the owner must review (accept / reject /
  needs-replacement). Throttles: `public_access_code` (metadata) +
  `public_document_upload` (upload). Deterministic — no AI.

## Sharing Rooms V1 (`SharingRoom`) — uploads via embedded request links

A Sharing Room (`apps/documents`, distinct from the personal `ShareRoom`) is a
secure owner-scoped workspace that bundles selected documents/files plus
Document Request Links behind one unguessable public token. It introduces **no
new public upload system**:

- Uploads happen **only** through Document Request Links added to the room as
  items. The public room surfaces each request's own public token, so uploaders
  continue on the existing `/document-request/{token}` page with its own
  review/accept flow (see the Document Request Links V1 section above). The
  room's `allow_upload` toggle gates whether those upload tokens are surfaced.
- The public room route exposes only selected items + safe room metadata; files
  are served only through the authenticated decrypt-in-memory **proxy** routes
  (`/api/v1/public/sharing-rooms/{token}/files/{file_id}/preview|download/`),
  never a raw storage URL, with download gated by `allow_download`.
- Revoke / expiry / archive remove public access (`410`). Deterministic — no AI.
  See `docs/security-plan.md` and `docs/api-spec.md` §35.
- A room can share a **protected copy** (redacted/watermarked) of a document
  instead of the original (`ProtectedDocumentCopy` → `add-to-room`; see
  `docs/api-spec.md` §36). Only the protected file is added — the original is
  never exposed unless the owner separately adds it — and it streams through the
  same authenticated decrypt-in-memory proxy (no raw storage URL).

## Audit logging (owner-side accountability)

Public-link **opens** and **uploads** on Document Request Links — and **opens /
previews / downloads** on Sharing Rooms — are recorded in the **owner's** Audit
Log (`AuditLogEntry`, Audit Logs V1) as anonymous **`public_link`** actor events,
so an owner can later see who interacted with a request or room. The visitor's
identity is never exposed: IP and user-agent are stored **only** as a salted
SHA-256 hash (never plaintext), and no raw token, file URL, or content is kept.
The audit log is **owner-only** — recipients can never read it. See
`docs/security/audit-logs.md` and `docs/api-spec.md` §37.

## Honest limits

- Anyone with the link can upload until it is revoked/cancelled or expires —
  owners should cancel when collection is complete (the UI surfaces cancel).
