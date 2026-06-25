# Security Hardening Report

Defensive hardening for controlled private beta. This is **not** a
production-readiness sign-off (see Launch blockers).

## Production Django settings (`config/settings/production.py`)
Env-gated, on in production only (dev unaffected):
- `SECURE_SSL_REDIRECT`, `SECURE_PROXY_SSL_HEADER` (proxy-terminated TLS).
- `SECURE_HSTS_SECONDS` (default 3600); `INCLUDE_SUBDOMAINS`/`PRELOAD` off until
  the whole domain is HTTPS-ready.
- `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`,
  `SameSite=Lax`.
- `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_REFERRER_POLICY=strict-origin-when-cross-origin`,
  `X_FRAME_OPTIONS=DENY`.
- `CORS_ALLOW_ALL_ORIGINS=False`; explicit `CORS_ALLOWED_ORIGINS` and
  `CSRF_TRUSTED_ORIGINS` from env.
- `python manage.py check --deploy` passes with only intentional warnings
  (HSTS subdomains/preload off until ready).

## Security headers (`apps/core/middleware.SecurityHeadersMiddleware`)
- **Public token routes** (`/share/`, `/quick-share/claim/`, `/public/`,
  `/rooms/`) always get `X-Robots-Tag: noindex, nofollow`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store` — in every
  environment (prevents indexing, token leakage via Referer, and caching).
- When `SECURITY_HEADERS_ENABLED` (production): `Content-Security-Policy`
  (self-based; `frame-ancestors 'none'`, `object-src 'none'`), `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`. Tune `connect-src` via
  `DJANGO_CSP_CONNECT_SRC`.

## Authentication / JWT
- SimpleJWT, 15-min access / 7-day refresh, rotation + blacklist.
- Rate limits (DRF `ScopedRateThrottle`): `login` 10/min, `register` 10/hour,
  `share_file_code`/`emergency_code`/`room_code` 10/min,
  `quick_share_code` 10/min (existing), `feedback` 20/hour, `waitlist` 5/hour,
  `invite_validate` 20/hour.
- Login emits a privacy-safe `failed_login_attempt` security event; generic
  failure messages (no user enumeration).

## Object-level permissions
- All user resources are owner-scoped in `get_queryset`; foreign IDs return 404.
  Regression tests in `apps/core/test_security.py` (documents, subscriptions,
  emergency packs; read/update/delete).

## File & encrypted-file access
- Permission-first decryption (see `docs/ENCRYPTION.md`): decrypt only after
  auth/scope/trash/revoke/expiry/code. Founder views never read file bytes.
- Trashed documents/files are blocked on every path including public links.

## Public token routes — see `docs/PUBLIC_LINK_SECURITY.md`.
## File upload — see `docs/FILE_UPLOAD_SECURITY.md`.

## Logging & secrets
- `apps/core/logging.SensitiveDataFilter` scrubs Authorization/Bearer, cookies,
  and `access_code|token|password|secret|api_key|kek|dek=…` values from logs
  (defensive net; code already avoids logging secrets).
- No secrets committed; all from env (`.env.example` placeholders only).

## Founder console privacy
- Permission: `IsFounderUser` (staff/superuser); non-founders 403.
- Exposes aggregates + safe encryption counts (no key material), country-level
  map only (no raw IP/GPS). Copy enforced on the map page.

## Implemented since this report was first written
These were once listed as gaps and have since landed (verified in `main`):
- **Private object storage with presigned URLs** (Cloudflare R2; private bucket,
  ≈5-min signed URLs, encrypt-before-store, UUID keys) — replaces local disk.
- **Upload magic-byte sniffing + ClamAV scan** (`apps/core/security/
  file_validation.py`; fail-closed in production) — beyond extension/MIME.
- **HttpOnly-cookie JWT** (`apps/users/cookie_auth.py`) with CSRF double-submit —
  replaces client-side localStorage tokens for the cookie flow.
- **Activity-trail metadata sanitization** (Security & Compliance Hardening V1):
  file/room/document/emergency trails now run metadata through
  `safe_audit_metadata`. See `docs/security-compliance-hardening-v1.md`.

## Remaining risks / launch blockers
- Production secret manager + KEK backups (currently env vars).
- Enable + monitor ClamAV in production (`CLAMD_ENABLED`, `CLAMD_FAIL_CLOSED`).
- Enable Redis cache in production so throttles/lockouts are cluster-wide.
- Email delivery, monitoring/alerting, backups, external security review.
- P2 foundations (MFA, session management, account lockout, CAPTCHA) are
  documented but not implemented.
