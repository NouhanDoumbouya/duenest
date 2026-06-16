# Scale-Ready Lean Foundation

> **Status: scale-ready lean foundation implemented.**
>
> DueNest is architected like a serious SaaS but can be *operated* like a
> disciplined early-stage project. The same codebase runs in two modes, switched
> entirely by environment variables — no code changes to scale up.
>
> **This does NOT mean DueNest can serve 10,000 concurrent users today.** It
> means the seams are in place (cache, queues, scheduler, paginated lists,
> indexes, bounded OCR, async-ready email, analytics rollups) so you can start
> cheap and scale by upgrading services and adding replicas/workers — not by
> rewriting the app under pressure. Real concurrency numbers must be proven with
> load tests on the target paid infrastructure (see § Load testing).

## The two modes

| | Lean mode (default) | Scale-ready mode |
| --- | --- | --- |
| Cache | per-process `LocMemCache` | Redis (`REDIS_URL`) |
| Background jobs | inline / eager (no worker) | Celery workers on Redis |
| Scheduler | platform cron *or* nothing | Celery Beat *or* platform cron |
| OCR | inline, bounded | `scanner` queue |
| Email | inline SMTP | `email` queue with retries |
| Founder analytics | live + short cache | daily rollups + cache |

Lean mode needs **zero** extra services: `python manage.py runserver` (or one
`web` dyno) is enough. Everything below is additive.

### Switching to scale-ready mode

```bash
REDIS_URL=redis://...              # enables Redis cache + Celery broker
ENABLE_BACKGROUND_JOBS=True        # tasks dispatch to workers instead of inline
ENABLE_CELERY_BEAT=True            # if you run the `beat` process (else use cron)
ENABLE_FOUNDER_ANALYTICS_ROLLUPS=True
SCANNER_ASYNC_PROCESSING_ENABLED=True
```

Then run the `worker` (and `beat`) processes from the `Procfile`.

## Environment variables

See `backend/.env.example` for the full annotated list. Grouped by when they
become relevant:

* **Local dev (required): none.** Lean mode works out of the box.
* **Private staging (recommended):** `APP_ENV`, `DATABASE_URL` (managed
  Postgres), storage (`STORAGE_*` for R2/S3), `EMAIL_PROVIDER`+`RESEND_API_KEY`,
  `SENTRY_DSN`. Redis/workers remain optional.
* **Public launch (required):** `REDIS_URL` + `ENABLE_BACKGROUND_JOBS` + a
  `worker` (and `beat` or platform cron), all staging items on paid tiers,
  `STRIPE_*` in live mode.

## Process types (Procfile)

| Process | When | Notes |
| --- | --- | --- |
| `web` | always | gunicorn, `WEB_CONCURRENCY` workers. |
| `worker` | scale-ready only | `celery -A config worker`; scale horizontally. |
| `beat` | scale-ready only | exactly ONE; or use platform cron instead. |
| `release` | always | runs migrations + collectstatic per deploy. |

### Queues

Tasks are routed to named queues so workloads scale independently:
`critical, email, notifications, push, scanner, files, billing, analytics,
default`. A heavy OCR workload can get a dedicated worker:
`celery -A config worker -Q scanner`.

## Scheduler

Scheduled jobs (all idempotent, all log a summary):

| Job | Cadence | Celery Beat task / management command |
| --- | --- | --- |
| Due notifications/reminders | every 15 min | `apps.notifications.tasks.process_due_notifications` / `manage.py process_due_notifications` |
| Trash purge | daily | `apps.documents.tasks.purge_expired_trash` / `manage.py purge_expired_trash` |
| Billing access sync | hourly | `apps.billing.tasks.sync_billing_access` / `manage.py sync_billing_access` |
| Founder analytics rollup | every 10 min | `apps.founder.tasks.rollup_daily_analytics` |

**Two ways to run them** (pick one):

1. **Celery Beat:** run the `beat` process (`ENABLE_CELERY_BEAT=True`). Schedules
   are defined in `config/celery.py`.
2. **Platform cron** (Railway/Render scheduled jobs) — preferred for lean mode,
   no extra always-on process:

   ```bash
   */15 * * * *  python manage.py process_due_notifications
   10 3 * * *    python manage.py purge_expired_trash
   5 * * * *     python manage.py sync_billing_access
   ```

   (The analytics rollup is only needed once `ENABLE_FOUNDER_ANALYTICS_ROLLUPS`
   is on; trigger it from beat or add a cron calling a small wrapper.)

Reminders **must** be scheduled one way or the other before private beta, or
they never fire.

## Caching: what is and isn't cached

Cache helpers live in `apps/core/cache.py`. Every per-user key embeds the user
id (`user_key`), every per-org key embeds the org id (`org_key`), so tenants
never collide on a shared Redis.

**Safe to cache** (short TTLs in `.env.example`): plan catalog (1 h), feature
flags (60 s), user entitlements (60 s), dashboard summary counts (30–60 s),
notification unread count (30 s), founder analytics rollups (5–15 min).

**NEVER cache** (hard rule): decrypted document bytes, raw file responses,
emergency-access details, share-code/token-protected responses, or any
user-scoped sensitive payload in a shared/public cache. Founder analytics is a
global, non-PII aggregate, so it is cached under a global key with founder
access still enforced at the view.

## File delivery memory strategy

Today, encrypted files are decrypted **fully into memory** before streaming
(`apps/documents/file_encryption.read_plaintext` → `FileResponse(BytesIO(...))`).
This is bounded by the upload size cap (`SCANNER_MAX_UPLOAD_MB`, default 15 MB),
and downloads larger than `LARGE_FILE_DOWNLOAD_WARN_BYTES` log a warning (id +
size only, never content) so the pattern is observable before it bites.

**What we did NOT change this sprint:** we did not switch to streaming/chunked
decryption (it must be done carefully to preserve AES-GCM authentication) and we
did **not** expose private storage URLs as a shortcut (that would break the
security model). Keep the size cap conservative.

**Future design note — streaming encrypted delivery:** to support larger files
without proportional memory use, encrypt in fixed-size chunks (e.g. 1 MB) each
with its own nonce + GCM tag and a chunk index bound into the AAD, then stream
chunk-by-chunk on download, verifying each tag before yielding. Authorization
stays in front (no storage URLs). Until that exists, the size cap is the control.

## Document list scalability

`DocumentViewSet.list` no longer loads the whole vault into memory. Health /
attention filters are expressed in SQL (`computed_status_db` annotation mirrors
`services.get_document_health`), so the queryset paginates at the database
(`LIMIT`/`OFFSET`). A regression test
(`apps/documents/test_list_scalability.py`) asserts the query count does not grow
with vault size. Supporting indexes were added (see below).

## Database indexes added

| Model | Index | Why |
| --- | --- | --- |
| `Document` | `(owner, is_trashed, -is_pinned, -created_at)` | the default vault list filter + sort in one index |
| `Document` | `(owner, is_trashed, status)` | owner+status filtering within trash scope |
| `DailyAnalyticsRollup` | `(date)` (+ unique) | rollup lookups |

Already present (verified, not duplicated): `DocumentFile(document, is_trashed)`,
`Notification(user, status, created_at)`, `Document(owner, expiry_date)`.

## When to upgrade each service (upgrade triggers)

**Frontend (Vercel Hobby → Pro):** commercial/public use begins; Hobby
limits/policy no longer fit; bandwidth/build limits hit; team/business needs.

**Backend (Railway Hobby → larger / more replicas):** API p95 stays high;
CPU/RAM saturated; requests queue; you need more `web` replicas; logs show worker
timeouts.

**Redis (none → managed → larger):** Celery queues go active; cache memory
pressure; queue latency grows; worker retries/failures climb.

**Email (Resend free → paid):** >100 emails/day; reminder/emergency/billing
volume rises; deliverability/domain requirements increase.

**Storage (R2/S3 free → paid):** >10 GB stored; operation limits exceeded;
download traffic grows; lifecycle policies needed.

**Database (managed Postgres → bigger / PgBouncer / replica):** high connection
count; query latency rises; CPU/storage high; backup/restore SLAs tighten;
read-replica or pooler becomes necessary.

## Lean "≈RM150/month-style" starting setup

* Frontend: Vercel Hobby (free)
* Backend: Railway Hobby (small paid)
* Database: managed Postgres (small paid)
* Redis: **skip at first** (lean mode) — add a small instance when you turn on
  workers
* Storage: Cloudflare R2 (free tier, 10 GB)
* Email: Resend free tier (100/day)
* Stripe: test mode (free)
* Monitoring: Sentry free + an uptime monitor hitting `/api/v1/readiness/`
* DNS/CDN: Cloudflare free

What stays optional at first: Redis, workers, beat, founder rollups, async OCR.
What becomes required for public launch: Redis + workers + scheduler, paid
email, live Stripe, and documented load-test results.

## Observability

* **Sentry** — set `SENTRY_DSN` (no-op if unset or SDK absent).
* **Slow requests** — logged over `SLOW_REQUEST_MS` (path + timing only; tokens
  redacted) by `SlowRequestLogMiddleware`.
* **Slow queries** — enable Postgres `log_min_duration_statement` (e.g. 500 ms)
  at the DB level.
* **Health/readiness** — `GET /api/v1/health/` (liveness) and
  `GET /api/v1/readiness/` (DB + cache round-trip; 503 when degraded).
* **Workers/queues** — Celery emits task logs; use Flower or the platform's
  metrics for queue depth and failure/retry rates.
* **File timing** — large-download warnings (id + size only).

## Load testing — what is NOT proven yet

The `tools/performance/` k6 scripts + `seed_perf_account` command let you verify
behaviour on staging, but **no large load test has been run** as part of this
sprint. Before claiming any concurrency target you must, on the **target paid
infrastructure**:

1. Seed accounts at 1k / 10k documents.
2. Run `k6-vault-list.js`, `k6-mixed-traffic.js`, `k6-public-share.js`,
   `k6-file-download.js`, and (carefully, low VUs) `k6-scanner-upload.js`.
3. Ramp 10 → 50 → 100 → 500 → 1,000 VUs and record p95/p99 + error rate.
4. Confirm workers keep up (queue depth stable) and DB connections/CPU are sane.

Until that exists, treat capacity as **unproven**. The foundation makes scaling
a configuration + provisioning exercise, not a rewrite — that is the goal of
this sprint.
