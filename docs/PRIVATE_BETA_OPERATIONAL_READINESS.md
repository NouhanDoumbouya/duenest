# Private Beta Operational Readiness

Practical checklists for taking CertaNest from "runs locally" to "runs reliably in
staging/production for a private beta". This focuses on **operational** wiring —
email delivery, the reminder scheduler, Redis, Sentry, and an end-to-end manual
test loop. It does not add product features.

Deeper background lives in:

- Email internals: [EMAIL_REMINDERS.md](./EMAIL_REMINDERS.md), [NOTIFICATIONS.md](./NOTIFICATIONS.md)
- Lean vs scale-ready modes: [deployment/scale-ready-lean-foundation.md](./deployment/scale-ready-lean-foundation.md)
- Railway backend deploy: [deployment/railway-backend-staging.md](./deployment/railway-backend-staging.md)
- General deploy: [DEPLOYMENT.md](./DEPLOYMENT.md)

> **Never commit secrets.** Every value below is set in the platform's
> environment/variables UI (Railway, Vercel, etc.), never in a tracked file. The
> tracked `backend/.env.example` lists the variable *names* with empty values
> only.

---

## 1. Email readiness (so emails actually send)

### Why this matters
By default `EMAIL_PROVIDER=console`, which only **prints** emails to the server
log. Email verification, password reset, and reminders will all look like they
"work" while nobody receives anything. A real provider must be configured before
beta. The system is honest about this: if a provider is selected but not fully
configured, `EMAIL_CONFIGURED` is `False` and delivery is recorded as
`not_configured`/`skipped` rather than pretending to send (see
[email_config.py](../backend/apps/notifications/email_config.py)).

### Required environment variables
CertaNest is provider-neutral over SMTP (no extra Python deps). Pick one provider.

**Common (always set):**

| Variable | Example | Notes |
|---|---|---|
| `EMAIL_PROVIDER` | `resend` | `console` (dev), `smtp`, or `resend`/`postmark`/`sendgrid`/`mailgun`/`ses` |
| `DEFAULT_FROM_EMAIL` | `CertaNest <noreply@yourdomain.com>` | Must be a verified sender/domain at the provider |
| `SERVER_EMAIL` | `CertaNest <server@yourdomain.com>` | Used for error mail |
| `SUPPORT_EMAIL` | `support@yourdomain.com` | Shown in UI/trust pages |
| `FRONTEND_APP_URL` | `https://app.yourdomain.com` | Builds the links inside emails (verify/reset). **Must be correct or links break.** |

**Provider key (set the one matching `EMAIL_PROVIDER`):**

| Provider | Variable(s) |
|---|---|
| Resend (recommended) | `RESEND_API_KEY` |
| Postmark | `POSTMARK_SERVER_TOKEN` |
| SendGrid | `SENDGRID_API_KEY` |
| Mailgun | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` |
| Amazon SES | `AWS_SES_REGION` + SMTP creds in `SMTP_USERNAME`/`SMTP_PASSWORD` |
| Generic SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS` |

### Recommended provider setup (Resend example)
1. Create a Resend account and **verify your sending domain** (add the DNS records).
2. Create an API key.
3. In the backend host (Railway) set: `EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY=...`, `DEFAULT_FROM_EMAIL=CertaNest <noreply@yourdomain.com>`,
   `FRONTEND_APP_URL=https://app.yourdomain.com`.
4. Redeploy/restart so settings reload.

### How to confirm it is NOT just console output
- In the server logs at boot/use, console mode prints the full email body. Real
  SMTP delivery does **not** dump bodies — it makes a network call.
- Quick check from a backend shell:
  ```bash
  python manage.py shell -c "from django.conf import settings; print(settings.EMAIL_BACKEND, settings.EMAIL_CONFIGURED)"
  ```
  Expect `...smtp.EmailBackend True` (not `console.EmailBackend`).
- Send a one-off test:
  ```bash
  python manage.py shell -c "from django.core.mail import send_mail; from django.conf import settings; send_mail('CertaNest test','It works.',settings.DEFAULT_FROM_EMAIL,['you@example.com'])"
  ```
  A real provider delivers to the inbox; console mode just prints it.

### How to test each email flow
- **Email verification:** register a new account → check inbox for the verify
  link → open it → `/users/me/` should show the account verified. Resend via the
  in-app "resend verification" action if needed.
- **Password reset:** use "Forgot password" with a real account email → check
  inbox → open the reset link → set a new password → log in with it. (The API
  always returns a generic success message even for unknown emails — that is
  intentional anti-enumeration behaviour, so rely on the inbox, not the response.)
- **Reminder delivery:** see §2 (depends on the scheduler) — create a document
  with a near reminder, then run the processor and confirm the email arrives.

---

## 2. Scheduler readiness (so reminders fire automatically)

### The core fact
Reminders are produced by the **`process_due_notifications`** job
([command](../backend/apps/notifications/management/commands/process_due_notifications.py),
service in `apps/notifications/services.py`). It must run **on a schedule** in
production. There are two supported ways to schedule it; pick **one**.

The same applies to three other periodic jobs already defined in
[config/celery.py](../backend/config/celery.py):

| Job | Management command equivalent | Suggested cadence |
|---|---|---|
| Due reminders/notifications | `process_due_notifications` | every 15 min |
| Purge expired trash | `purge_expired_trash` | daily (e.g. 03:10 UTC) |
| Billing access/grace sync | `sync_billing_access` | hourly |
| Founder analytics rollup | (Celery task `rollup_daily_analytics`) | every 10 min (optional) |

### Option A — Platform cron (recommended for a small private beta)
Simplest and cheapest: no Redis, no worker, no beat. Keep the app in **lean
mode** (`ENABLE_BACKGROUND_JOBS=False`) so any inline task still runs in-process,
and let the platform's scheduler invoke the management commands.

Railway "Cron" service (or any cron) runs, on schedule:
```bash
python manage.py process_due_notifications        # every 15 min
python manage.py purge_expired_trash              # daily
python manage.py sync_billing_access              # hourly
```
Required env: just the normal app env (DB, KEK, email). No Redis needed.

> Caveat: run the cron against the **same** database and settings as the web
> app. On Railway, run it as a scheduled command in the same project/service env.

### Option B — Celery Beat + worker (for scale)
Use when you outgrow cron or want named queues. Requires Redis (see §3).

Required env:
```
ENABLE_BACKGROUND_JOBS=true
ENABLE_CELERY_BEAT=true
REDIS_URL=redis://...        # broker + result backend
```
Required processes (see [Procfile](../backend/Procfile)):
```
worker: celery -A config worker -l info -Q critical,email,notifications,push,scanner,files,billing,analytics,default --concurrency 2
beat:   celery -A config beat -l info     # run EXACTLY ONE beat process
```
The beat schedule (every 15 min for reminders, etc.) is already defined in
[config/celery.py](../backend/config/celery.py).

### How to test that scheduled reminders actually fire
1. Create a document with an expiry/reminder due now (or soon).
2. Manually run the processor (works in either option):
   ```bash
   python manage.py process_due_notifications --manual
   ```
   Read the summary line: `emails_sent=`, `emails_skipped=`, `emails_failed=`,
   `email_configured=`. If `email_configured=False`, fix §1 first.
3. Use `--dry-run` to evaluate without sending, and `--now "2026-06-18T09:00"`
   to simulate a future processing time during a smoke test.
4. Delivery history is recorded as `NotificationDeliveryRun` rows (trigger
   `manual` vs `scheduled`) — confirm a `scheduled` run appears after the cron/
   beat cadence elapses in staging.
5. Note the kill switch: if the `email_reminders` feature flag is **disabled**,
   the command forces no-send mode and logs a warning — enable it for beta.

---

## 3. Redis & Sentry readiness

### Redis

**When Redis is MANDATORY:** as soon as you run **more than one** backend
instance/replica (horizontal scale), OR you choose scheduler Option B (Celery).

**Why LocMem is not enough for multi-instance:** in lean mode the cache is
`LocMemCache` — per-process memory that is **not shared** between replicas
([base.py](../backend/config/settings/base.py)). Two things break across
replicas without a shared cache:
- The public access-code **brute-force lockout** (SEC-001) is cache-backed; with
  per-process state an attacker can spread guesses across replicas and bypass the
  lockout.
- Throttle/rate-limit counters and cached entitlements/dashboard summaries become
  inconsistent per replica.

A single instance for a tiny private beta can run on LocMem, but **enable Redis
before adding a second instance.**

Required env:
| Variable | Value | Notes |
|---|---|---|
| `REDIS_URL` | `redis://host:6379/0` | Used for cache and (option B) Celery broker/result |
| `ENABLE_REDIS_CACHE` | `true` | Defaults to true when a cache URL is present |
| `CACHE_URL` | (optional) | Falls back to `REDIS_URL` |

Verify: hit `GET /api/v1/health/` (or the readiness check) — it reports DB +
cache health and returns 503 if the cache backend is unreachable.

### Sentry

Sentry is **optional and off by default** — it initialises only when a DSN is set
AND `sentry-sdk` is installed (it is in [requirements.txt](../backend/requirements.txt)).
PII is never sent (`send_default_pii=False`, see
[config/observability.py](../backend/config/observability.py)).

Required env:
| Variable | Example | Notes |
|---|---|---|
| `SENTRY_DSN` | `https://...ingest.sentry.io/...` | Enables error reporting |
| `APP_ENV` | `staging` / `production` | Tags the environment |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0`–`1.0` | Start at `0.0`; raise for perf tracing |

How to safely verify Sentry receives an error in staging:
1. Set `SENTRY_DSN` + `APP_ENV=staging` and redeploy.
2. Trigger a harmless, deliberate error from a backend shell:
   ```bash
   python manage.py shell -c "import sentry_sdk; sentry_sdk.capture_message('CertaNest staging sentry test')"
   ```
   (or `division_by_zero = 1/0` inside the shell to test exception capture).
3. Confirm the event appears in the Sentry project for the `staging` environment.
4. Do **not** trigger test errors against production traffic; use the shell or a
   dedicated staging deploy.

---

## 4. End-to-end private beta verification checklist

Run this manually against staging (a real deploy with email + scheduler wired)
before inviting beta users. Tick each item; stop and fix on any failure.

### Accounts & auth
- [ ] Create a new account (register)
- [ ] Receive the verification email (real inbox, not console) and verify it
- [ ] Log in; confirm redirect to `/dashboard`
- [ ] Log out; confirm `/dashboard` redirects to `/login` (server gate in cookie
      mode, or client gate in split-domain mode)

### Documents
- [ ] Upload a document file (PDF/image)
- [ ] Preview the document inline
- [ ] Download the document
- [ ] Add/edit an expiry date and metadata; confirm it saves

### Reminders & email delivery
- [ ] Create a reminder/reminder rule on the document
- [ ] Run `process_due_notifications --manual` (or wait for the schedule)
- [ ] Confirm the reminder **email is delivered to a real inbox**
- [ ] Confirm a `scheduled` delivery run appears after the cron/beat cadence

### Subscriptions & dashboard
- [ ] Add a subscription with a renewal date
- [ ] Confirm a Life Radar card appears for the upcoming renewal/expiry

### Bundles
- [ ] Create a bundle (e.g. visa/scholarship)
- [ ] Add a requirement and link a document/file; check readiness updates

### SafeSend / secure sharing
- [ ] Create a SafeSend link for a file (set an access code + expiry)
- [ ] Open the link in a private/incognito window as the recipient
- [ ] Confirm the access code is required and a wrong code is rejected
- [ ] Confirm a correct code grants the chosen permission (view/download)
- [ ] Revoke the link; confirm the revoked link now fails
- [ ] Check the access log shows the views/downloads

### Emergency access
- [ ] Create an emergency pack with at least one item
- [ ] Add a trusted contact
- [ ] Run the unlock flow as the trusted contact (request → access) end-to-end
- [ ] Confirm activity events are recorded

### PWA & mobile
- [ ] Install the app as a PWA (desktop + mobile)
- [ ] Go offline and confirm the calm `/offline` fallback appears (no sensitive
      data cached)
- [ ] On a real phone, test the document scanner (camera → PDF upload)
- [ ] Sanity-check responsive layout + mobile navigation on key screens

### Trust pages
- [ ] `/privacy`, `/terms`, `/security`, `/contact` all load with correct content
- [ ] Data controls (`/data-deletion`, account deletion request) work

### Monitoring
- [ ] Confirm a deliberate staging error reaches Sentry (see §3)
- [ ] Confirm `GET /api/v1/health/` returns 200 (DB + cache healthy)
