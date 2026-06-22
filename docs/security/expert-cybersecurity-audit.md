# CertaNest — Expert Cybersecurity Audit

**Audit type:** Authorized, internal application-security review (pre-launch SaaS storing sensitive life documents)
**Reviewer role:** Senior application-security engineer
**Date:** 2026-06-16
**Branch:** `security/expert-cybersecurity-audit`
**Commit reviewed:** `c3003cd` (main)
**Scope:** Full monorepo — Django backend (`backend/`) + Next.js frontend (`frontend/`)
**Method:** Manual code review + safe local checks (no external scanning, no destructive actions, no secret exfiltration)

> This report describes risks found by reading the actual code. No secrets are printed. No fixes were implemented (the task was audit-only). A proposed remediation plan with branch names is included at the end.

---

## 1. Executive summary

CertaNest is a **notably security-conscious codebase** for a pre-launch product. The team has clearly invested in the hard parts: envelope encryption of vault files (AES-256-GCM with per-file wrapped DEKs and AAD binding), HttpOnly-cookie JWT auth with CSRF enforcement on the cookie path, consistent owner-scoped querysets (strong protection against IDOR), high-entropy share tokens (`secrets.token_urlsafe(32)`), hashed access codes (`make_password`/`check_password`), provider-neutral private-by-default object storage, a security-headers middleware, a log-redaction filter, and verified Stripe webhook signatures with idempotency.

`python manage.py check --deploy` against the production settings module is essentially clean (only the intentionally-conservative HSTS choices flag). Object-level authorization on the personal vault is implemented correctly and consistently.

The findings below are therefore **not** a story of a broadly insecure app. They are a focused set of real gaps that matter *because* CertaNest stores passports, visas, IDs and financial papers:

- An **access-code brute-force bypass** on the public share / emergency / room endpoints (the dedicated verify endpoints are throttled, but the metadata/preview/download endpoints that accept the same code header are not).
- **Organization document files and public-request submissions are stored unencrypted** (plain `FileField`), diverging from the encryption-at-rest guarantee the personal vault provides and the product markets.
- An **unauthenticated public upload endpoint** with no rate limit and no malware scan.
- The **billing webhook defaults to "manual" mode**, which accepts unsigned JSON — a billing-bypass / privilege-escalation risk if shipped with the default provider.
- A vulnerable **`jsPDF`** dependency (multiple High/Critical advisories).

None of these are "the app is wide open." All are fixable with focused work before public launch.

## 2. Overall security posture score

**7.0 / 10**

Rationale: The cryptographic and authorization foundations are strong (would score 8.5+ on those alone). Points are deducted for the access-code brute-force bypass on the most sensitive public routes, the unencrypted organization-file storage path that contradicts the product's core privacy promise, the unauthenticated/unthrottled public upload, the default-manual billing webhook, and a known-vulnerable client PDF dependency.

## 3. Launch readiness verdict

| Gate | Verdict | Conditions |
|---|---|---|
| **Closed private beta** (current `PRIVATE_BETA_ENABLED` flow) | **Conditional GO** | Acceptable for invited, trusted users *if* SEC-001 (access-code brute force) is mitigated and SEC-004 (manual webhook) is not reachable in the deployed config. SEC-002 should be disclosed to org pilot users. |
| **Public SaaS launch** | **NO-GO until SEC-001, SEC-002, SEC-003, SEC-004, SEC-006 are fixed** | These five are the must-fix set. The remainder are strongly recommended hardening. |

## 4. Architecture security map

```
Browser SPA (Next.js 16, React 19)
  - Auth tokens in HttpOnly cookies (no localStorage token storage; legacy keys cleaned up)
  - CSRF token cookie (JS-readable) echoed as X-CSRFToken on writes
  - Service worker (public/scanner-sw.js): caches ONLY OpenCV.js; never API/docs
        |
        |  /api/v1/*  (same-site; Next proxies in dev)
        v
Django 5.2 + DRF
  Middleware: CORS -> SecurityMiddleware -> Sessions -> Common -> CSRF
              -> Auth -> Messages -> XFrameOptions -> SecurityHeadersMiddleware
  AuthN: apps.users.cookie_auth.CookieJWTAuthentication
         (cookie-first; Bearer fallback; CSRF enforced only on cookie+unsafe)
  AuthZ default: IsAuthenticated; per-view AllowAny for public token routes
  Apps:
    users          - register/login/google/refresh/logout, account export/deletion
    documents      - vault, files (ENCRYPTED at rest), share links, emergency packs,
                     share rooms, bundles, scanner, checklists, calendar  (4.6k-line views)
    organizations  - multi-tenant workspaces, org documents/files (PLAIN FileField),
                     public document-request uploads, secure rooms
    quick_share    - SafeSend / DN-code shares (account-to-account + public)
    billing        - plans, checkout, portal, promo, Stripe webhook, manual provider
    subscriptions  - user-tracked external subscriptions (Money Radar)
    notifications  - email/reminder delivery (provider-neutral, fail-honest)
    founder        - founder/admin console + growth CRM (IsFounderUser = is_staff)
    features       - feature flags
    core           - security middleware, encryption, key_provider, logging redaction,
                     storage config, pagination
  Crypto: AES-256-GCM envelope encryption; KEKs from env only (fail-closed in prod)
  Storage: provider-neutral; local FS (dev) or S3-compatible (private, signed-URL, no ACL)
           Vault files = app-encrypted ciphertext, streamed via authenticated views.
           Org files   = plaintext via Django FileField  <-- divergence (SEC-002)
  DB: SQLite (dev) / PostgreSQL-ready (prod)
```

**Public (AllowAny) attack surface (token-gated unless noted):**
`/api/v1/share/...`, `/api/v1/quick-share/claim/...`, `/api/v1/public/...`,
emergency pack viewer, share rooms, org document-request upload (**unauthenticated write**),
org secure rooms (metadata only), `/billing/plans/`, `/billing/webhook/`, `/auth/*`
(register/login/google/refresh/logout/csrf), founder waitlist/invite-validate/feedback/client-error-log,
`/features/*`.

## 5. Threat model (STRIDE)

| Asset | Spoofing | Tampering | Repudiation | Info disclosure | DoS | Elev. of priv. |
|---|---|---|---|---|---|---|
| User account | Google token verified server-side; pwd hashed (PBKDF2) ✔ | — | login/security events tracked ✔ | — | login throttle 10/min ✔ | — |
| Vault documents/files | owner-scoped querysets ✔ | AAD-bound AES-GCM ✔ | activity log ✔ | encrypted at rest ✔ | upload size cap 10MB ✔ | IDOR-resistant ✔ |
| **Org documents/files** | membership/role checks ✔ | — | activity log ✔ | **plaintext at rest (SEC-002)** | **unauth upload, no throttle/AV (SEC-003)** | role-escalation guarded ✔ |
| Share / emergency / room tokens | 256-bit tokens ✔ | revoke/expiry enforced ✔ | per-link activity log ✔ | no file-exists leak ✔ | verify throttled; **preview/meta not (SEC-001)** | **6-digit code brute force (SEC-001)** |
| Emergency access | code at request-time ✔ | unlock modes enforced ✔ | emergency event log ✔ | items hidden until unlock ✔; location off by default ✔ | throttle on request ✔ | selected-items-only ✔ |
| Billing state | Stripe sig verified ✔ | idempotent events ✔ | BillingEvent log ✔ | secrets server-only ✔ | — | **manual webhook unsigned (SEC-004)** |
| Founder/CRM data | IsFounderUser gate ✔ | — | — | mass export by any staff (SEC-009) | client-error log unthrottled (SEC-008) | is_staff == full access (SEC-009) |
| Encryption keys (KEK/DEK) | env-only, never in DB/logs ✔ | fail-closed validation ✔ | — | log redaction net ✔ | — | — |
| Offline cached scans | — | — | — | SW caches no private data ✔ | queue best-effort ✔ | — |

## 6. Attack surface inventory

- **Authenticated API:** vault CRUD, files, shares, emergency, rooms, bundles, scanner, calendar, subscriptions, notifications, billing, organizations, account export/deletion. All default `IsAuthenticated` with owner/membership scoping.
- **Public token routes:** share file (metadata/verify/preview/download), quick-share claim (metadata/verify/accept/decline/extension/preview/download/save-copy/receive-code), emergency (metadata/unlock-request/status/verify/item-preview/item-download), share rooms (metadata/verify/preview/download/zip), org public document-request (GET/POST upload), org public secure room (metadata).
- **Public unauthenticated writes:** registration, Google auth, waitlist, invite-validate, feedback, client-error-log, **org document-request file upload**, billing webhook.
- **Frontend:** SPA pages, one `dangerouslySetInnerHTML` (static JSON-LD only — safe), scanner service worker, localForage offline scan queue.

## 7. Findings table

| ID | Severity | Title | Status |
|---|---|---|---|
| SEC-001 | **High** | Access-code brute-force bypass on public share/emergency/room preview & metadata routes | Open |
| SEC-002 | **High** | Organization document files & public-request submissions stored unencrypted | Open |
| SEC-003 | **Medium** | Unauthenticated public upload endpoint: no rate limit, no malware scan | Open |
| SEC-004 | **High** | Billing webhook defaults to "manual" provider (accepts unsigned events) | Open |
| SEC-005 | **Medium** | Primary vault upload lacks magic-byte/content validation & AV (scanner-only) | Open |
| SEC-006 | **Medium** | Vulnerable `jsPDF` dependency (High/Critical advisories) | Open |
| SEC-007 | **Low** | No password-reset / email-verification flow for password accounts | Open |
| SEC-008 | **Low** | `ClientErrorLogCreateView` is AllowAny with no throttle (log flooding) | Open |
| SEC-009 | **Low** | Founder console = `is_staff`/`is_superuser`; staff gets mass export, no scoping | Open |
| SEC-010 | **Info** | HSTS conservative (no includeSubDomains/preload) | Accepted-by-design |
| SEC-011 | **Low** | Owner Quick Share access code persisted in `sessionStorage` | Open |
| SEC-012 | **Low** | Legacy `PLAINTEXT_LEGACY` file records may remain unencrypted | Verify |

---

## 8. Detailed findings

### SEC-001: Access-code brute-force bypass on public share / emergency / room routes

- **Severity:** High
- **Area:** Public sharing, Emergency Access, Secure Rooms, Quick Share — authentication/anti-automation
- **Affected files:**
  - [backend/apps/documents/views.py](../../backend/apps/documents/views.py) — `_generate_access_code` (L1156), `_check_access_code` (L1467), `PublicSharedFileMetadataView` (L1582), `PublicSharedFilePreviewView` (L1675), `PublicSharedFileDownloadView` (L1709), `_check_pack_access_code` (L3429), `PublicEmergencyPackMetadataView` (L3512), `_PublicEmergencyItemMixin` (L3697), `_check_room_code`/`PublicShareRoomMetadataView` (L4409), `_PublicRoomFileMixin` (L4474)
  - [backend/config/settings/base.py](../../backend/config/settings/base.py) — throttle rates (L317-339)
- **Description:** Public access codes are **6-digit numeric** (`f"{secrets.randbelow(1_000_000):06d}"`, only 10⁶ possibilities) or owner-supplied (which may be even weaker, e.g. `1234`). The dedicated *verify* endpoints (`PublicSharedFileVerifyCodeView`, `PublicEmergencyPackVerifyCodeView`, `PublicShareRoomVerifyCodeView`, `QuickShareVerifyCodeView`) are correctly throttled (`share_file_code`/`emergency_code`/`room_code`/`quick_share_code` = 10/min). **However**, the *metadata*, *preview*, *download* and *item* endpoints accept the same raw code via the `X-Access-Code` header and call `check_password(...)` directly, and these views set **no `throttle_classes`**. There is also no per-link failed-attempt counter or lockout.
- **Evidence (code):** `PublicSharedFilePreviewView` / `PublicSharedFileDownloadView` / `PublicEmergencyPackMetadataView` / `PublicShareRoomMetadataView` declare only `permission_classes = [AllowAny]` (no throttle) and route through `_check_access_code` / `_check_pack_access_code` / `_check_room_code`, each of which reads `request.headers.get("X-Access-Code")` and compares with `check_password`. Contrast with the verify views which add `throttle_classes = [ScopedRateThrottle]`.
- **Attack scenario:** An attacker holding a valid (e.g. emailed/forwarded) share/emergency/room URL but not the code scripts requests to the **preview** endpoint, iterating `X-Access-Code` from `000000`–`999999`. The throttle on the verify endpoint is never touched. `check_password` (PBKDF2) adds latency, but with parallelism the 10⁶ space is exhausted in hours; a weak owner-chosen code falls in seconds.
- **Impact:** Unauthorized viewing/downloading of shared sensitive documents and **emergency packs** (which can include passports, IDs, insurance, and — once unlocked — last-known location).
- **Likelihood:** Medium (requires possession of the link, which is "something you should be able to forward safely"; the code is the only remaining control).
- **Recommended fix:**
  1. Apply the same `ScopedRateThrottle` scope to **every** endpoint that accepts `X-Access-Code` (metadata/preview/download/item), not just the verify endpoints.
  2. Add a per-link failed-attempt counter with exponential backoff / lockout, independent of IP throttling.
  3. Increase generated code entropy (e.g. 8+ alphanumeric, ambiguity-free) and enforce a minimum length/strength on owner-supplied codes.
  4. Prefer the existing short-lived signed *grant* as the only credential carried after one verified attempt (already implemented for share/room) and reject raw `X-Access-Code` on preview/download once grants are universal.
- **Suggested test:** `test_share_preview_access_code_is_rate_limited` — 11 wrong `X-Access-Code` preview attempts within a minute return HTTP 429; emergency + room equivalents.
- **Effort:** S–M (throttle decorators + a counter field + a migration).

---

### SEC-002: Organization document files & public submissions stored unencrypted

- **Severity:** High
- **Area:** Storage / encryption / multi-tenant data protection
- **Affected files:**
  - [backend/apps/organizations/models.py](../../backend/apps/organizations/models.py) — `OrganizationDocumentFile.file = FileField(...)` (L314), `DocumentRequestSubmission.file = FileField(...)` (L526), `org_document_file_upload_to` (L27), `org_request_upload_to` (L18)
  - [backend/apps/organizations/views.py](../../backend/apps/organizations/views.py) — file create action (L380-422), `PublicDocumentRequestView` (L930)
- **Description:** The personal vault encrypts every file at rest (`encrypt_uploaded_file` → AES-256-GCM, see [file_encryption.py](../../backend/apps/documents/file_encryption.py)) and streams plaintext only through authenticated, ownership-checked views. **Organization** documents and public document-request submissions instead use a **plain Django `FileField`**: the uploaded bytes are written to storage as-is (plaintext), with no envelope encryption, no AAD binding, and no `encryption_status` lifecycle. This contradicts CertaNest's stated/marketed "encrypted at rest" guarantee for exactly the data (org member passports, scholarship/visa packets, IDs) that is highly sensitive.
- **Evidence (code):** `OrganizationFileUploadSerializer.validate_file` checks size/extension/content-type then returns the raw `uploaded`; the view stores `file=uploaded` directly. No call to the `apps.core.security.encryption` pipeline anywhere in `apps/organizations`.
- **Attack scenario:** Any read access to the storage bucket/volume (mis-set bucket policy, leaked storage credentials, backup exposure, provider subpoena, insider) yields **cleartext** org documents. With local-filesystem storage in a misconfigured deployment, the path is even reachable directly.
- **Impact:** Confidentiality breach of organization members' sensitive documents; breaks the product's central privacy promise and likely data-protection commitments.
- **Likelihood:** Low–Medium (depends on storage exposure) but **high impact**.
- **Recommended fix:** Route org files and submissions through the same envelope-encryption pipeline as `DocumentFile` (reuse `encrypt_bytes_into_record` / `read_plaintext`), add authenticated streaming download views (org-membership-scoped), and back-fill/migrate any existing plaintext org objects. Until then, document the gap honestly and restrict org file features in the private beta.
- **Suggested test:** `test_org_file_is_encrypted_at_rest` — uploaded org file bytes on storage do not equal plaintext and decrypt only via the authenticated view.
- **Effort:** M–L (new encrypted model fields + migration + download views + back-fill).

---

### SEC-003: Unauthenticated public upload endpoint has no rate limit or malware scan

- **Severity:** Medium
- **Area:** File upload security / DoS / abuse
- **Affected files:** [backend/apps/organizations/views.py](../../backend/apps/organizations/views.py) — `PublicDocumentRequestView.post` (L943-978); [backend/apps/organizations/serializers.py](../../backend/apps/organizations/serializers.py) — `OrganizationFileUploadSerializer` (L246-269)
- **Description:** `POST /api/v1/public/document-requests/<token>/upload/` is `AllowAny`, accepts a file from anyone holding the (high-entropy) token, and stores it. It validates size/extension/content-type but has **no `throttle_classes`** and **does not run the ClamAV path** that the scanner endpoint uses. Files are stored unencrypted (see SEC-002).
- **Attack scenario:** A leaked/guessed-by-recipient request token lets an attacker script repeated multi-MB uploads (storage exhaustion / cost) and stage malware that org admins later download to their own machines.
- **Impact:** Storage/cost DoS; malware distribution to org staff; unencrypted storage of attacker-controlled content.
- **Likelihood:** Medium (token is required, but tokens are shared with external recipients and are long-lived while `public_upload_active`).
- **Recommended fix:** Add a scoped throttle (per-IP and/or per-token), wire the existing `scan_for_malware` into this path (fail-closed in prod), cap total submissions per request, and encrypt at rest.
- **Suggested test:** `test_public_upload_is_throttled_and_scanned`.
- **Effort:** S–M.

---

### SEC-004: Billing webhook defaults to unsigned "manual" provider

- **Severity:** High (configuration / billing integrity)
- **Area:** Billing / webhook security
- **Affected files:** [backend/config/settings/base.py](../../backend/config/settings/base.py) — `BILLING_PROVIDER = config("BILLING_PROVIDER", default="manual")` (L32); [backend/apps/billing/providers.py](../../backend/apps/billing/providers.py) — `ManualProvider.verify_and_parse_webhook` (L50-58); [backend/apps/billing/views.py](../../backend/apps/billing/views.py) — `StripeWebhookView` (L208-222, `csrf_exempt` + `AllowAny` + `authentication_classes = []`)
- **Description:** The webhook endpoint delegates verification to the active provider. The **Stripe** provider correctly calls `stripe.Webhook.construct_event(...)` with `STRIPE_WEBHOOK_SECRET` and the service layer is idempotent (`BillingEvent.provider_event_id` unique). But `BILLING_PROVIDER` **defaults to `"manual"`**, and `ManualProvider.verify_and_parse_webhook` accepts **any JSON body** that has an `id` and `type` — no signature. The webhook view is public, CSRF-exempt, and auth-less by design.
- **Attack scenario:** If a real deployment is left on the default (or fails over to) `manual`, anyone who finds `/api/v1/billing/webhook/` can POST a forged `checkout.session.completed` / subscription event with `metadata.user_id` set to their own account and obtain **Pro entitlements without paying**. (Manual mode's checkout also activates subscriptions directly with no payment, so manual mode = no paywall at all.)
- **Impact:** Billing bypass / privilege escalation to paid tiers; revenue loss; plan-gate bypass.
- **Likelihood:** Medium — entirely dependent on the deployed `BILLING_PROVIDER`. Default-insecure is the risk.
- **Recommended fix:** In `production.py`, **fail closed** if real billing is enabled but `BILLING_PROVIDER != "stripe"` (or refuse to process webhooks while in manual mode in production). Require `STRIPE_WEBHOOK_SECRET` at boot when `BILLING_PROVIDER=stripe`. Document that manual mode is dev/test only and must never be the production provider.
- **Suggested test:** `test_manual_webhook_rejected_in_production`; `test_stripe_webhook_requires_valid_signature`.
- **Effort:** S.

---

### SEC-005: Primary vault upload lacks server-side content validation and malware scan

- **Severity:** Medium
- **Area:** File upload security
- **Affected files:** [backend/apps/documents/serializers.py](../../backend/apps/documents/serializers.py) — `DocumentFileUploadSerializer.validate_file` (L1225-1248); [backend/apps/documents/views.py](../../backend/apps/documents/views.py) — `_create_document_file` (L788), `FileInboxListCreateView` (L863)
- **Description:** The main vault upload validates **size** (10 MB), **extension** allowlist, and **client-reported `content_type`** (acknowledged in a code comment as spoofable). Unlike the scanner endpoint, it performs **no magic-byte/structural check** and **no ClamAV scan**. The stored `content_type` is later echoed when previewing inline.
- **Mitigations already present:** Extension allowlist excludes `.html`/`.svg`; production sets `X-Content-Type-Options: nosniff` and a restrictive CSP; files are served from the API origin via authenticated/token views. These substantially reduce stored-XSS risk.
- **Attack scenario:** A user stores malformed/oversize-trick or malware-bearing PDFs/Office docs; later downloaded by share/emergency recipients with no AV in between. Content-type spoofing has limited XSS impact thanks to `nosniff` + allowlist, but is not defense-in-depth complete.
- **Impact:** Malware passthrough to share recipients; weaker content-integrity guarantees than the scanner path.
- **Likelihood:** Medium.
- **Recommended fix:** Reuse the scanner's `validate_pdf_structure` + magic-byte checks and `scan_for_malware` in `_create_document_file`, and derive `content_type` from sniffed bytes rather than the client header.
- **Suggested test:** `test_vault_upload_rejects_content_type_mismatch`; `test_vault_upload_scans_for_malware_when_enabled`.
- **Effort:** M.

---

### SEC-006: Vulnerable `jsPDF` dependency (and transitive `postcss`)

- **Severity:** Medium
- **Area:** Dependency / supply chain (frontend)
- **Affected files:** [frontend/package.json](../../frontend/package.json) — `jspdf ^3.0.4`
- **Description:** `npm audit` reports **8 vulnerabilities (1 critical, 5 high, 2 moderate)**. The critical/high cluster is in **`jsPDF`**: PDF object injection, AcroForm arbitrary-JS, HTML injection in new-window paths, and **client/server DoS via malicious GIF dimensions**. `jsPDF` is used client-side to build PDFs (scanner / SafeSend). A moderate `postcss` XSS-in-stringify advisory is a build-time transitive dependency (low runtime risk).
- **Attack scenario:** User-controlled images/content flowing into `jsPDF` could trigger the DoS or injection paths in the victim's browser.
- **Impact:** Client-side DoS / potential PDF-borne injection depending on how `jsPDF` features are used.
- **Recommended fix:** Upgrade `jsPDF` to a patched release (audit suggests `jspdf@4.2.1`; treat as a breaking change and re-test PDF generation). Keep `next`/`postcss` updated.
- **Suggested test:** Re-run `npm audit` in CI with a high-severity gate; regression test PDF export.
- **Effort:** S–M (breaking upgrade + verification).

---

### SEC-007: No password-reset / email-verification flow

- **Severity:** Low
- **Area:** Authentication / account recovery
- **Affected files:** [backend/apps/users/urls.py](../../backend/apps/users/urls.py) (no reset routes), [backend/apps/users/views.py](../../backend/apps/users/views.py)
- **Description:** There is no password-reset endpoint and no email verification for password-based signups. Google accounts are fine (Google verifies email; created with an unusable password). But a password user who forgets their password has no recovery, and signups can use an unverified (not-yours) email address.
- **Impact:** Account lockout (support burden); minor account-integrity gap. *Positive:* no reset flow also means no reset-token attack surface today.
- **Recommended fix:** Add a rate-limited, single-use, time-limited password-reset (and ideally email verification) before opening self-serve signups broadly.
- **Effort:** M.

---

### SEC-008: Unauthenticated client-error log endpoint has no throttle

- **Severity:** Low
- **Area:** Abuse / DoS / log integrity
- **Affected files:** [backend/apps/founder/views.py](../../backend/apps/founder/views.py) — `ClientErrorLogCreateView` (L194-209)
- **Description:** `AllowAny` with **no `throttle_classes`**, persisting attacker-controlled error rows (metadata is sanitized, which is good). The sibling `ClientEventCreateView` is `IsAuthenticated` + `client_events` throttle; this one is neither.
- **Impact:** Log/DB flooding; noise in founder analytics.
- **Recommended fix:** Add a scoped throttle and a payload-size cap.
- **Effort:** S.

---

### SEC-009: Founder console gated only by `is_staff`/`is_superuser`

- **Severity:** Low / Informational
- **Area:** Admin console / privileged access
- **Affected files:** [backend/apps/founder/permissions.py](../../backend/apps/founder/permissions.py) (L4-15); `FounderGrowthExportView` ([growth_api.py](../../backend/apps/founder/growth_api.py) L455)
- **Description:** `IsFounderUser` returns true for any `is_staff` or `is_superuser` user. The console exposes CRM/analytics and a **bulk export** endpoint. There is no second factor, no separate "founder" scope, and no audit of founder reads. Acceptable for a solo-founder app today, but any added staff account inherits full data-export power.
- **Recommended fix:** Keep staff accounts minimal; consider a dedicated `is_founder` flag, admin-action audit logging, and 2FA for staff before scaling the team. Confirm no document *contents* are reachable from founder endpoints (current code suggests only metadata/analytics — good).
- **Effort:** S–M.

---

### SEC-010 (Info): HSTS conservative; SEC-011 (Low): owner code in `sessionStorage`; SEC-012 (Low): legacy plaintext records

- **SEC-010:** `production.py` sets `SECURE_HSTS_SECONDS=3600` without `includeSubDomains`/`preload` (intentional, documented). Raise to a year + subdomains + preload once all subdomains are HTTPS.
- **SEC-011:** The Quick Share *creator* page stores the freshly generated access code in `sessionStorage` (`qs-code-*`) on the owner's own device ([quick-share/new/page.tsx](../../frontend/src/app/(dashboard)/dashboard/quick-share/new/page.tsx) L249-257). Low risk (owner device, cleared on tab close), but avoid persisting the secret; hold it in memory only.
- **SEC-012:** `read_plaintext` supports a `PLAINTEXT_LEGACY` status that returns raw bytes. Confirm the migration to encrypted records is complete before public launch so no vault file remains unencrypted.

---

## 9. Project-specific risk areas

### Sensitive documents (vault)
- Files **private by default** ✔ — served only through authenticated, owner-scoped views; raw storage URLs never used (S3 configured private, no ACL, signed-URL-only as defense in depth). ✔
- Users access **only their own** files ✔ (`_owned_file_queryset`, owner-scoped viewsets).
- Trashed/parent-trashed files blocked from share/emergency/room delivery ✔.
- Previews/downloads decrypt **after** authorization (permission-first rule honored) ✔.
- **Gap:** access-code brute force (SEC-001); main-upload content validation (SEC-005); legacy plaintext (SEC-012).

### Quick Share / SafeSend
- Token entropy 256-bit ✔; access codes hashed ✔; expiry/revoke/one-time enforced server-side ✔; view-only enforced server-side (not client) ✔; account-to-account requires accepted claim ✔; DN-code receive + verify throttled ✔; activity logged ✔; no file-exists leakage ✔.
- **Gap:** code brute force via non-verify endpoints (SEC-001); owner-side `sessionStorage` code (SEC-011).

### Emergency Access
- Selected-items-only ✔; items hidden until unlock (request/delay/owner-approval) ✔; **location off by default** and revealed only post-unlock with logging ✔; wrong-code notifies owner + throttled on request path ✔; request token is opaque ✔; no full-vault exposure ✔.
- **Gap:** code brute force via the metadata/item endpoints (SEC-001).

### Organizations
- Tenant isolation via active-membership queryset ✔; `require_membership` / `require_role` on actions ✔; owner-protection, last-owner protection, no admin→owner escalation ✔.
- **Gap:** **org files unencrypted** (SEC-002); **unauthenticated upload without throttle/AV** (SEC-003); public secure-room exposes file metadata but no implemented secured delivery route (functional gap, not a leak).

### Founder console
- Consistently `IsFounderUser`; public founder routes limited to waitlist/invite-validate/feedback/error-log; no document contents exposed.
- **Gap:** `is_staff` == full access incl. bulk export (SEC-009); error-log unthrottled (SEC-008).

### Billing / webhooks
- Stripe signature verification ✔; idempotency via unique event id ✔; secrets server-only ✔; price IDs server-resolved (frontend cannot pick price) ✔; promo validation throttled ✔; portal scoped to the user's own customer id ✔.
- **Gap:** default `manual` provider accepts unsigned events (SEC-004).

### PWA / offline / scanner
- Service worker caches **only** OpenCV.js — never API/documents/navigations ✔; offline queue flush is client-driven (no headless uploads) ✔; scanner validates size/MIME/PDF-structure, optional fail-closed ClamAV, encrypts via the shared pipeline, OCR best-effort & bounded ✔; per-user scanner throttle ✔; tokens not in `localStorage` ✔.
- No private-data caching issues found.

## 10. Dependency / security-tooling results

| Check | Result |
|---|---|
| `python manage.py check` (dev settings) | **Clean** — 0 issues. |
| `python manage.py check --deploy` (production settings, dummy keys) | Only `security.W005` (HSTS subdomains), `security.W021` (HSTS preload) — both intentional (SEC-010) — and `security.W009` (triggered only because the audit used a dummy SECRET_KEY). No CORS/cookie/SSL warnings. |
| `npm audit` (frontend) | **8 vulns: 1 critical, 5 high, 2 moderate** — primarily `jsPDF` (SEC-006); `postcss` transitive (build-time). |
| `pip-audit` | **Not run** — not installed; not installed during audit per scope. Manual review of `requirements.txt` showed current pins (Django 5.2.15, DRF 3.17.1, cryptography 48.0.1, Pillow 12.2.0, requests 2.34.2) with no obviously-vulnerable versions, but a real `pip-audit`/`safety` run is recommended in CI. |
| `bandit` | **Not run** — not installed. Manual pattern review found **no** `eval`/`exec`/`pickle`/`subprocess`/`os.system`/raw SQL in app code. |
| Manual secret scan | No secrets tracked in git (`git ls-files` shows only `*.env.example`). `db.sqlite3`, `.env`, `.env.local` present on disk but **untracked** ✔. |

## 11. Configuration review

- **DEBUG:** `False` by default in base; `True` only in `development.py`; `production.py` forces `False`. ✔
- **SECRET_KEY:** env-driven with an insecure dev default; **ensure a strong env value in prod** (the deploy check will warn otherwise). ✔/⚠
- **ALLOWED_HOSTS:** env-driven allowlist (no `*`). ✔
- **CORS:** `CORS_ALLOW_ALL_ORIGINS=False` in prod; explicit `CORS_ALLOWED_ORIGINS`; credentialed CORS (required for cookie auth). ✔
- **CSRF:** double-submit cookie; enforced on cookie-authenticated unsafe requests; `CSRF_TRUSTED_ORIGINS` explicit in prod. ✔
- **Cookies:** `HttpOnly` access/refresh; `Secure` + `SameSite=Lax` in prod; CSRF cookie JS-readable by design. ✔
- **JWT:** 15-min access / 7-day refresh; rotation + blacklist-after-rotation. ✔
- **Security headers:** CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), Permissions-Policy, COOP, nosniff, referrer policy, `X-Frame-Options: DENY`; public token routes always get `noindex`, `no-referrer`, `no-store`. ✔
- **Encryption:** KEKs env-only; `key_provider.validate_configuration()` **fails closed** at prod boot. ✔
- **Logging:** redaction filter scrubs tokens/codes/keys/headers. ✔
- **Billing provider:** **defaults to `manual`** — see SEC-004. ⚠

## 12. Public route review

All token routes resolve via opaque 256-bit tokens, never leak object existence beyond the link, enforce revoke/expiry/trash server-side, and get `no-store`/`noindex`/`no-referrer`. The weaknesses are: SEC-001 (code brute force on non-verify routes), SEC-003 (unauthenticated upload), SEC-008 (error-log flood). The public org secure-room returns file metadata with no secured delivery route (incomplete feature, not a leak).

## 13. File upload / storage review

- **Vault & scanner:** encrypted at rest (AES-256-GCM, wrapped DEK, AAD-bound), streamed via authenticated views, size-capped; scanner adds magic-byte + structure + optional AV. ✔
- **Storage:** private-by-default, no ACL, signed-URL-only, short expiry; object URLs never used for delivery. ✔
- **Org files / public submissions:** **plaintext `FileField`** (SEC-002) and **unauthenticated, unthrottled, unscanned** upload (SEC-003). ✗
- **Main vault upload:** trusts client `content_type`, no AV (SEC-005). ⚠

## 14. Authentication / session review

Cookie-first JWT with Bearer fallback; CSRF enforced only when the credential is the cookie and the method is unsafe (correct). Google ID tokens verified server-side with `email_verified` enforced and safe account linking by verified email. Login/register/google throttled. Logout blacklists refresh and clears cookies. **Gaps:** no password reset / email verification (SEC-007); consider 2FA for staff (SEC-009).

## 15. Authorization / object-level permission review

Personal vault is **IDOR-resistant**: every queryset is owner-scoped (`get_queryset` filters by `request.user`), so cross-user access returns 404. Categories correctly expose system (owner-null) + own. Organizations enforce membership + role on every action and scope nested objects to the org. Quick Share account-to-account requires an accepted claim. No broken object-level authorization was found in the authenticated API. The only authorization weakness is the **public** access-code control strength (SEC-001), not object scoping.

## 16. PWA / offline review

Service worker is deliberately minimal and safe (OpenCV.js only; never API/documents). Offline scan queue is client-flushed, not headless. No private data is cached. No findings beyond noting the localForage queue should be cleared on logout (verify) and the owner-side `sessionStorage` code (SEC-011).

## 17. Billing / webhook review

Stripe path is correct (signature + idempotency + server-resolved prices + scoped portal). The risk is the **default manual provider** accepting unsigned events (SEC-004). Promo validation is throttled and server-evaluated. Manual access grants are founder-only.

## 18. Founder / admin console review

Uniformly `IsFounderUser`-gated; no document contents exposed; public founder endpoints are limited and (mostly) throttled. Improve with a dedicated founder flag, read auditing, 2FA, and throttling the client-error log (SEC-008, SEC-009).

## 19. Prioritized remediation roadmap

### Immediate fixes before (continuing) beta
1. **SEC-001** — throttle every access-code-accepting endpoint + per-link lockout + stronger codes.
2. **SEC-004** — fail closed on non-stripe billing provider in production; never process unsigned webhooks in prod.
3. **SEC-003** — throttle + AV + size/total caps on the public upload.
4. **SEC-002** — at minimum, disclose to org pilot users; plan encryption (see below) before broad org use.

### Before public launch
5. **SEC-002** — encrypt org files & submissions at rest via the existing pipeline; add scoped download views; back-fill.
6. **SEC-006** — upgrade `jsPDF`; add a high-severity `npm audit` gate in CI.
7. **SEC-005** — magic-byte/content validation + AV on the primary vault upload.
8. **SEC-007** — password reset + email verification before self-serve signup.
9. **SEC-012** — confirm no `PLAINTEXT_LEGACY` files remain.

### After-launch hardening
10. **SEC-009** — founder flag, admin-read auditing, staff 2FA.
11. **SEC-008** — throttle client-error log.
12. **SEC-010/011** — full HSTS (subdomains+preload); keep secrets out of `sessionStorage`.
13. Add `pip-audit`/`bandit` + dependency review to CI; periodic external pentest; storage-bucket policy review; alerting on `security_event_recorded` spikes.

## 20. Quick wins (≤ ~1 day each)
- Add `throttle_classes`/`throttle_scope` to share/emergency/room metadata-preview-download views (SEC-001 partial).
- Fail closed on `BILLING_PROVIDER != "stripe"` in production (SEC-004).
- Add a throttle to `PublicDocumentRequestView` and `ClientErrorLogCreateView` (SEC-003, SEC-008).
- `npm i jspdf@latest` + smoke-test PDF export; add CI audit gate (SEC-006).
- Raise generated access-code entropy (SEC-001).

## 21. Must-fix before beta
- SEC-001, SEC-004, SEC-003 (mitigations), SEC-002 (disclosure + plan).

## 22. Must-fix before public launch
- SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-012.

## 23. Recommended tests to add
- Cross-user document access (403/404) — likely exists; confirm for files, shares, emergency items, org files.
- Public share/emergency/room **code brute-force is throttled and locks out** (SEC-001).
- Share expiry / revoke / one-time access returns the right state.
- Emergency selected-only + locked-until-unlock + location-only-after-unlock.
- Organization tenant isolation (member of A cannot read B's documents/files/rooms).
- Org file **encrypted at rest** and public upload **throttled + scanned** (SEC-002/003).
- Founder endpoints reject non-staff (and expose no document contents).
- Stripe webhook **requires valid signature**; manual webhook **rejected in production** (SEC-004).
- Vault upload rejects content-type/magic-byte mismatch and runs AV when enabled (SEC-005).
- CSRF required on cookie-authenticated writes; Bearer path exempt.
- Service worker never serves authenticated API/document responses from cache.
- Promo-code abuse: redemption limits + throttle enforced.

## 24. Final checklist

| Control | Status |
|---|---|
| Files private by default | ✅ (vault) / ❌ org plaintext (SEC-002) |
| Owner-only object access (IDOR) | ✅ vault & org-scoped |
| Public links can't leak files incorrectly | ⚠ code brute force (SEC-001) |
| Raw storage URLs not exposed | ✅ |
| Signed URLs short-lived | ✅ (300s) |
| Share tokens high-entropy | ✅ 256-bit |
| Access codes hashed | ✅ but low-entropy + brute-forceable (SEC-001) |
| Revoke / expiry / one-time enforced server-side | ✅ |
| Emergency selected-only + delayed/approval | ✅ |
| Emergency location off by default | ✅ |
| Multi-tenant isolation | ✅ |
| Role escalation prevented | ✅ |
| Founder console protected | ✅ (broaden gating SEC-009) |
| Webhook signature verified | ✅ Stripe / ❌ manual default (SEC-004) |
| Encryption at rest (vault) | ✅ AES-256-GCM |
| Encryption at rest (org files) | ❌ (SEC-002) |
| Secrets out of repo | ✅ |
| Debug off in prod | ✅ |
| Secure cookies / CSRF / CORS | ✅ |
| Security headers / CSP | ✅ |
| Logging redaction | ✅ |
| Dependency hygiene | ⚠ jsPDF (SEC-006); add CI audits |
| Password reset / email verification | ❌ (SEC-007) |
| Rate limiting on all public write/code routes | ⚠ gaps (SEC-001/003/008) |

---

## Appendix A — Commands / checks run
- `git checkout -b security/expert-cybersecurity-audit`
- `python manage.py check` (dev) → clean
- `python manage.py check --deploy` (production settings module, dummy keys) → only HSTS + dummy-key warnings
- `npm audit` (frontend) → 8 vulns (1 critical / 5 high / 2 moderate)
- `git ls-files | grep -iE '\.env|sqlite3|key|secret'` → only `*.env.example` tracked
- Manual pattern scans: `csrf_exempt`, `AllowAny`, `CORS_ALLOW_ALL_ORIGINS`, `eval/exec/pickle/subprocess/os.system`, raw SQL, `localStorage`, `dangerouslySetInnerHTML`, `caches.open`, `FileResponse`, token/webhook/preview/download.

## Appendix B — Tools NOT run (and why)
- `pip-audit`, `safety`, `bandit` — not installed in the environment; audit scope said not to install heavy tooling. Recommended to add to CI. Manual `requirements.txt` review found no obviously-vulnerable pins.
- Backend test suite — not executed end-to-end (large; out of audit scope for runtime). Existing tests are extensive (`apps/documents/test_*.py`, etc.).
- No external/production scanning was performed (out of scope by instruction).

## Appendix C — Assumptions
- Production runs `config.settings.production` behind TLS termination that sets `X-Forwarded-Proto`.
- Object storage is configured private (the code defaults to it; verify the bucket policy in the real provider).
- "Encrypted at rest" is a product promise (per `docs/ENCRYPTION.md`), which is why SEC-002 is rated High.
- The deployed `BILLING_PROVIDER` value was not observable from code alone; SEC-004 is rated on the default-insecure risk.

## Appendix D — Proposed fix branches (implement only when approved)
- `security/public-share-token-hardening` (SEC-001)
- `security/org-file-encryption` (SEC-002)
- `security/public-upload-hardening` (SEC-003)
- `security/billing-webhook-hardening` (SEC-004)
- `security/vault-upload-validation` (SEC-005)
- `security/frontend-dependency-upgrades` (SEC-006)
- `security/account-recovery-flow` (SEC-007)
- `security/founder-console-hardening` (SEC-008, SEC-009)
