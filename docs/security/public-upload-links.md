# Security — Public Upload Links

Covers the token-based public upload flows: personal **Document Requests**
(`apps/share_requests`) and **Portal** document requests (`apps/organizations`).

## Principles

- **Token-scoped, not account-scoped.** A public link grants access to **one request**
  only — never the owner's/organization's vault or other requests.
- **Unguessable tokens.** Public identifiers are random, URL-safe, and reveal no internal
  IDs.
- **Account-free for the recipient.** Uploading does not require a DueNest account.

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

## Honest limits

- Anyone with the link can upload until it is revoked or expires — owners should revoke
  when collection is complete (the UI surfaces revoke).
