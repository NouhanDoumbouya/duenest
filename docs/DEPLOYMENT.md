# CertaNest Deployment Guide

How to deploy the CertaNest backend (Django + PostgreSQL + S3-compatible object
storage) for staging/beta, and how to configure provider-neutral object storage.

The frontend (Next.js) deploys to Vercel and is out of scope here.

> **Production domains & email (certanest.com, app/api/mail):** for the domain
> map, DNS, env vars, CORS/CSRF, Resend SPF/DKIM/DMARC, smoke test, and rollback,
> see [CERTANEST_PRODUCTION_DOMAINS.md](CERTANEST_PRODUCTION_DOMAINS.md).

> **Scaling & infrastructure modes:** for how CertaNest runs in lean vs.
> scale-ready mode (Redis cache, Celery workers, the scheduler, queues, process
> types, caching rules, and upgrade triggers), see
> [scale-ready-lean-foundation.md](deployment/scale-ready-lean-foundation.md).
> Lean mode needs no Redis/workers; everything scales by environment variables.

---

## 1. Architecture recap (read this first)

- **Files are app-encrypted before they reach storage.** Uploads are encrypted
  with AES-256-GCM under a per-file wrapped key; only ciphertext is stored.
- **Files are streamed through authenticated Django views**, never via
  object-storage URLs. Object storage holds ciphertext; the API is the
  authorization gate and decrypts in memory only after ownership / share / token
  / expiry / access-code checks pass.
- Therefore **signed object-storage URLs are intentionally not used for file
  delivery** (a signed URL would only return ciphertext). The bucket is still
  configured private + signed-URL-only as defense in depth.

This means moving to object storage is a **configuration change**, not a rewrite:
the code already reads/writes via Django's storage API.

---

## 2. Object storage (provider-neutral)

CertaNest uses provider-neutral `STORAGE_*` environment variables and maps them to
django-storages/boto3 internally. Any S3-compatible provider works.

| Env var | Purpose | Example |
| --- | --- | --- |
| `STORAGE_BACKEND` | `local` (default) or `s3` | `s3` |
| `STORAGE_PROVIDER` | informational label only | `cloudflare_r2` |
| `STORAGE_BUCKET_NAME` | bucket name | `certanest-prod-documents` |
| `STORAGE_ACCESS_KEY_ID` | access key | — |
| `STORAGE_SECRET_ACCESS_KEY` | secret key | — |
| `STORAGE_ENDPOINT_URL` | S3 endpoint (blank for AWS) | `https://<acct>.r2.cloudflarestorage.com` |
| `STORAGE_REGION` | region (`auto` for R2) | `auto` |
| `STORAGE_ADDRESSING_STYLE` | `virtual` or `path` | `virtual` |
| `STORAGE_SIGNATURE_VERSION` | signature version | `s3v4` |
| `STORAGE_PRIVATE` | private bucket (no ACL sent) | `true` |
| `STORAGE_FILE_OVERWRITE` | overwrite same key | `false` |
| `STORAGE_SIGNED_URLS` | sign URLs if ever generated | `true` |
| `STORAGE_SIGNED_URL_EXPIRES_SECONDS` | signed-URL TTL | `300` |
| `STORAGE_MEDIA_PREFIX` | object key prefix | `media/` |

Internally these map to django-storages settings
(`access_key`, `secret_key`, `bucket_name`, `endpoint_url`, `region_name`,
`addressing_style`, `signature_version`, `default_acl`, `querystring_auth`,
`querystring_expire`, `file_overwrite`, `location`). See `config/storage.py`.

### Cloudflare R2 (preferred for beta)

1. Create an R2 bucket named **`certanest-prod-documents`**. Keep it **private**
   — do **not** enable the public **r2.dev** URL or a public custom domain.
2. Create an R2 API token (Object Read & Write, scoped to this bucket) → access
   key id + secret. These are **backend-only** secrets (Railway), never Vercel.
3. Find your account endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
4. Set these on **Railway only** (never in the frontend / Vercel):
   ```
   STORAGE_BACKEND=s3
   STORAGE_PROVIDER=cloudflare_r2
   STORAGE_BUCKET_NAME=certanest-prod-documents
   STORAGE_ACCESS_KEY_ID=...
   STORAGE_SECRET_ACCESS_KEY=...
   STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_REGION=auto
   STORAGE_ADDRESSING_STYLE=virtual
   STORAGE_SIGNATURE_VERSION=s3v4
   STORAGE_PRIVATE=true
   ```
5. Do **not** enable an R2 public bucket / r2.dev / custom domain for this bucket.
   File delivery goes only through CertaNest's authenticated, ownership-checked
   endpoints (which return decrypted bytes, never an object-storage URL).

### Migrating existing local media to R2

Files uploaded while on local disk must be copied into the bucket once after
switching `STORAGE_BACKEND=s3`. The command copies app-encrypted ciphertext
as-is, never deletes local files, and is safe to rerun:

```
# 1. Preview only — writes nothing:
python manage.py migrate_local_media_to_storage --dry-run
# 2. After the dry-run looks right, copy for real:
python manage.py migrate_local_media_to_storage
```

It reports counts only (`copied`, `skipped(existing)`, `missing_on_disk`) and
logs storage keys/sizes — never file contents. Already-present objects with a
matching size are skipped, so reruns are cheap. Keep the local files until you've
verified downloads from R2.

### Verify upload/download

1. Upload a small test document through the app.
2. Confirm the object appears in the `certanest-prod-documents` bucket.
3. Open the document's preview/download in the app — it should succeed
   (authenticated, owner-checked, decrypted in memory).
4. Confirm an **unauthenticated** request to the same download endpoint is
   rejected (401/403) and that no object-storage URL is exposed in any response.

### Railway R2 deployment checklist

1. Add all `STORAGE_*` vars (section 2) to the Railway backend service.
2. Deploy the backend.
3. Run `python manage.py check` (and the storage tests) on the release.
4. Upload a tiny test document; confirm it lands in `certanest-prod-documents`.
5. Confirm preview/download works for the owner; confirm unauthorized access fails.
6. If older local files exist, run the migration **dry-run**, then the real run.
7. Spot-check a migrated file downloads correctly before removing local copies.

### Rollback

The backend is a configuration switch, so rollback is immediate and safe:

- Set `STORAGE_BACKEND=local` (or unset it) and redeploy to fall back to local
  filesystem storage.
- **Keep the local media files** until R2 is fully verified — the migration
  command never deletes them, so the local copies remain a complete fallback.
- No data is lost either way: R2 holds copies, local disk keeps the originals
  until you choose to clean them up.

### Railway bucket / AWS S3 / other S3-compatible (later)

Same variables; only the endpoint/region differ:

- **Railway bucket:** set `STORAGE_ENDPOINT_URL` to the bucket's S3 endpoint,
  `STORAGE_PROVIDER=railway_bucket`, keep `STORAGE_REGION=auto` unless told otherwise.
- **AWS S3:** leave `STORAGE_ENDPOINT_URL` blank, set a real `STORAGE_REGION`
  (e.g. `eu-west-1`), `STORAGE_PROVIDER=aws_s3`. Prefer a bucket policy /
  block-public-access; keep `STORAGE_PRIVATE=true`.
- **MinIO/custom:** set the endpoint, `STORAGE_ADDRESSING_STYLE=path` if needed,
  `STORAGE_PROVIDER=custom_s3`.

---

## 3. Required environment variables (production)

```
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=<long-random>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.certanest.com
DATABASE_URL=postgres://user:pass@host:5432/duenest
DJANGO_CORS_ALLOWED_ORIGINS=https://app.certanest.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.certanest.com
DJANGO_CSP_CONNECT_SRC=https://api.certanest.com
DUENEST_APP_BASE_URL=https://app.certanest.com
DUENEST_ACTIVE_KEK_VERSION=v1
DUENEST_KEK_V1_B64=<base64 32-byte key>   # generate_encryption_key
# + all STORAGE_* vars from section 2
# + EMAIL_* vars (see docs/EMAIL_REMINDERS.md) for all transactional email
#   (invite, waitlist, password reset, email verification, reminders)
# + FRONTEND_APP_URL=https://app.certanest.com  (links in invite/reset/verification emails)
# --- Optional: Integrations OAuth Foundation V1 (import-only; docs/integrations.md) ---
# Leave unset to keep the Google integration "Not configured" (no crash). Never
# commit real values; store in the secret manager.
# GOOGLE_OAUTH_CLIENT_ID=<google-web-client-id>
# GOOGLE_OAUTH_CLIENT_SECRET=<google-web-client-secret>
# GOOGLE_OAUTH_REDIRECT_URI=https://api.certanest.com/api/v1/integrations/google/callback/
# Google Calendar Import V1 (docs/integrations-google-calendar.md) adds NO new env:
# it reuses the three GOOGLE_OAUTH_* values above and the existing read-only
# `calendar.readonly` scope. Gate it with the `google_calendar_import` feature flag.
```

Production settings **fail closed** if the encryption KEK is missing/malformed.

---

## 4. Deploy targets

### Railway / Render / Heroku-style (Procfile)

`backend/Procfile` defines:
- `release: python manage.py migrate --noinput && python manage.py collectstatic --noinput`
- `web: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT ...`

Set the build to install `backend/requirements.txt` and the root to `backend/`.
Static files are served by WhiteNoise (already wired in production settings).

### Docker (Fly.io / any container host)

`backend/Dockerfile` builds a production image (includes `tesseract-ocr` +
`poppler-utils` for OCR/PDF features), runs `collectstatic` at build with a
throwaway key, runs migrations at start, then serves with gunicorn.

```
docker build -t duenest-backend ./backend
docker run --env-file backend/.env -p 8000:8000 duenest-backend
```

For multi-instance deployments, run migrations as a separate release step rather
than at container start.

---

## 5. Deployment commands

```
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py createsuperuser            # optional
python manage.py seed_feature_flags         # optional, seeds feature registry
python manage.py generate_encryption_key    # to mint a KEK value
```

### Migrating existing local files to object storage (one-off)

After switching `STORAGE_BACKEND=s3`, copy any files uploaded while on local disk:

```
python manage.py migrate_local_media_to_storage --dry-run   # preview
python manage.py migrate_local_media_to_storage             # copy
```

This copies ciphertext as-is, never decrypts, skips already-present objects, and
**never deletes local files**.

---

## 6. Backend deployment checklist

- [ ] Set `DATABASE_URL` (PostgreSQL)
- [ ] Set `DJANGO_SECRET_KEY`
- [ ] Set `DJANGO_DEBUG=False`
- [ ] Set `DJANGO_ALLOWED_HOSTS`
- [ ] Set `DJANGO_CORS_ALLOWED_ORIGINS` + `DJANGO_CSRF_TRUSTED_ORIGINS` (frontend domain)
- [ ] Set `DUENEST_ACTIVE_KEK_VERSION` + `DUENEST_KEK_V1_B64`
- [ ] Set all `STORAGE_*` vars (`STORAGE_BACKEND=s3`, private bucket)
- [ ] Set `EMAIL_*` (+ `FRONTEND_APP_URL`) for all transactional email — invite, waitlist, password reset, email verification, reminders
- [ ] Run migrations
- [ ] Run collectstatic
- [ ] Create superuser (if needed)
- [ ] Verify `GET /api/v1/health/` returns `{"status": "ok"}`
- [ ] Upload a test document → confirm object appears in the bucket (ciphertext)
- [ ] Preview the test document (authenticated)
- [ ] Download the test document (authenticated)
- [ ] Quick Share: create a share, claim it, verify view-only vs download enforcement, revoke, expiry
- [ ] Emergency Access: open public viewer for selected items only; expired/revoked blocked
- [ ] Secure Room: open via token + access code; preview/download/zip
- [ ] Schedule `python manage.py process_due_notifications` (cron) for reminders
- [ ] Schedule `python manage.py process_emergency_checkins` (cron, e.g. every
      few minutes) so armed emergency **safety check-ins** nudge the owner before
      the deadline and fire the escalation (alert trusted contacts) when overdue.
      Honors the `emergency_checkin` kill switch (no-send when disabled).
- [ ] Schedule `python manage.py purge_expired_trash` (e.g. daily) to enforce
      `TRASH_RETENTION_DAYS` (the Trash "days until permanent deletion" countdown)

---

## 7. How to run tests

```
cd backend
python manage.py test --settings=config.settings.testing
# focused:
python manage.py test apps.documents apps.quick_share apps.core --settings=config.settings.testing
```

Tests use local filesystem storage (no S3/boto3 needed).

---

## 8. Known remaining risks (pre-beta)

- JWT is stored in `localStorage` on the frontend (move to HttpOnly cookies for
  an open beta).
- No background worker — reminders run via the `process_due_notifications`
  management command and need a scheduler.
- Production email provider must be configured + domain-authenticated before
  relying on reminder emails.
- Multi-instance migrations should run as a release step, not at container start.

## Scheduled jobs (Railway Cron)

CertaNest's background work runs as Django management commands invoked by an
external scheduler (Railway Cron). There is no Celery/queue. Each command is
idempotent and writes a `ScheduledJobRun` you can view in the founder console at
`/dashboard/founder/jobs`. Recommended scheduler entries (cron `command`):

| Job | Command | Suggested cron | Notes |
| --- | --- | --- | --- |
| Notification delivery | `python manage.py process_due_notifications` | every 30–60 min | Idempotent (dedupe_key); safe to run often. |
| Weekly Radar email | `python manage.py send_weekly_radar_emails` | weekly | Dedupes via EmailLog (6-day window). |
| AI briefing digest | `python manage.py send_ai_digests` | weekly | Calls the AI provider; never triggered from the console. |
| Emergency check-ins | `python manage.py process_emergency_checkins` | daily (or hourly) | Feature-gated + state-guarded. |
| Trash purge (destructive) | `python manage.py purge_expired_trash` | daily | Permanent delete past `TRASH_RETENTION_DAYS`. Set `0` to disable. |
| Billing access sync | `python manage.py sync_billing_access` | daily | Local entitlement lifecycle sync (no live Stripe calls). |

Each command accepts `--dry-run` to preview without side effects, e.g.:

```bash
python manage.py purge_expired_trash --dry-run
python manage.py send_weekly_radar_emails --dry-run
```

**Check last run:** open `/dashboard/founder/jobs` (founder/staff only) — it shows
each job's health (healthy / stale / failing / never-run), last run time, counts,
and recent history. The same counts appear under `jobs_summary` in
`GET /api/v1/founder/system-status/`.

**Recover from a stale job:** a "stale" badge means a job hasn't completed within
its expected window — check the scheduler entry exists and is firing, then run the
command manually (or, for safe non-destructive jobs, click **Run now** in the
console). Trash purge is **dry-run only** from the console; run the real command
from the scheduler/CLI. No secrets are needed beyond the existing environment.
