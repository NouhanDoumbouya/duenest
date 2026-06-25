# Security & Compliance Hardening V1

Status: **delivered** (private-beta hardening pass). This is a hardening,
review, and documentation pass — **not** a production-readiness sign-off and
**not** a compliance certification. See "Honesty & non-claims" below.

CertaNest stores sensitive life documents, public upload links, sharing rooms,
reminder emails, audit logs, and organization-portal data. This document is the
single reference for our security posture, the risk register, and the retention
policy foundation for the private beta.

Related references (kept aligned, not duplicated here):

- `docs/security-plan.md` — broad security plan.
- `docs/SECURITY_HARDENING_REPORT.md` — production settings / headers / JWT pass.
- `docs/SECURITY_PRIVACY_CHECKLIST.md` — living encryption/privacy checklist.
- `docs/PUBLIC_LINK_SECURITY.md` — public token route protections.
- `docs/FILE_UPLOAD_SECURITY.md` — upload validation pipeline.
- `docs/ENCRYPTION.md` — at-rest encryption design.

---

## What V1 changed (code)

This branch is intentionally small in code surface because most controls already
exist. The one code change is a **defense-in-depth privacy fix** to owner-visible
activity trails:

- `apps/documents/services.py` — `log_activity` (file), `log_room_activity`,
  `log_document_activity`, and `log_emergency_event` now route their `metadata`
  through `safe_audit_metadata` (`apps/documents/audit.py`) before persisting.
  These trails record actions taken by **anonymous public-link visitors** as well
  as the owner, so a token, private URL, storage key, or raw document/OCR text
  passed by accident can no longer land in a record the owner (or a future data
  export) reads back. Forbidden-looking keys (`*token*`, `*url*`, `*key*`,
  `*content*`, `*access_code*`, …) are dropped; safe operational keys
  (`count`, `format`, `action`, …) survive.
- Tests: `apps/documents/test_activity_metadata_privacy.py` (file/room/document/
  emergency trails strip sensitive keys; logging never raises on bad metadata).

No new models, no migrations, no new API endpoints, no AI calls, no storage or
billing changes. The unified `AuditLogEntry`, `OperationalEvent`, and
`ScheduledJobRun` sinks were already sanitized and remain unchanged.

---

## Core questions this pass answers

**1. What data does CertaNest store?** Account profile (email, hashed password,
optional identity details in an AAD-bound encrypted field), documents and files
(content **encrypted at rest**, AES-256-GCM envelope, per-file DEK), deadlines/
reminders, application packs, share links / sharing rooms / document requests,
audit and activity trails, operational/scheduled-job telemetry, email routing
logs, AI usage accounting, and organization/portal records.

**2. What is never cached or exposed?** Document contents, extracted/OCR text, AI
prompts and responses, private/presigned file URLs, R2 object keys, raw public
tokens, password-reset tokens, access codes (only hashed), and secrets/API keys.
The service worker (`frontend/public/sw.js`) **never** caches `/api/*`, share /
quick-share / emergency / room / org-request / invite routes, file bytes, or
authenticated navigation HTML.

**3. How can users manage account/data risk?** Settings → Data offers a
secret-free structured **data export request** and a **cancellable account
deletion request** (recorded first, never executed synchronously). Settings → AI
offers AI consent and a privacy/masking toggle. The in-app **Trust Center**
(`/dashboard/trust`) summarizes implemented controls and honest limitations.

**4. Are public links safe from abuse?** Yes — high-entropy random tokens
(`secrets.token_urlsafe(32)`), per-resource lockout with exponential backoff on
access codes, hashed access codes (`make_password`), expiry/revocation enforced
on every access, content served only through owner-scoped proxy endpoints (never
raw storage URLs), and per-scope DRF throttles. Public pages expose only the
items the owner explicitly added — never the wider vault, folders, tags, or
custom fields. See the public-link review below.

**5. Are file uploads hardened?** Yes — centralized `validate_secure_upload`
(`apps/core/security/file_validation.py`): size cap, extension + declared-MIME
allowlist, **server-side magic-byte sniffing** (extension/MIME cannot be spoofed),
structural validation (pypdf / Pillow), and optional **ClamAV** scan
(fail-closed in production). Object keys are UUID-based — user-supplied filenames
never enter the storage path, so path traversal is impossible. Avatars/logos are
re-encoded through Pillow (strips scripts/SVG/EXIF).

**6. Are audit logs and operational logs privacy-safe?** Yes — `AuditLogEntry`,
`OperationalEvent`, and `ScheduledJobRun` all sanitize metadata and (for audit)
store only salted-SHA-256 hashes of IP/User-Agent. `EmailLog` and `AiUsage`
store routing/accounting metadata only (no bodies, no prompts, no responses).
V1 extends the same sanitizer to the document/file/room/emergency activity
trails (see "What V1 changed").

**7. Are privacy/security policies aligned with product behavior?** The public
`/security` and `/privacy` pages and the in-app Trust Center describe encryption
at rest, owner-scoped access, selected-item sharing, expiry/revocation, hashed
access codes, secret-free exports, and explicit beta limitations — all matching
the implementation. This doc and the reconciled hardening report/checklist bring
the engineering docs back in line with the current (more mature) code.

**8. Are deletion/export/retention flows clearly defined?** Export and deletion
requests exist as cancellable, review-first records (no irreversible synchronous
deletion). Retention is defined below as a **policy foundation** — documented
intent plus the controls that already exist; automated enforcement of every
category is deferred and called out honestly.

---

## Security hardening checklist

Legend: ✅ implemented · 🟡 partial / documented · ⛔ deferred (with owner).

| Area | State | Notes |
|---|---|---|
| Authentication | ✅ | SimpleJWT (15-min access / 7-day refresh, rotation + blacklist) in HttpOnly cookies; CSRF double-submit for cookie auth; generic login errors (no enumeration). |
| Authorization | ✅ | Owner-scoped `get_queryset` everywhere; foreign IDs 404; IDOR regression tests (`apps/core/test_security.py`). |
| Public links | ✅ | Random tokens, hashed codes, per-resource lockout + backoff, expiry/revocation, proxy-only downloads, selected-item-only exposure. |
| Storage (R2/S3) | ✅ | Private bucket, presigned URLs (≈5-min expiry), encrypt-before-store, UUID keys; no public ACL. |
| Uploads | ✅ | Size + extension + MIME + magic-byte + structural validation; ClamAV fail-closed in prod; Pillow re-encode for avatars/logos. |
| Encryption at rest | ✅ / 🟡 | AES-256-GCM envelope, per-file DEK, AAD-bound. Org files / request submissions / export artifacts encryption tracked in `SECURITY_PRIVACY_CHECKLIST.md`. |
| Audit logs | ✅ | `AuditLogEntry` owner-scoped; salted-hashed IP/UA; allow/deny-list metadata sanitizer; hashes never serialized. |
| Operational logs | ✅ | `OperationalEvent` founder-only; recursive metadata sanitizer; no IP/UA; error codes (not raw traces). |
| Scheduled-job logs | ✅ | `ScheduledJobRun` metadata sanitized; counts/correlation IDs only. |
| Activity trails | ✅ (V1) | File/room/document/emergency trails now sanitize metadata (this branch). Raw IP/UA still stored, **owner-visible only** — see risk register R-1. |
| Email | ✅ | `EmailLog` stores type/recipient/subject/outcome only — never bodies or secrets. |
| AI privacy | ✅ | Opt-in consent + privacy masking; `AiUsage` stores token/cost accounting only — never prompts/responses/document text; degrades to "not configured". |
| PWA / offline | ✅ | Service worker never caches API, sensitive routes, file bytes, tokens, or auth HTML. |
| Backups / retention | 🟡 | Trash purge command exists (dry-run + `ScheduledJobRun` visibility). Per-category retention enforcement is partly documented-only — see below. |
| Account deletion / export | ✅ / 🟡 | Cancellable review-first requests; full raw-file ZIP export deferred (R-5). |
| Rate limits | ✅ | ~30 scoped DRF throttles (login, register, password reset, public access, public upload, AI, scanner, …). |
| Admin / founder access | ✅ | `IsFounderUser`; aggregates + safe counts only; **founder views never read file bytes**; no impersonation. |
| Beta launch risks | 🟡 | External secret manager, monitoring/alerting, backups, and an external security review remain launch blockers (tracked below + in the checklist). |

---

## Risk register

Priority: P1 (address before broad beta) · P2 (before public launch) · P3 (track).

| ID | Risk | Impact | Current mitigation | Remaining gap | Priority | Owner / follow-up |
|---|---|---|---|---|---|---|
| R-1 | Document/file/room activity trails store **raw IP + User-Agent** | Network fingerprint retained (owner-visible only) | Owner-scoped; metadata now sanitized (V1); unified `AuditLogEntry` already hashes IP/UA | Align trails to hashed IP/UA, or keep raw as an intentional owner-facing "who accessed my share" signal and state it in `/privacy` | P2 | `security/activity-trail-fingerprint-hashing` |
| R-2 | `ProductEvent` (analytics) stores **raw IP/UA/country** | Founder-only analytics retains fingerprints | Founder-only access; metadata sanitized | Hash IP/UA (reuse `hash_request_fingerprint`). **Lives in `apps/founder/` — deferred to avoid colliding with the in-flight founder-admin branch** | P2 | after `support/founder-admin-tools-v1` merges |
| R-3 | No malware scanning unless ClamAV is enabled | Malicious upload stored | Magic-byte + structural validation always on; ClamAV fail-closed when `CLAMD_ENABLED` | Enable + monitor ClamAV in production | P1 | infra / deploy |
| R-4 | Throttles are per-view (no global default) | An endpoint added without a throttle is unlimited | Sensitive/public endpoints all throttled today | Consider a conservative `DEFAULT_THROTTLE_CLASSES` fallback (must not break normal beta usage) | P3 | backend |
| R-5 | Data export excludes raw document files | User cannot self-serve a full archive | Secret-free structured export exists; deletion is review-first | Build full encrypted-file ZIP export (out of V1 scope) | P2 | `product/full-data-export` |
| R-6 | Throttle/lockout state is per-process without Redis | Lockouts/throttles not cluster-wide in lean mode | Documented; Redis cache supported | Enable `ENABLE_REDIS_CACHE` + `REDIS_URL` in production | P1 | infra / deploy |
| R-7 | Backend `AppErrorLog` stores raw tracebacks | A traceback could contain incidental sensitive text | Founder-only; frontend errors never store traces; metadata sanitized | Optionally pass tracebacks through the log redaction filter. **Lives in `apps/founder/` — deferred (founder branch)** | P3 | after founder branch merges |
| R-8 | Account deletion fulfillment is manual | Requests need an operator to complete | Requests recorded + cancellable; no silent deletion | Define the founder/operator fulfillment runbook (deferred until founder-admin merges) | P2 | ops runbook |
| R-9 | No external secret manager / KEK backup | Key loss or env-var leak risk | KEKs env-loaded only; prod fails closed if missing | Adopt a managed secret store + KEK backup/rotation runbook | P2 | infra / deploy |
| R-10 | No MFA / device-session management | Account takeover via credential theft | Strong password hashing; short-lived access tokens | MFA + session revocation (documented P2 foundation) | P2 | `security/mfa-sessions` |

No certifications are claimed (see below). The above is an honest, living list.

---

## Retention policy foundation

Defines intended retention per category. Where automated enforcement is not yet
complete, that is stated. **CertaNest does not auto-delete user data
unexpectedly**, and any purge runs with a dry-run and `ScheduledJobRun` visibility.

| Category | Intended retention | Current behavior |
|---|---|---|
| Public share / room links | Owner-set expiry; owner revocation any time | ✅ Enforced on every access; expired/revoked fail safely |
| Document-request uploads | Kept until owner accepts/rejects or removes | ✅ Owner-controlled; encrypted at rest |
| Rejected/replaced uploads | Removable by owner; not surfaced publicly | 🟡 Owner-controlled; no automatic purge timer |
| Trashed documents | Purge after retention window | ✅ `purge_expired_trash` command (dry-run + job-run visibility) |
| Audit log entries | Retain for the owner's security history | 🟡 No automatic trim yet (documented) |
| Operational events | Operational retention window | 🟡 No automatic trim yet (documented) |
| Email logs | Routing metadata for delivery audit | 🟡 No automatic trim yet (documented) |
| AI usage records | Accounting/metering history | 🟡 No automatic trim yet (documented) |
| Account deletion requests | Retain request record until fulfilled/cancelled | ✅ Status-tracked; cancellable while pending |

Follow-up branch `ops/retention-enforcement` would add bounded, dry-run-first
purge jobs for the 🟡 categories (audit/operational/email/AI), reusing the
existing scheduled-job runner so every run is visible and safe.

---

## Deferred (honestly out of scope for V1)

- Antivirus is **present** (ClamAV, fail-closed) but must be **enabled +
  monitored** in production (R-3).
- Founder-app log fingerprint hashing (`ProductEvent`, `AppErrorLog`
  traceback redaction) — deferred to avoid colliding with the parallel
  founder-admin branch (R-2, R-7).
- Full raw-file **ZIP data export** (R-5).
- MFA/TOTP, device/session management + revocation UI (R-10).
- External secret manager + KEK backup/rotation runbook (R-9).
- SOC 2 / HIPAA / GDPR certification automation, SSO/SAML, DLP/redaction
  automation, external security-vendor integration — **not pursued**.

## Honesty & non-claims

CertaNest does **not** claim to be SOC 2 certified, HIPAA compliant, GDPR
certified, "bank-grade", "military-grade", or zero-knowledge. Encryption keys are
managed server-side (envelope encryption), so this is **not** a zero-knowledge
architecture, and the product cannot prevent screenshots of shared content.
Watermarking deters but does not prevent re-sharing. These same honest limits are
stated to users on `/security` and in the Trust Center.
