# CertaNest — Production Domains, Email & DNS Setup

> Production-readiness reference for connecting CertaNest to its real domains and
> email sending. The code is already **environment-driven** — nothing here
> hardcodes production URLs, and local development is unaffected.
>
> Related: [`DEPLOYMENT.md`](DEPLOYMENT.md) (hosting/storage), [`AUTH.md`](AUTH.md)
> (cookies/CSRF/CORS), [`BRANDING.md`](BRANDING.md) (brand + senders),
> [`EMAIL_REMINDERS.md`](EMAIL_REMINDERS.md) (transactional email).

## 1. Domain map

| Domain | Role | Points at |
| --- | --- | --- |
| `certanest.com` | Public marketing / landing | Frontend deployment (Vercel or equivalent) |
| `www.certanest.com` | Redirect / alias → `certanest.com` | 308 redirect at the host/CDN |
| `app.certanest.com` | Logged-in product (frontend app) | Frontend deployment |
| `api.certanest.com` | Backend API (Django) | Backend deployment (Railway/Render/Fly/etc.) |
| `mail.certanest.com` | Email sending domain (Resend) | Resend-provided DNS records |

**Same-origin note:** the frontend proxies `/api/v1/*` to the backend
(`next.config.ts` → `BACKEND_ORIGIN`), which keeps the HttpOnly auth cookies
first-party. Two supported topologies:

- **Same-site (recommended):** serve the app from `app.certanest.com` and proxy
  `/api/v1` to the backend. Cookies stay `SameSite=Lax`; simplest and safest.
- **Split-origin:** browser calls `api.certanest.com` directly. Then you MUST set
  `DJANGO_COOKIE_SAMESITE=None`, `AUTH_COOKIE_SECURE=True`, and an explicit CORS
  allowlist (below). Only use if your host can't proxy.

The marketing site and the app can be the **same** Next.js deployment with two
domains (`certanest.com` + `app.certanest.com`) or split — both work; the routes
are already domain-agnostic.

## 2. DNS setup checklist

Exact record **values come from your hosting/Resend dashboards** — do not invent
them. General shape:

| Host | Type | Name | Value (from dashboard) |
| --- | --- | --- | --- |
| `certanest.com` | A / ALIAS / CNAME | `@` | Frontend host target (e.g. Vercel) |
| `www` | CNAME / 308 | `www` | Redirect to `certanest.com` |
| `app` | CNAME | `app` | Frontend host target |
| `api` | CNAME / A | `api` | Backend host target (Railway/Render/Fly) |
| `mail` | TXT/CNAME (×N) | per Resend | SPF + DKIM + DMARC (section 6) |

- Add each custom domain in the **provider dashboard first** (Vercel → app +
  marketing; Railway/Render → api), then create the DNS record it tells you to.
- TLS is automatic on Vercel/Railway/Render/Fly/Cloudflare once the domain
  verifies. Confirm HTTPS before flipping any `SECURE_*`/HSTS env flags on.

## 3. Frontend environment variables

The frontend reads these (all have safe dev defaults — see
`frontend/.env.local.example`). Set the production ones at **build time** in the
host dashboard.

```env
# Canonical public site URL — used for metadata/canonical/OG/robots/sitemap.
# Defaults to https://certanest.com in code; set explicitly per environment.
NEXT_PUBLIC_SITE_URL=https://certanest.com

# Same-origin API path (KEEP relative). The app proxies /api/v1/* to the backend
# so auth cookies stay first-party. Do NOT point this at api.certanest.com unless
# you intentionally run a split-origin setup (then also configure backend CORS).
NEXT_PUBLIC_API_BASE_URL=/api/v1

# Where the Next server forwards /api/v1/* (server-side only).
BACKEND_ORIGIN=https://api.certanest.com

# Private beta. "true" → CTAs route to /waitlist. Set "false" at launch to route
# Start organizing → /register.
NEXT_PUBLIC_PRIVATE_BETA_ENABLED=true

# AI marketing (landing AI section + FAQ). Independent of the beta flag; only set
# "true" once AI features are live for users.
NEXT_PUBLIC_AI_ENABLED=false
```

> The app intentionally does **not** use separate `NEXT_PUBLIC_APP_URL` /
> `NEXT_PUBLIC_API_URL` vars — the same-origin proxy (`NEXT_PUBLIC_API_BASE_URL`
> + `BACKEND_ORIGIN`) covers it. Don't add duplicates.

## 4. Backend environment variables

All env-driven (`python-decouple`). See `backend/.env.example` for the full list
and `docs/DEPLOYMENT.md` §3. Production-relevant domain/email keys:

```env
DJANGO_SETTINGS_MODULE=config.settings.production

# Host allowlist — include the API host; localhost stays for local dev only.
DJANGO_ALLOWED_HOSTS=api.certanest.com

# Canonical app URL — used for links in invite/reset/verification emails AND
# auto-added to the CORS/CSRF allowlists.
FRONTEND_APP_URL=https://app.certanest.com

# CORS — frontend origins allowed to call the API with credentials (exact
# origins, no trailing slash). Add localhost ONLY if a local frontend hits prod.
DJANGO_CORS_ALLOWED_ORIGINS=https://certanest.com,https://www.certanest.com,https://app.certanest.com

# CSRF — trusted origins for unsafe requests (include the API origin too).
DJANGO_CSRF_TRUSTED_ORIGINS=https://certanest.com,https://www.certanest.com,https://app.certanest.com,https://api.certanest.com

# CSP connect-src — the API origin the browser is allowed to call.
DJANGO_CSP_CONNECT_SRC=https://api.certanest.com

# Cookies. Same-site deployment (app proxies API): leave SameSite=Lax.
# Split-origin (browser → api.certanest.com directly): set both of these.
# DJANGO_COOKIE_SAMESITE=None
# AUTH_COOKIE_SECURE=True
# Share auth cookies across subdomains (app + api) if needed:
# AUTH_COOKIE_DOMAIN=.certanest.com
```

> `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` are read from several key names
> and also derived from `FRONTEND_URL`/`FRONTEND_APP_URL`, with trailing slashes
> stripped — so minor naming differences are tolerated. `DUENEST_APP_BASE_URL`
> remains as a legacy alias for `FRONTEND_APP_URL` (don't rely on it for new
> setups; see `BRANDING.md` for why internal `duenest` identifiers persist).

## 5. CORS / CSRF / hosts checklist

- [ ] `DJANGO_ALLOWED_HOSTS` includes `api.certanest.com` (and any health-check host).
- [ ] `DJANGO_CORS_ALLOWED_ORIGINS` lists every frontend origin, **no trailing slash**.
- [ ] `DJANGO_CSRF_TRUSTED_ORIGINS` lists frontend origins **+ the API origin**.
- [ ] No `*` / allow-all in production (enforced: `CORS_ALLOW_ALL_ORIGINS=False`).
- [ ] localhost origins are **not** added to production unless a local client needs prod.
- [ ] If split-origin: `DJANGO_COOKIE_SAMESITE=None` + `AUTH_COOKIE_SECURE=True`.
- [ ] `DJANGO_SECURE_SSL_REDIRECT=True` only after HTTPS verifies on all domains.

## 6. Email — Resend sending domain (`mail.certanest.com`)

CertaNest is **provider-neutral** (`EMAIL_PROVIDER`); Resend is the planned
provider. Email is **not required** to be configured — without it the backend
uses the console backend and degrades gracefully (in-app notifications still work).

### Sender identities

| From name + address | Use | Env var |
| --- | --- | --- |
| `CertaNest <notifications@mail.certanest.com>` | Transactional / notifications | `DEFAULT_FROM_EMAIL` |
| `CertaNest Billing <billing@mail.certanest.com>` | Branded billing notifications (trial/payment/cancel) | `BILLING_FROM_EMAIL` *(falls back to `DEFAULT_FROM_EMAIL`)* |
| `CertaNest Security <security@mail.certanest.com>` | Security / sensitive | `SECURITY_FROM_EMAIL` *(if/when wired; today security mail uses `DEFAULT_FROM_EMAIL`)* |
| `support@certanest.com` | Reply-to / support | `SUPPORT_EMAIL` |

### Backend env (production, Resend)

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=<from Resend dashboard — secret, never commit>
RESEND_SENDING_DOMAIN=mail.certanest.com
DEFAULT_FROM_EMAIL=CertaNest <notifications@mail.certanest.com>
SERVER_EMAIL=CertaNest <notifications@mail.certanest.com>
SUPPORT_EMAIL=support@certanest.com
# Optional dedicated sender for branded billing notifications (else DEFAULT_FROM_EMAIL):
BILLING_FROM_EMAIL=CertaNest Billing <billing@mail.certanest.com>
# Optional, once the security sender is wired:
# SECURITY_FROM_EMAIL=CertaNest Security <security@mail.certanest.com>
# Verify inbound delivery/bounce webhooks:
# RESEND_WEBHOOK_SECRET=<from Resend dashboard>
```

### DNS records for deliverability

Add `mail.certanest.com` as a domain in **Resend**, then copy the records it
generates into DNS. **Do not invent these values** — they are unique per domain.

| Purpose | Type | Notes |
| --- | --- | --- |
| **SPF** | TXT | Authorizes Resend to send for the domain (Resend provides the exact `v=spf1 …` value). |
| **DKIM** | TXT or CNAME (often ×3) | Resend's signing keys — copy the exact host/value pairs. |
| **DMARC** | TXT at `_dmarc.certanest.com` | Start conservative (below). |
| **Return-Path / bounce** | CNAME | If Resend provides one for bounce handling. |

**Recommended DMARC starter** (monitor first, then tighten):

```txt
_dmarc.certanest.com  TXT  "v=DMARC1; p=none; rua=mailto:security@mail.certanest.com; fo=1"
```

Once SPF+DKIM pass for a few weeks of real sending, raise the policy:
`p=none` → `p=quarantine` → `p=reject`.

### Email content/safety rules (already enforced in templates)

- Warm Ivory background, white card, CertaNest logo at top, one clear CTA.
- **No sensitive document contents, no raw public document links, no private file
  URLs** in email.
- Trust line where appropriate: *"Private until you share it."*
- See `backend/templates/emails/base.html` and `docs/EMAIL_REMINDERS.md`.

## 7. Post-deployment smoke test

**Marketing**
- [ ] `https://certanest.com` loads; metadata title + favicon correct.
- [ ] `https://www.certanest.com` redirects to `certanest.com`.
- [ ] OG preview renders CertaNest (share the URL in a link-unfurling tool).
- [ ] "Start organizing" → `/waitlist` (beta) or `/register` (launch); "See how it works" works.

**App**
- [ ] `https://app.certanest.com` loads.
- [ ] Login works; register/waitlist works.
- [ ] Dashboard, Scanner, Vault, Onboarding routes load.
- [ ] No mixed-content warnings (all assets HTTPS).

**API**
- [ ] `https://api.certanest.com` reachable (health/`/api/v1/`).
- [ ] Frontend can call the API; CORS passes from `app.certanest.com`.
- [ ] CSRF + cookie/JWT auth works (login → authenticated request succeeds).
- [ ] File upload/download works (object storage reachable).

**Email**
- [ ] Resend domain `mail.certanest.com` verified (SPF/DKIM/DMARC present).
- [ ] Test notification email sends; **From** shows `CertaNest <notifications@mail.certanest.com>`.
- [ ] No sensitive document contents in the email body.

**Security**
- [ ] HTTPS active on all four domains; HSTS only after that's confirmed.
- [ ] Cookies `Secure` in production; allowed hosts restricted to the API host.
- [ ] No secrets in the repo or client bundle; no raw private file URLs exposed.

## 8. Rollback

- **DNS:** lower TTL (e.g. 300s) before cutover so you can revert records fast.
  Keep the previous host target noted; reverting DNS reverts the domain.
- **Frontend:** redeploy the previous build, or repoint the domain to the prior
  deployment in the host dashboard (instant).
- **Backend:** redeploy the previous image/release; migrations in this change set
  are **none** (no DB risk).
- **Email:** set `EMAIL_PROVIDER=console` to instantly stop external sends while
  keeping in-app notifications working; DNS email records are additive and safe
  to leave.
- **Beta flag:** `NEXT_PUBLIC_PRIVATE_BETA_ENABLED` flips CTA routing at build
  time — rebuild to revert launch ↔ beta.

## 9. Contact inboxes — status

These addresses are referenced in the product/docs but must be **provisioned at
the mail provider before launch** (they don't exist until configured):

- [ ] `notifications@mail.certanest.com` (Resend sender) — **required for email**
- [ ] `security@mail.certanest.com` (security sender) — recommended
- [ ] `support@certanest.com` (shown on the Contact page) — **TODO: create inbox/forward**
- [ ] `security@certanest.com` (shown on the Contact page) — **TODO: create inbox/forward**
- [ ] `privacy@certanest.com`, `hello@certanest.com` — optional, create if referenced

Until provisioned, treat the Contact-page addresses as intended-but-unverified.
