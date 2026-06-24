# Public Link Security

Rules for token-gated public routes: Quick Share, Emergency Access, Secure
Rooms, Document Request Links, and public organization request/room links.

## Tokens
- High-entropy random `secrets.token_urlsafe(32)` (256-bit).
- Stored as-is, **excluded from all serializers** sent to non-owners and from
  founder views; **never logged** (redaction filter as backup).
- The owner's own authenticated response includes the shareable URL (which
  contains the token) — that is required for sharing and is not a leak.
- At-rest token hashing (SHA-256/HMAC lookup) is recommended future work (P2).

## Access codes
- Hashed with Django hashers (`make_password`/`check_password`) in
  `access_code_hash`. Never stored plaintext, returned, logged, or shown in the
  founder console.
- Brute-force protected by `ScopedRateThrottle` (`quick_share_code`,
  `share_file_code`, `emergency_code`, `room_code` — 10/min).

## Validation order (permission-first)
1. Resolve token → 404/invalid if unknown.
2. Check shareable-now: active, not expired, not revoked/disabled.
3. Check access code (header/verify endpoint) if required.
4. Check selected-file scope (only owner-selected items).
5. Check the item isn't trashed/deleted.
6. Only then return metadata or decrypt/stream the file.

## What each link exposes
- **Quick Share**: only the selected files; download vs view-only enforced
  server-side; save-to-vault re-encrypts a fresh owner copy.
- **Emergency Access**: only the selected emergency items; full vault never
  exposed; no owner identity or token in the public serializer.
- **Secure Rooms**: only selected room files; membership/limits enforced.
- **Document Request Links** (`DocumentRequestLink`): a single-document collection
  link. The public GET exposes only the upload metadata (requested title/type,
  instructions, due/expiry, recipient name, a safe `from_name` + "CertaNest",
  status, `can_upload`) — never the owner's email, vault, notes, or any file URL.
  The recipient uploads one file without an account; it is stored as an encrypted,
  owner-owned `DocumentFile` reachable only via the authenticated owner route and
  never returned to the recipient. Owner reviews before accepting (no
  auto-accept). See `docs/security/public-upload-links.md`.

## Response headers (always)
`X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`,
`Cache-Control: no-store` via `SecurityHeadersMiddleware`. The frontend
emergency viewer also ships a `robots: noindex` route layout.

## Blocked states (tested)
Invalid / disabled / expired / revoked / wrong-code / trashed-item → safe error
(`410`/`403`/`404`), no content leaked. See `test_emergency_public.py`,
`test_share_rooms.py`, `quick_share/tests.py`, `apps/core/test_security.py`.
