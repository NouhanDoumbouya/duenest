# Security & Privacy Checklist

Living checklist for CertaNest. ✅ done · 🟡 partial · ⛔ not started / blocker.
See `docs/ENCRYPTION.md` for the encryption design and `docs/security-plan.md`
for the broader plan.

## Encryption at rest
- ✅ Uploaded `DocumentFile` content encrypted with AES-256-GCM envelope.
- ✅ Per-file 32-byte DEK, unique 12-byte nonce, never reused.
- ✅ DEKs wrapped with AES Key Wrap with Padding under an env-loaded KEK.
- ✅ AAD binds ciphertext to immutable `file_uuid` + owner.
- ✅ Key versioning + rotation command (`rotate_file_keys`).
- ✅ Legacy migration command (`encrypt_existing_files`, dry-run + verify).
- ✅ Permission-first decryption on all preview/download/zip/share paths.
- ✅ P1 field encryption: `ProofRecord.notes` (AAD-bound, migrated).
- 🟡 Org files, request submissions, export artifacts — **deferred**.

## Key management
- ✅ KEKs loaded from environment only; never in DB, logs, API, or frontend.
- ✅ Production fails closed if the active KEK is missing/invalid.
- ✅ `generate_encryption_key` for local dev; `.env.example` placeholders only.
- ⛔ Production secret manager + key backup — **required before launch**.

## Access codes & tokens
- ✅ Access codes hashed (`make_password`), never stored/serialized/logged plain.
- ✅ Public tokens high-entropy random; excluded from serializers/founder views.
- 🟡 Lookup-token hashing at rest — recommended (P2).

## Passwords
- ✅ Django hashing; explicit `PASSWORD_HASHERS` with PBKDF2 first.
- 🟡 Argon2 upgrade pending `argon2-cffi` + deploy support.

## Logging
- ✅ No keys, DEKs, plaintext, OCR text, access codes, tokens, or paths in logs.
- ✅ Decryption failures log safe category only; user sees a generic message.
- ✅ Audit / operational / scheduled-job sinks sanitize metadata; audit hashes
  IP/UA (salted SHA-256).
- ✅ Activity trails (file/room/document/emergency) sanitize metadata via
  `safe_audit_metadata` (Security & Compliance Hardening V1). Raw IP/UA in those
  trails is owner-visible only — see risk R-1 in
  `docs/security-compliance-hardening-v1.md`.

## Founder visibility
- ✅ Security overview shows encrypted / plaintext-legacy / failed counts,
  active KEK version, and files-by-key-version (no key material).

## Launch readiness (encryption-related blockers)
- ✅ All new uploads encrypted.
- ⛔ Legacy plaintext migration complete in production.
- ✅ Access codes hashed.
- ✅ No raw keys/tokens/codes in logs.
- ✅ Key rotation documented.
- ⛔ Production secret management, backups, monitoring, external review.

> Encryption being implemented does **not** make CertaNest production-ready.
> Deployment hardening, backups, monitoring, email, and an external security
> review are still required.

## Hardening pass (see docs/SECURITY_HARDENING_REPORT.md)
- ✅ Production Django security settings (SSL/HSTS/secure cookies/nosniff/
  referrer/X-Frame; explicit CORS + CSRF_TRUSTED_ORIGINS). `check --deploy`
  passes (only HSTS subdomains/preload intentionally off).
- ✅ Security headers middleware (CSP/Permissions-Policy/COOP in production;
  public-route noindex/no-referrer/no-store always).
- ✅ Rate limiting: login, register, file-share/emergency/room/quick-share
  codes, feedback, waitlist, invite validation.
- ✅ Object-level permission (IDOR) regression tests.
- ✅ Founder-permission + serializer-leak + public-route-header tests.
- ✅ Log redaction filter wired into LOGGING.
- ✅ Founder console + Global Map privacy verified (no raw IP/GPS/tokens/codes).

## P2 foundations (documented, NOT implemented — future work)
- ⛔ MFA/TOTP for founder/admin accounts.
- ⛔ Device/session management + revocation UI.
- ⛔ Account lockout policy (cache-based, building on failed-login events).
- ⛔ CAPTCHA/human challenge for public abuse-prone forms.
- ⛔ Object-storage signed-URL hardening (after S3 migration).
- ⛔ External secret manager + KEK backup/rotation runbook.
- ⛔ CSP nonces/Report-Only rollout for the Next.js frontend.

## Launch blockers (must clear before public launch)
- ✅ Private object storage with presigned URLs (Cloudflare R2).
- ✅ Upload magic-byte sniffing + AV scan code (ClamAV, fail-closed).
- ✅ Privacy/security pages (`/privacy`, `/security`, in-app Trust Center).
- ⛔ Production secret manager + KEK backups.
- ⛔ Enable + monitor ClamAV in production; enable Redis cache (cluster-wide
  throttles/lockouts).
- ⛔ Monitoring/alerting, backups, email delivery.
- ⛔ External security review + penetration test.

See `docs/security-compliance-hardening-v1.md` for the full risk register and
retention-policy foundation.
