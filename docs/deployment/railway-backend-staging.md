# Railway Backend Staging Deployment

How to deploy the DueNest **backend** (Django/DRF) to Railway for **private
staging**, connected to Railway PostgreSQL, ready for the Vercel frontend to
call. The frontend stays on Vercel; only the backend deploys here.

> **This is private staging, not public production launch.** Even if the Railway
> environment is named `production`, treat it as staging until real launch.
> Manual billing is temporarily allowed here (with an explicit flag) and **must
> be removed before real production** (see step 13).

---

## 0. Builder + start command

DueNest deploys via the **Dockerfile** at `backend/Dockerfile` (Python 3.12-slim;
it installs `tesseract-ocr` + `poppler-utils` for OCR and `libpq5` for Postgres —
Nixpacks would not install these). `backend/railway.json` pins the Docker builder
and the health check path. **Do not** switch to Nixpacks.

**Startup is controlled by the Dockerfile `CMD` — there is intentionally NO
`startCommand` in `railway.json`.** The CMD is:

```dockerfile
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120"]
```

It runs through `sh -c`, so `${PORT:-8000}` is expanded by a real shell, the
worker count is hardcoded (`2`), and it does **not** run migrations.

> **Do NOT put a `startCommand` with `${WEB_CONCURRENCY:-2}` (or any
> `${VAR:-default}`) in `railway.json` or the Railway UI.** Railway expands a
> `startCommand` with its own engine that does **not** support the bash
> default-value syntax, so Gunicorn receives the literal string and crashes:
> `gunicorn: error: argument -w/--workers: invalid int value: '${WEB_CONCURRENCY:-2}'`.

### Railway UI "Custom Start Command"

Leave it **empty** so the Dockerfile `CMD` is used (recommended). If you must set
one, use a literal worker count and the plain `$PORT` variable:

```bash
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

Never use `--workers ${WEB_CONCURRENCY:-2}` in the Railway UI / `railway.json`
start command — Railway will not expand the `:-default` part. (You may
re-introduce `${WEB_CONCURRENCY:-2}` later **only** inside a `sh -c "..."` wrapper
that is guaranteed to run through a shell, and after testing.) Do not include
`migrate` in the start command.

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
`collectstatic` (build-safe — see "Root cause" below); the container then starts
**Gunicorn only**, via the Dockerfile `CMD` (see §0). It does **not** run
migrations — see the next section for why and how.

## 7. Running migrations on Railway

> **The web container never migrates.** Running `migrate` inside the web start
> command means every crash/restart re-runs it; a container killed mid-migration
> (healthcheck timeout, deploy restart, OOM) can leave a **half-applied schema**
> that the next restart trips over — e.g.
> `relation "..._dn_code_..._like" already exists`. So migrations are a separate,
> one-off step you run intentionally.

Run migrations **once** after a deploy that includes schema changes, using any of:

**A. Railway one-off command (preferred)** — service → **Settings → Deploy →
Custom Start Command**, or the "Run a command" / shell option, run:

```bash
python manage.py migrate --noinput
# or the helper:
sh scripts/run_migrations.sh
```

**B. Railway CLI** (from your machine, linked to the service/environment):

```bash
railway run python manage.py migrate --noinput
```

**C. Temporary one-off release** — set the Railway UI **Custom Start Command** to
`python manage.py migrate --noinput`, deploy once, watch it complete, then
**clear** the Custom Start Command again so the Dockerfile `CMD` (Gunicorn) runs.

**D. Dedicated migration service/job** — a second Railway service from the same
repo whose start command is `python manage.py migrate --noinput` (run on demand).

If the web service is **unhealthy and you cannot open a console**, use option C
(temporary start command) or option D, or reset the database (see "Fixing a
partial migration failure" below) if there is no real data.

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
NEXT_PUBLIC_APP_URL=https://duenest-mu.vercel.app
NEXT_PUBLIC_ENV=staging
```

(The current staging frontend is `https://duenest-mu.vercel.app`.) Then redeploy
the frontend. Make sure the backend's `DJANGO_CORS_ALLOWED_ORIGINS` and
`DJANGO_CSRF_TRUSTED_ORIGINS` include the exact Vercel origin (scheme + host, no
trailing slash) — e.g. `https://duenest-mu.vercel.app`. **Never** put
`DATABASE_URL`, `DJANGO_SECRET_KEY`, Stripe secret keys, R2 secrets, or
`DUENEST_KEK_*` in Vercel.

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

## Fixing a partial migration failure on staging

If a deploy crashed mid-migration (back when migrations ran in the web start
command), the database may be half-applied. The classic symptom:

```txt
django.db.utils.ProgrammingError: relation
"quick_share_quicksharesession_dn_code_0d6d36ab_like" already exists
```

That `..._like` object is the Postgres `varchar_pattern_ops` index Django creates
for an indexed text column. **This was a genuine migration bug on Postgres** (not
just a half-applied artifact): `dn_code` was declared with **both** `unique=True`
**and** `db_index=True`, so `quick_share.0002` tried to create that `_like` index
**twice** (once for `unique`, once for `db_index`) with the same name. It is now
**fixed** — the redundant `db_index=True` was removed, so a fresh database
migrates cleanly. (SQLite did not surface it because SQLite has no
`varchar_pattern_ops` `_like` indexes.)

**On the fixed code, just re-run the migration** — `0002` is atomic, so the
failed apply rolled back fully (quick_share is still at `0001`, with no leftover
`dn_code` column/index):

```bash
python manage.py migrate --noinput
```

If anything was somehow left behind (a stray `dn_code` column or `_like` index),
reset the DB (below) or drop the leftover and re-migrate.

### Recommended fix: reset the staging database (no real data)

Private staging has no real user data, so the simplest, safest fix is a clean DB:

1. Deploy this branch first so the web container no longer auto-migrates.
2. In Railway, **delete and re-add the PostgreSQL plugin** (or use its
   "Reset"/"Wipe" if available) to get an empty database.
3. Confirm the backend's `DATABASE_URL=${{Postgres.DATABASE_URL}}` points at the
   new database (update if the reference changed).
4. Run migrations **once**: `python manage.py migrate --noinput` (see §7).
5. Start/redeploy the web service.
6. Test `curl https://<service>.up.railway.app/api/v1/health/`.

### Alternative: repair in place (preserve data)

Only if you must keep data. **Inspect first**, then choose A or B. Use the
Railway Postgres "Connect"/`psql` console:

```sql
-- 1. Is the migration recorded as applied?
SELECT app, name, applied FROM django_migrations
WHERE app = 'quick_share' ORDER BY name;

-- 2. Does the column already exist?
SELECT column_name FROM information_schema.columns
WHERE table_name = 'quick_share_quicksharesession' ORDER BY column_name;

-- 3. Which indexes already exist on the table?
SELECT indexname FROM pg_indexes
WHERE tablename = 'quick_share_quicksharesession' ORDER BY indexname;
```

**Option A — migration NOT recorded, only the stray index exists.** Drop just the
duplicate index and let the migration recreate everything:

```sql
DROP INDEX IF EXISTS quick_share_quicksharesession_dn_code_0d6d36ab_like;
```

```bash
python manage.py migrate --noinput
```

If the plain `dn_code` index and/or the column also exist (but the migration is
not recorded), drop those leftovers too before re-running — match what step 3
showed:

```sql
-- only if present AND the migration is not recorded:
DROP INDEX IF EXISTS quick_share_quicksharesession_dn_code_0d6d36ab;
ALTER TABLE quick_share_quicksharesession DROP COLUMN IF EXISTS dn_code;
```

**Option B — column AND all expected indexes already exist and match the
migration exactly, and only the `django_migrations` record is missing.** Then,
and only then, mark it applied without re-running its DDL:

```bash
python manage.py migrate quick_share 0002 --fake
python manage.py migrate --noinput
```

> **Warnings.** Do not `--fake` blindly — only after the inspection above
> confirms the schema already matches. Do not drop database objects in real
> production without a backup. For staging with no real data, the **reset** above
> is the safest and fastest path.

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
The web container does **not** migrate (by design). Run them once via §7
(`python manage.py migrate --noinput` through a Railway one-off command, the CLI,
or `sh scripts/run_migrations.sh`).

**`relation "..._like" already exists` during migrate**
A half-applied migration from an earlier restart loop. See "Fixing a partial
migration failure on staging" above — reset the staging DB (no real data) or
repair in place after inspecting.

---

## 16. What must change before real production

- Replace manual billing with Stripe (step 13); remove `BILLING_ALLOW_MANUAL_PROVIDER`.
- Keep migrations as a one-off/release step (already the case — the web
  container never migrates). For zero-downtime, run them before rolling the web
  service.
- Configure real object storage (R2/S3) so vault files persist (the local
  filesystem on a Railway container is ephemeral).
- Configure a real email provider for password reset / verification delivery.
- Stand up Redis + workers for background jobs; tighten HSTS
  (`DJANGO_HSTS_INCLUDE_SUBDOMAINS` / `DJANGO_HSTS_PRELOAD`) once all subdomains
  are HTTPS.
- Set `FOUNDER_EMAILS` and keep `FOUNDER_ALLOW_ALL_STAFF=false`.
