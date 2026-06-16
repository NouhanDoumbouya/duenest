# Railway Backend Staging Deployment

How to deploy the DueNest **backend** (Django/DRF) to Railway for **private
staging**, connected to Railway PostgreSQL, ready for the Vercel frontend to
call. The frontend stays on Vercel; only the backend deploys here.

> **This is private staging, not public production launch.** Even if the Railway
> environment is named `production`, treat it as staging until real launch.
> Manual billing is temporarily allowed here (with an explicit flag) and **must
> be removed before real production** (see step 13).

---

## 0. Builder: Docker

DueNest deploys via the **Dockerfile** at `backend/Dockerfile` (Python 3.12-slim;
it installs `tesseract-ocr` + `poppler-utils` for OCR and `libpq5` for Postgres —
Nixpacks would not install these). `backend/railway.json` pins the Docker builder,
the start command, and the health check path. **Do not** switch to Nixpacks.

## 1. Create the Railway project

1. Railway → **New Project** → **Deploy from GitHub repo** → select `duenest`.
2. Railway creates a service from the repo.

## 2. Set the service Root Directory to `backend`

This is the most important setting — DueNest is a monorepo and only the backend
deploys here.

1. Service → **Settings** → **Source / Root Directory** → set to `backend`.
2. Railway then uses `backend/Dockerfile` and `backend/railway.json`.

Do **not** deploy the whole monorepo.

## 3. Add a PostgreSQL service

1. Project → **New** → **Database** → **Add PostgreSQL**.
2. Railway provisions Postgres and exposes a reference variable.

## 4. Wire `DATABASE_URL`

In the **backend** service → **Variables**, add:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

If your DB service is named differently (e.g. `PostgreSQL`), use
`${{PostgreSQL.DATABASE_URL}}`. Django reads `DATABASE_URL` via `dj-database-url`
(see `backend/config/settings/base.py`). Internal Railway DB connections do not
require SSL; if you ever connect over the public proxy, append `?sslmode=require`
to the URL.

## 5. Add the required environment variables

Set these in the **backend** service → **Variables**. These are the **actual
names the code reads** (note the `DJANGO_` prefixes — the code does NOT read
plain `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, or `CSRF_TRUSTED_ORIGINS`).

```env
# --- Core ---
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=<50+ char random>     # python -c "import secrets;print(secrets.token_urlsafe(64))"
DJANGO_DEBUG=False
DJANGO_SECURE_SSL_REDIRECT=True          # Railway terminates TLS at the edge
APP_ENV=staging

# --- Hosts / CORS / CSRF (use your real domains) ---
DJANGO_ALLOWED_HOSTS=<service>.up.railway.app
DJANGO_CORS_ALLOWED_ORIGINS=https://<your-app>.vercel.app
DJANGO_CSRF_TRUSTED_ORIGINS=https://<your-app>.vercel.app

# --- Database ---
DATABASE_URL=${{Postgres.DATABASE_URL}}

# --- Encryption KEK (REQUIRED — production boot FAILS without it) ---
DUENEST_ACTIVE_KEK_VERSION=v1
DUENEST_KEK_V1_B64=<base64 of 32 random bytes>   # python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"

# --- TEMPORARY staging billing only (remove before real production) ---
BILLING_PROVIDER=manual
BILLING_ALLOW_MANUAL_PROVIDER=true
```

> **`DUENEST_KEK_V1_B64` is critical.** Production settings fail closed without a
> valid encryption key. Generate it ONCE, store it as a Railway secret, and never
> change/lose it while any encrypted data references that version, or those files
> become unreadable.

Optional / later (leave unset for lean staging — the app runs without them):

```env
# Stripe (real billing) — replaces the manual override above
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (Resend over SMTP, etc.)
EMAIL_PROVIDER=
RESEND_API_KEY=
DEFAULT_FROM_EMAIL=

# Object storage (Cloudflare R2 / S3) — vault files. Local FS by default.
STORAGE_BACKEND=
STORAGE_BUCKET_NAME=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_ENDPOINT_URL=

# Redis / background jobs (only when you turn workers on)
REDIS_URL=
ENABLE_BACKGROUND_JOBS=False

# Founder access (keep the allow-all flag OFF in staging/prod)
FOUNDER_EMAILS=
FOUNDER_ALLOW_ALL_STAFF=false
```

See `backend/.env.example` for the full annotated list.

## 6. Deploy

Railway deploys automatically on push to the connected branch. The build runs
`collectstatic` (now build-safe — see "Root cause" below); the container starts
with `migrate` then Gunicorn (`backend/railway.json` → start command).

## 7. Run migrations

Migrations run automatically at container start (`python manage.py migrate
--noinput` in the start command). To run manually, open the service →
**Settings → Deploy → run a command**, or use the Railway CLI:

```bash
railway run python manage.py migrate
```

## 8. Create a superuser (Railway shell / CLI)

```bash
railway run python manage.py createsuperuser
```

(Or temporarily add a one-off command in the Railway UI.)

## 9. Generate a public domain

Service → **Settings → Networking → Generate Domain**. Copy the
`*.up.railway.app` domain and ensure it is in `DJANGO_ALLOWED_HOSTS`.

## 10. Test the health endpoint

```bash
curl https://<service>.up.railway.app/api/v1/health/
# {"status":"ok","service":"duenest-backend","version":"v0.1"}
```

Deeper readiness (DB + cache round-trip, 503 when degraded):

```bash
curl -i https://<service>.up.railway.app/api/v1/readiness/
```

Both endpoints are unauthenticated (`AllowAny`). Railway's health check is wired
to `/api/v1/health/` via `railway.json`.

## 11. Connect the Vercel frontend

In Vercel → Project → Settings → Environment Variables (only `NEXT_PUBLIC_*`
reaches the browser — never put backend secrets here):

```env
NEXT_PUBLIC_API_BASE_URL=https://<service>.up.railway.app/api/v1
NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app
NEXT_PUBLIC_ENV=staging
```

Then redeploy the frontend. Make sure the backend's `DJANGO_CORS_ALLOWED_ORIGINS`
and `DJANGO_CSRF_TRUSTED_ORIGINS` include the exact Vercel origin (scheme + host,
no trailing slash).

> Cookie-based auth note: the app is designed for same-site cookies. A
> Vercel-frontend ↔ Railway-backend split is **cross-site**. For authenticated
> cookie flows across origins you will additionally need `AUTH_COOKIE_SAMESITE=None`
> + `AUTH_COOKIE_SECURE=True` and matching CSRF settings (see `docs/AUTH.md`).
> Health/CORS/public endpoints work without this; full cross-site auth testing
> may need that follow-up.

## 12. Treat the environment as staging

Set `APP_ENV=staging`. The hard security posture is set by
`DJANGO_SETTINGS_MODULE=config.settings.production` regardless; `APP_ENV` is an
informational marker used by health checks / slow-request logging.

## 13. Before REAL production — remove the staging billing override

Replace the temporary manual billing with real Stripe:

```env
# remove these:
# BILLING_PROVIDER=manual
# BILLING_ALLOW_MANUAL_PROVIDER=true

# set these:
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

With `BILLING_PROVIDER=manual` and **no** `BILLING_ALLOW_MANUAL_PROVIDER=true`,
the app **refuses to boot** at runtime (SEC-004) — that is intentional. The
build (`collectstatic`) is the only step that skips this check.

## 14. Add Stripe / Resend / R2 / Redis later

These are optional for staging; add them when needed (variables above). Redis +
`ENABLE_BACKGROUND_JOBS=true` + a `worker` (and `beat` or platform cron) are
required only for real background processing — see
`docs/deployment/scale-ready-lean-foundation.md`.

Recommended long-term Railway services:

| Service | Process |
|---|---|
| `duenest-api` | `gunicorn config.wsgi:application` (this service) |
| `duenest-worker` | `celery -A config worker ...` |
| `duenest-beat` | `celery -A config beat` |
| Postgres | database |
| Redis | cache / queue |

Do not stand all of these up for lean staging.

---

## 15. Troubleshooting

**`BILLING_PROVIDER=manual is not allowed in this environment`**
At runtime: set `BILLING_ALLOW_MANUAL_PROVIDER=true` (staging) or switch to
`BILLING_PROVIDER=stripe` with keys (production). At build (`collectstatic`):
already fixed — `BillingConfig` skips the check during collectstatic and the
Dockerfile passes build-only billing vars.

**`DATABASE_URL` missing / `could not translate host name`**
Add `DATABASE_URL=${{Postgres.DATABASE_URL}}` to the backend service and confirm
the Postgres plugin name matches the reference.

**`SECRET_KEY` / `DJANGO_SECRET_KEY` missing or weak**
Set `DJANGO_SECRET_KEY` to a long random value (the code reads `DJANGO_SECRET_KEY`,
not plain `SECRET_KEY`).

**`Insecure billing configuration` at startup but build passed**
Expected — the runtime safety check is intentionally stricter than the build.
Provide the staging flag or Stripe keys.

**Boot fails with a KEK / encryption error**
Set `DUENEST_ACTIVE_KEK_VERSION` + `DUENEST_KEK_V1_B64`. Production fails closed
without a valid encryption key.

**`DisallowedHost` / `ALLOWED_HOSTS` error**
Add the Railway domain to `DJANGO_ALLOWED_HOSTS` (comma-separated, no scheme).

**CORS blocked by browser**
Add the exact Vercel origin to `DJANGO_CORS_ALLOWED_ORIGINS` (scheme + host, no
trailing slash). Restart the service.

**CSRF origin failed (403 on unsafe requests)**
Add the Vercel origin to `DJANGO_CSRF_TRUSTED_ORIGINS`. For cross-site cookie
auth, also configure `AUTH_COOKIE_SAMESITE=None` + `AUTH_COOKIE_SECURE=True`.

**`gunicorn: command not found`**
`gunicorn` is in `requirements.txt`; ensure the build installed requirements and
the Root Directory is `backend`.

**`Could not import config.wsgi`**
Confirm Root Directory is `backend` (so `config/` is importable) and
`DJANGO_SETTINGS_MODULE=config.settings.production`.

**`collectstatic` failed**
Should be fixed by this change. If it recurs, check the Dockerfile build step
logs — it supplies a throwaway `DJANGO_SECRET_KEY`, a throwaway KEK, and
build-only billing vars.

**Static files missing (admin/DRF unstyled)**
WhiteNoise serves them; confirm `collectstatic` ran in the build (it does in the
Dockerfile) and `STATIC_ROOT` resolves (`backend/staticfiles`).

**Migrations not applied**
The start command runs `migrate --noinput`; or run `railway run python
manage.py migrate` manually.

---

## 16. What must change before real production

- Replace manual billing with Stripe (step 13); remove `BILLING_ALLOW_MANUAL_PROVIDER`.
- Move migrations to a dedicated release/one-off step if running multiple
  instances (the single-instance startup migrate is a staging convenience).
- Configure real object storage (R2/S3) so vault files persist (the local
  filesystem on a Railway container is ephemeral).
- Configure a real email provider for password reset / verification delivery.
- Stand up Redis + workers for background jobs; tighten HSTS
  (`DJANGO_HSTS_INCLUDE_SUBDOMAINS` / `DJANGO_HSTS_PRELOAD`) once all subdomains
  are HTTPS.
- Set `FOUNDER_EMAILS` and keep `FOUNDER_ALLOW_ALL_STAFF=false`.
