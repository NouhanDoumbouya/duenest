# Secure Sharing — Security Model

This document captures the security rules CertaNest enforces for Quick Share,
file share links, secure rooms, and emergency access. **Frontend permissions are
never the security boundary — every rule below is enforced server-side.**

## Core invariants

1. **Selected items only.** A share exposes only the specific files/bundle the
   owner selected. The wider vault is never reachable through a share.
2. **Expiry.** Expired shares are blocked (server resolves state on every access).
3. **Revocation.** Revoked shares are blocked immediately and permanently.
4. **Access codes.** Optional codes are stored **hashed** (`make_password`),
   verified server-side, and never returned in responses or logs. Wrong codes are
   rejected with a generic message and rate-limited.
5. **Login when required.** Account-to-account shares require an authenticated,
   accepted (and optionally owner-approved) claim before any file is served.
6. **Download permission.** View-only is enforced on the **download** endpoint,
   not just the UI; a view-only share returns 403 on download.
7. **Save-to-vault permission.** Saving a recipient-owned copy is allowed only
   when the owner enabled it.
8. **Deleted files blocked.** Trashed/deleted files are excluded from a share's
   live file set, so removing a file revokes it from the share immediately.
9. **Expired/revoked/limit-reached blocked.** One-time and max-claim limits are
   enforced atomically.
10. **Organization permission.** Organization-owned files respect the workspace's
    permissions.

## Encryption & the decryption-permission flow

- Files are **encrypted at rest** (AES-256-GCM envelope; see
  `apps/documents/file_encryption.py`).
- A file is **decrypted only after** the request passes all permission checks
  (session state → access code → claim/login → view-only/download → selected-item
  membership). Decrypted bytes exist only in memory to serve that one authorized
  request.

## What is never exposed

Public/share endpoints and founder views never expose: access codes, raw share
tokens, emergency tokens, encryption keys, raw OCR text, private notes, document
contents the viewer isn't authorized for, storage paths, or raw IP addresses in
normal internal views. Tokens carry entropy from a vetted generator and reveal no
internal IDs.

## Activity logging

Owner-facing activity trails record actions (opens, accepts, previews, downloads,
saves, approvals, revokes) with safe summaries only. **Codes and tokens are never
written to logs.**

## Watermark / screenshot limitation (honest)

Watermarking deters misuse but **cannot fully prevent screenshots on every
device**. CertaNest does not claim screenshot prevention.

## Tests

These invariants are covered by the backend suites (`apps.quick_share`,
`apps.documents` — `test_preview_sharing`, `test_share_rooms`,
`test_emergency_public`, `test_file_encryption`, `test_intelligence`). Combined
`apps.documents` + `apps.quick_share` run: **280 tests passing** (see
`PRIVATE_BETA_READINESS.md`).
