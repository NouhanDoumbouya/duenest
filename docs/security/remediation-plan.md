# DueNest — Security Remediation (SEC-001 … SEC-012)

Implementation record for the remediation sprint addressing the findings in
[expert-cybersecurity-audit.md](expert-cybersecurity-audit.md).

Branch: `security/remediate-cybersecurity-audit-findings`

| ID | Status | Summary |
|---|---|---|
| SEC-001 | ✅ Done | Per-resource access-code lockout + throttles + strong codes |
| SEC-002 | ✅ Done | Organization files & public submissions encrypted at rest |
| SEC-003 | ✅ Done | Public upload throttled, validated, malware-scanned, capped |
| SEC-004 | ✅ Done | Billing fails closed on insecure (manual) provider in prod |
| SEC-005 | ✅ Done | Shared secure-upload validation + malware scan on vault uploads |
| SEC-006 | ✅ Done | jsPDF upgraded 3.0.4 → 4.2.1 (critical/high advisories cleared) |
| SEC-007 | ✅ Backend done | Password reset + email verification (frontend pages pending) |
| SEC-008 | ✅ Done | Client error-log endpoint throttled + payload-bounded |
| SEC-009 | ✅ Done | Founder access via allowlist + action auditing |
| SEC-010 | ✅ Config + docs | HSTS is env-driven; rollout documented below |
| SEC-011 | ✅ Done | Quick Share code no longer persisted in sessionStorage |
| SEC-012 | ✅ Done | Legacy plaintext detection + migration commands |

---

## SEC-001 — Public access-code brute-force hardening

- New module [`apps/core/security/public_access.py`](../../backend/apps/core/security/public_access.py):
  - `check_public_access_code(kind, identifier, supplied_code, access_code_hash)` — verifies and enforces a **per-resource lockout** (cache-backed) so wrong codes lock *that* share link / emergency pack / room / quick share for everyone, not just one IP.
  - `generate_strong_access_code()` — ambiguity-safe 10-char alphanumeric (≈49 bits) replacing the old 6-digit numeric space.
  - `validate_access_code_strength()` — rejects weak owner-supplied codes at creation.
- Wired into every code-accepting public route in `documents/views.py` and `quick_share/views.py` (metadata, preview, download, item, verify). Each also carries the `public_access_code` scoped throttle.
- Codes are only stored hashed; legacy hashes still verify.
- **Settings:** `PUBLIC_ACCESS_CODE_MAX_ATTEMPTS` (8), `PUBLIC_ACCESS_CODE_LOCKOUT_MINUTES` (15), `PUBLIC_ACCESS_CODE_BACKOFF_ENABLED` (True), `PUBLIC_ACCESS_CODE_MIN_LENGTH` (6).
- **Cache note:** lockout/throttle state is in the Django cache. In multi-process production configure a shared cache (Redis/DB) so it is enforced cluster-wide.
- Tests: `apps/documents/test_public_access_lockout.py`.

## SEC-002 — Organization file encryption at rest

- New [`apps/core/security/encryption.py::seal_blob/open_blob`](../../backend/apps/core/security/encryption.py) — self-describing AES-256-GCM envelope (KEK version + nonce + wrapped DEK + ciphertext) reusing the vault's primitives.
- New [`apps/organizations/file_encryption.py`](../../backend/apps/organizations/file_encryption.py) — encrypt/decrypt org document files and public submissions; AAD bound to `file_uuid` + organization.
- Models gain `file_uuid` + `is_encrypted` (migration `0003`). New uploads store ciphertext; legacy rows read as-is until migrated.
- Scoped, **decrypt-after-authorization** download views added (member/role-checked); serializer exposes a scoped `download_url`, never a raw storage path.
- Migration command `encrypt_legacy_org_files --dry-run/--confirm` (verifies decryption before switching; never deletes plaintext early).
- Tests: `apps/organizations/test_file_encryption.py`.

## SEC-003 — Public document-request upload hardening

- `PublicDocumentRequestView` (POST only): scoped throttle (`public_document_upload`), per-request submission count + total-size caps, server-side content sniffing, malware scan (fail-closed 503), encryption at rest, expired/closed rejection. No raw storage path in responses.
- **Settings:** `PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS` (20), `PUBLIC_DOCUMENT_REQUEST_MAX_TOTAL_MB` (50), `CLAMD_*`.
- Tests: `apps/organizations/test_public_upload_security.py`.

## SEC-004 — Billing webhook production safety

- `apps/billing/providers.py`: `validate_billing_configuration()` + `manual_provider_allowed()`. The unsigned **manual** provider is rejected unless `BILLING_ALLOW_MANUAL_PROVIDER` (dev/test only); `BILLING_PROVIDER=stripe` requires `STRIPE_SECRET_KEY`/`PUBLISHABLE_KEY`/`WEBHOOK_SECRET`.
- `get_provider()` refuses the manual provider where not permitted (webhook → 400); `BillingConfig.ready()` fails boot in production.
- Stripe signature verification + idempotency unchanged; prices remain server-resolved (frontend cannot choose a price).
- Tests: `apps/billing/test_webhook_security.py`.

## SEC-005 — Vault upload validation + malware scanning

- New [`apps/core/security/file_validation.py`](../../backend/apps/core/security/file_validation.py): magic-byte sniffing, extension/type consistency (rejects content-type spoofing), best-effort structural checks, ClamAV scan.
- `DocumentFileUploadSerializer` sniffs content server-side; `_create_document_file` scans for malware and fails closed (503) when required-but-unavailable.
- Tests: `apps/documents/test_secure_upload.py`.

## SEC-006 — jsPDF upgrade

- `jspdf` 3.0.4 → 4.2.1; `npm audit` no longer reports jsPDF advisories. Usage is `addImage/addPage/output` only (no `addJS`/AcroForm/`html`), so non-breaking; `npm run build` + lint pass.
- Residual `npm audit` items are dev-only (vitest/vite/esbuild) and build-time (postcss), not shipped to users.

## SEC-007 — Password reset & email verification (backend)

- [`apps/users/account_recovery.py`](../../backend/apps/users/account_recovery.py): password reset via Django's single-use, time-limited token (generic responses — no email enumeration); email verification via signed time-limited token.
- Endpoints: `POST /auth/password-reset/`, `/auth/password-reset/confirm/`, `/auth/email/send-verification/`, `/auth/email/verify/` (all rate-limited).
- `User.email_verified`/`email_verified_at` (migration `0005`). Password signups send a verification email; Google accounts are verified on signup/link.
- **Settings:** `PASSWORD_RESET_TOKEN_HOURS` (1), `EMAIL_VERIFICATION_TOKEN_HOURS` (48); `PASSWORD_RESET_TIMEOUT` derived.
- Emails use Django's configured `EMAIL_BACKEND` (console in dev) — not faked.
- Tests: `apps/users/test_account_recovery.py`.
- **Remaining:** frontend `reset-password` / `verify-email` pages are not yet built (the API is ready). Optionally gate sensitive actions on `email_verified`.

## SEC-008 — Client error-log throttling

- `client_error` scoped throttle (30/min) on `ClientErrorLogCreateView`; serializer caps `message` (2000), `error_type`/`path` (500), `metadata` (4 KB).
- Tests: `apps/founder/test_client_error_throttle.py`.

## SEC-009 — Founder access hardening

- `IsFounderUser` no longer treats every `is_staff` account as founder. Superusers always qualify; other staff must be on `FOUNDER_EMAILS`. `FOUNDER_ALLOW_ALL_STAFF` is a dev-only convenience (on in dev/test, off in prod).
- Sensitive founder actions audited via `duenest.founder.audit` (growth export, manual grant/revoke).
- Tests: `apps/founder/test_founder_access.py`.

## SEC-010 — HSTS production hardening

HSTS is already env-driven in `config/settings/production.py`:

```
DJANGO_HSTS_SECONDS=3600          # raise to 31536000 (1 year) once stable
DJANGO_HSTS_INCLUDE_SUBDOMAINS=False  # True only when ALL subdomains are HTTPS
DJANGO_HSTS_PRELOAD=False             # True only after a year + subdomains, then submit to hstspreload.org
```

Rollout: ship `SECONDS=3600` first → after a stable HTTPS period raise to 1 year → enable `INCLUDE_SUBDOMAINS` once every subdomain is HTTPS → finally enable `PRELOAD` and submit the domain. `python manage.py check --deploy` reports W005/W021 until subdomains/preload are enabled (expected).

## SEC-011 — Quick Share code not persisted

- New `frontend/src/lib/quick-share-handoff.ts` — one-time, in-memory handoff of the freshly generated access code from the wizard to the detail page. No `sessionStorage`/`localStorage`; gone after reload (shown once).

## SEC-012 — Legacy plaintext detection + migration

- `python manage.py audit_legacy_plaintext_files` — read-only report across vault + org storage; exits non-zero if any plaintext remains (CI / pre-launch gate).
- Migration: `encrypt_existing_files` (vault, pre-existing) and `encrypt_legacy_org_files` (org). Both verify decryption before deleting plaintext.
- Tests: `apps/documents/test_legacy_audit.py`.

---

## New / changed environment variables

See [`backend/.env.example`](../../backend/.env.example): `BILLING_ALLOW_MANUAL_PROVIDER`, `PUBLIC_ACCESS_CODE_*`, `PUBLIC_DOCUMENT_REQUEST_*`, `CLAMD_*`, `FOUNDER_EMAILS`, `FOUNDER_ALLOW_ALL_STAFF`, `PASSWORD_RESET_TOKEN_HOURS`, `EMAIL_VERIFICATION_TOKEN_HOURS`.

## Production prerequisites (operator checklist)

1. `BILLING_PROVIDER=stripe` with all Stripe keys (or accept that billing is disabled). Never set `BILLING_ALLOW_MANUAL_PROVIDER=True` in production.
2. Shared cache (Redis/DB) so SEC-001 lockouts + throttles are cluster-wide.
3. `CLAMD_ENABLED=True` + `CLAMD_FAIL_CLOSED=True` with a running clamd for upload scanning.
4. `FOUNDER_EMAILS` set to the real founder address(es); `FOUNDER_ALLOW_ALL_STAFF` unset/False.
5. Real `EMAIL_PROVIDER`/SMTP for password-reset & verification delivery.
6. Run `python manage.py audit_legacy_plaintext_files` and migrate any plaintext before launch.
7. Plan the HSTS rollout (SEC-010).
