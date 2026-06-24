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

## Honest limits

- Anyone with the link can upload until it is revoked/cancelled or expires —
  owners should cancel when collection is complete (the UI surfaces cancel).
