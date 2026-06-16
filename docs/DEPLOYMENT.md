# DueNest Deployment Guide

How to deploy the DueNest backend (Django + PostgreSQL + S3-compatible object
storage) for staging/beta, and how to configure provider-neutral object storage.

The frontend (Next.js) deploys to Vercel and is out of scope here.

> **Scaling & infrastructure modes:** for how DueNest runs in lean vs.
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

DueNest uses provider-neutral `STORAGE_*` environment variables and maps them to
django-storages/boto3 internally. Any S3-compatible provider works.

| Env var | Purpose | Example |
| --- | --- | --- |
| `STORAGE_BACKEND` | `local` (default) or `s3` | `s3` |
| `STORAGE_PROVIDER` | informational label only | `cloudflare_r2` |
| `STORAGE_BUCKET_NAME` | bucket name | `duenest-prod` |
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

1. Create an R2 bucket (e.g. `duenest-prod`). Keep it **private** (no public access).
2. Create an R2 API token (Object Read & Write) → access key id + secret.
3. Find your account endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
4. Set:
   ```
   STORAGE_BACKEND=s3
   STORAGE_PROVIDER=cloudflare_r2
   STORAGE_BUCKET_NAME=duenest-prod
   STORAGE_ACCESS_KEY_ID=...
   STORAGE_SECRET_ACCESS_KEY=...
   STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_REGION=auto
   STORAGE_ADDRESSING_STYLE=virtual
   STORAGE_SIGNATURE_VERSION=s3v4
   STORAGE_PRIVATE=true
   ```
5. Do **not** enable an R2 public bucket/custom domain for this bucket.

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
DJANGO_ALLOWED_HOSTS=api.duenest.com
DATABASE_URL=postgres://user:pass@host:5432/duenest
DJANGO_CORS_ALLOWED_ORIGINS=https://app.duenest.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.duenest.com
DJANGO_CSP_CONNECT_SRC=https://api.duenest.com
DUENEST_APP_BASE_URL=https://app.duenest.com
DUENEST_ACTIVE_KEK_VERSION=v1
DUENEST_KEK_V1_B64=<base64 32-byte key>   # generate_encryption_key
# + all STORAGE_* vars from section 2
# + EMAIL_* vars (see docs/EMAIL_REMINDERS.md) for real reminder delivery
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
- [ ] Set `EMAIL_*` for real reminder delivery
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
