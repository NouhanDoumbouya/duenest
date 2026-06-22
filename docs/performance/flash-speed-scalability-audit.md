# CertaNest — Flash-Speed, Scalability & Production-Readiness Audit

> **Audit-only sprint.** This document inspects the real code and identifies
> concrete bottlenecks and scaling risks. No broad optimizations were
> implemented. Two findings (PERF-014, PERF-015) include tiny, clearly-safe
> notes but were **not** applied. Performance fixes are expected in a later
> branch after the security remediation work is merged.
>
> Branch: `performance/flash-speed-scalability-audit`
> Date: 2026-06-16
> Scope: `backend/` (Django/DRF) and `frontend/` (Next.js 16) as of `main`.

---

## 1. Executive summary

CertaNest is, for its current stage, an **unusually well-built codebase** from a
correctness and security standpoint, and the *most common* performance traps
have already been avoided in the hot path:

* The core `DocumentViewSet` queryset already uses `select_related`,
  `prefetch_related`, and `Exists`/`Count` annotations to avoid per-row N+1
  queries, and the serializer caches computed health/confidence per object.
* Models are **heavily indexed** (74 `Index` definitions in the documents app
  alone; share/emergency/room tokens are `unique=True, db_index=True`).
* DRF pagination is configured globally (`PAGE_SIZE = 20`, capped at 100).
* The two genuinely heavy frontend libraries — **jsPDF** (a 408 KB chunk) and
  the **world-atlas/topojson** map data (a 124 KB chunk) — are already
  route-split / lazily imported and do **not** enter the initial bundle.

The problems are therefore not "rookie" N+1s; they are **architectural gaps for
scale**:

1. **No asynchronous processing layer at all.** There is no Celery/RQ, no Redis,
   no cache backend, and the `Procfile` defines only a `web` process — no
   `worker`. Every slow operation (OCR, PDF compression, malware scan, email)
   runs **inside the request** or inside a single-process management command.
2. **The document list endpoint materializes the user's entire vault into
   memory on every list call** before paginating (PERF-001). Pagination
   protects the *response* size but not the *server* cost.
3. **Encrypted files are fully decrypted into RAM** before streaming
   (PERF-002) — bounded today only by a 10 MB upload cap.
4. **The reminder engine iterates every active user every run** (PERF-004),
   so its cost grows with total users, not with due reminders.
5. **The frontend is ~82% client components** (79 of 96 pages) with **zero
   `next/dynamic`** usage and client-side data fetching, producing a
   render→hydrate→fetch waterfall on almost every page.

None of these break a small private beta. All of them must be addressed on the
path to 10k+ users. The good news: the data model and query layer are solid, so
the work is mostly *infrastructure* (workers, cache, streaming) rather than a
rewrite.

## 2. Overall performance posture score

**6.5 / 10** for the current stage.

* Query/ORM hygiene: 8/10 (genuinely good)
* Indexing: 8/10
* Frontend bundle splitting of heavy libs: 7/10
* Async/background architecture: 2/10 (absent)
* File/stream handling: 4/10 (in-memory)
* Caching: 1/10 (none)
* Frontend rendering strategy: 4/10 (client-heavy, no SSR/streaming)

## 3. "Flash-speed" readiness verdict

**Not yet "flash-fast", but close on the data layer.** The backend will be fast
for normal account sizes today. The *perceived* speed is held back by the
client-rendered, fetch-after-hydration frontend (no skeleton-on-server, no
SSR/streaming) and by the absence of any caching for stable data. With
skeleton-first rendering, a few cached endpoints, and selective server
rendering, CertaNest can credibly feel instant. It is not there today.

## 4. Private beta readiness verdict

**Ready for a small private beta (1–100 users) with caveats.** The app will
work. Before staging you should fix the unbounded list materialization
(PERF-001), move the scanner's OCR/compression off the request path or strictly
bound it (PERF-003), and stand up a real scheduler for reminders. See § 22.

## 5. Public launch scalability verdict

**Not ready for public launch at scale.** Without a worker/queue, cache, and
streaming file delivery, the app will degrade as soon as (a) accounts get large,
(b) scanner usage is concurrent, or (c) the reminder cron has many users to
sweep. The path is well-understood and staged in § 19; none of it requires
abandoning the current architecture.

---

## 6. Architecture performance map

```
                         Browser (Next.js 16, App Router)
   79/96 pages are "use client"  ──────────────────────────────────────────┐
   data fetched client-side via src/lib/api.ts (fetch, credentials:include) │
                         │  /api/v1/* (same-origin)                         │
                         ▼                                                   │
   Next rewrite (next.config.ts) ──proxy──►  Django (gunicorn, 3 workers,   │
                                             --timeout 60, WSGI sync)        │
                         │                                                   │
   ┌─────────────────────┼───────────────────────────────────────────────┐ │
   │  DRF API  /api/v1/                                                    │ │
   │   • DocumentViewSet      → list() materializes full queryset (PERF-1)│ │
   │   • file download/preview→ read_plaintext() decrypts whole file (P-2)│ │
   │   • scanner upload       → malware + PDF compress + OCR inline (P-3) │ │
   │   • founder analytics    → aggregates recomputed from ProductEvent   │◄┘
   │   • quick_share/emergency→ token lookups (indexed, fine)             │
   └──────────────┬─────────────────────────┬─────────────────────────────┘
                  │                          │
            PostgreSQL (prod)          Object storage (S3/R2 via
            conn_max_age=600           django-storages) OR local FS;
            no pooler, no replica      files are app-encrypted; delivered
                                       ONLY through authenticated views
                                       (never via storage URLs)

   Scheduled work (NO worker process — external scheduler must invoke):
     manage.py process_due_notifications   → sweeps ALL active users (PERF-4)
     manage.py purge_expired_trash
     manage.py rotate_file_keys / encrypt_existing_files / sync_billing_access

   Caching:        NONE   (no CACHES backend, no Redis)
   Async queue:    NONE   (no Celery/RQ; Procfile has only `web`)
   Email:          synchronous SMTP (EmailMultiAlternatives.send())
   Malware scan:   ClamAV via unix socket, synchronous (when enabled)
   OCR:            pytesseract + pdf2image (poppler), synchronous, CPU-heavy
   PWA:            partial — public/scanner-sw.js (scanner only), not full shell
```

**Key request flows**

* **Auth/session:** HttpOnly cookie JWT (`apps/users/cookie_auth.py`), single-
  flight refresh on the client (`src/lib/api.ts`). Cheap. No concern.
* **Vault list:** `GET /documents/` → annotated queryset → `list(queryset)` →
  Python health filter → paginate the Python list → serialize.
* **File download:** authorize → `read_plaintext()` (whole file → RAM, decrypt)
  → `FileResponse(io.BytesIO(plaintext))`.
* **Public share:** token (in path) → `resolve_session(token)` (indexed) →
  access-code check (throttled) → metadata/preview/download (same in-RAM path).
* **Reminders:** external scheduler → `process_due_notifications` → loop every
  active user → `iter_due_candidates(user)` (~10–15 queries/user) → create +
  deliver (synchronous SMTP).

---

## 7. Frontend performance findings

Evidence (measured this audit):

* `find src/app -name page.tsx` → **96 pages**; `grep -rl "use client"` over
  pages → **79** are client components (**~82%**).
* `grep -rn "next/dynamic\|dynamic("` over `src` → **0** dynamic imports.
* `React.lazy`/`Suspense` → only **4** files.
* `npm run build` (Next 16.2.9) succeeded (exit 0). Total static JS:
  **4.3 MB across 118 chunks** (uncompressed). Largest chunks:
  * `…37o2xk6vw3enh.js` **408 KB** → jsPDF (lazy; scanner route only ✅)
  * `…3peubv2924kx4.js` **222 KB** → react-dom (framework, shared)
  * `…1w4tz-1creobk.js` **128 KB** → world-atlas/topojson (founder map only ✅)
* Heavy libs are correctly code-split. `src/lib/scanner/pdf.ts` uses
  `await import("jspdf")` — good.

**What's good:** route-level splitting works; the two big libraries are
isolated to their routes; the documents page (`page.tsx`, 982 lines) paginates
server-side (`page`, `hasNext`, `loadingMore`) and debounces search; skeletons
exist (`Array.from({length:3}).map(...)`).

**What's slow / risky:**

* **Client-rendered everything + client-side fetch = waterfall.** Almost every
  dashboard page is `"use client"` and fetches its data through
  `src/lib/api.ts` *after* the JS loads and hydrates. The server sends an empty
  shell; the user waits for: HTML → JS download → hydration → fetch → paint.
  This is the single biggest *perceived* performance issue.
* **No `next/dynamic` anywhere.** Large in-page widgets (the founder choropleth,
  the scanner UI, QR generation via `qrcode`, heavy charts/timeline views) are
  statically imported within their route bundles. Even where route-split, the
  *whole route bundle* must arrive before first paint of that route.
* **Big page modules.** `documents/page.tsx` (982 lines), `vault/page.tsx`
  (653), `dashboard/page.tsx` (554) ship and hydrate as one client unit.
* **Largest-account behavior** depends on the backend list endpoint (PERF-001);
  the client paginates correctly, so the frontend itself is not the list bottleneck.

See PERF-006, PERF-007, PERF-013.

> Note: `frontend/AGENTS.md` warns that this is Next.js **16**, which has
> breaking changes vs. older docs. Recommendations below are kept at the
> architectural level (server components, streaming, dynamic import, caching
> headers) and should be implemented against `node_modules/next/dist/docs/`.

---

## 8. Backend / API performance findings

The query layer is good. The concrete risks, by endpoint:

| Endpoint / view | File | Risk | Severity |
| --- | --- | --- | --- |
| `DocumentViewSet.list` | `apps/documents/views.py:401` | `list(queryset)` materializes whole vault before pagination | **High** |
| `DocumentViewSet.attention_needed` | `views.py:507` | loads all non-trashed docs into Python, sorts in memory | Medium |
| file download/preview (`_file_response`) | `views.py:181` | whole file decrypted into RAM | **High** |
| scanner upload | `apps/documents/scanner.py:455` | malware+compress+OCR synchronous in request | **High** |
| founder analytics aggregates | `apps/founder/services.py:570–650` | recomputed from raw `ProductEvent` every request, no cache | Medium |
| founder beta-users list | `apps/founder/views.py:692` | 5 `Count(distinct=True)` annotations across joins per row | Medium |
| notification reminder sweep | `apps/notifications/services.py:1060` | iterates all active users; ~10–15 queries each | **High** (scale) |
| email send | `apps/notifications/services.py:315` | synchronous SMTP `.send()` | **High** (scale) |

**Notably *not* problems** (verified): the document serializer's 54
`SerializerMethodField`s all read from a cached `get_document_health()` /
`compute_confidence()` / `compute_last_safe_action()` and from queryset
annotations (`is_shared_ext`, `in_bundle_anno`, `in_emergency_anno`,
`file_count`) with `.exists()` fallbacks only when annotations are absent
(`serializers.py:376–397`). `_document_has_file` uses the `file_count`
annotation first (`services.py:98`). This is careful, correct work.

See PERF-001 … PERF-005.

---

## 9. Database / index findings

**Strength:** indexing is thorough. Counts of `models.Index` per app: documents
74, founder 46, organizations 39, quick_share 12, notifications 8, billing 8,
subscriptions 7, users 3. Hot composites already exist, e.g. `Document`:
`(owner, status)`, `(owner, expiry_date)`, `(owner, is_trashed)`;
`ProductEvent`: `(event_type, created_at)`, `(user, created_at)`,
`(event_source, created_at)`, `(created_at)`; share/room/quick-share tokens are
`unique=True, db_index=True`. 83 migrations applied; `manage.py check` clean.

**Gaps / recommendations:**

| Model | Suggested index | Helps | Risk if missing |
| --- | --- | --- | --- |
| `Document` | `(owner, is_trashed, is_pinned, -created_at)` | the default list ordering (`order_by("-is_pinned", "-created_at")` after `owner`+`is_trashed` filter) | extra sort on large vaults |
| `DocumentReminderRule` | a stored, indexed `next_run_at` (new field) | replace the per-user Python due-date computation in the reminder sweep (PERF-004) | linear-in-users cron cost |
| `DocumentFile` | `(document, is_trashed)` if not present | `files__is_trashed=False` count + `_document_has_file` | per-row counts on big vaults |
| `Notification` | `(user, status, created_at)` for unread-count + list | notification list/badge | scan as notifications grow |
| `ProductEvent` | partition or roll-up table by day (see PERF-005) | founder analytics aggregation | unbounded raw-event scans |

These are **migration-only** changes. Suggested migration names:
`documents/000X_document_list_ordering_index`,
`documents/000X_reminderrule_next_run_at`,
`notifications/000X_notification_user_status_index`.

The biggest *architectural* DB issue is not a missing index but that the
reminder engine doesn't have a queryable "due" column at all — it derives due
dates in Python from each document/subscription/bundle. See PERF-004.

---

## 10. File upload / download / storage findings

* **Files are loaded fully into memory, not streamed.** Upload:
  `encrypt_uploaded_file` does `plaintext = uploaded.read()`
  (`file_encryption.py:61`). Download/preview: `read_plaintext` does
  `ciphertext = fh.read()` then decrypts the whole blob and the view returns
  `FileResponse(io.BytesIO(plaintext))` (`views.py:190,208`). Bounded today only
  by the **10 MB** upload cap.
* **Encryption is AES-256-GCM envelope encryption, done in one shot.** Correct
  and secure, but whole-file. At 10 MB × concurrent downloads this is real RAM
  pressure on 3 gunicorn workers.
* **Delivery is correctly never via storage URLs** — files are always streamed
  through authenticated, ownership-checked views. This is the right security
  posture and must be preserved; it also means a naive CDN/signed-URL approach
  is *not* available for private documents.

Answers to the required questions:

1. **Streamed or fully loaded?** Fully loaded into memory (BytesIO).
2. **Encryption efficient?** Cryptographically yes; memory-wise no (whole file).
3. **Can large uploads exhaust memory?** Bounded at 10 MB/file today; if the cap
   is raised without chunked/streamed crypto, yes. Concurrency multiplies it.
4. **Can previews be cached?** Only **privately** and access-controlled — never
   in a shared/public cache (see § 13 unsafe list).
5. **Pre-generate thumbnails?** Yes, for image/PDF previews — as a background
   job, stored encrypted, served through the same authenticated path.
6. **OCR/compression in background?** **Yes — strongly recommended** (PERF-003).
7. **Serve through Django or signed URLs?** For private docs, keep streaming
   through Django but make it **chunked/streaming decryption**; do *not* expose
   storage URLs. For genuinely public, non-sensitive assets, a CDN is fine.
8. **Private object storage at scale?** Keep app-layer encryption + authenticated
   streaming; add a short-lived, single-use signed URL *only* if you move to
   range-streamed delivery and keep authorization in front of URL minting.
9. **Safe CDN options?** Cache static/marketing/app-shell/icons/og assets and
   hashed Next chunks at the CDN edge. Never private document bytes.
10. **What not to cache?** Decrypted document bytes, raw file responses,
    emergency-access detail, code-protected share responses, any user-scoped
    sensitive API response.

See PERF-002.

---

## 11. Scanner / OCR / PDF findings

The scanner upload (`apps/documents/scanner.py`, `ScannerUploadView`) does, **all
synchronously inside one HTTP request**:

1. `validate_uploaded_scan` (type/size) — cheap.
2. `scan_for_malware(data)` — ClamAV over a unix socket (when `CLAMD_ENABLED`).
3. `validate_pdf_structure` + `compress_pdf` (pypdf) — CPU.
4. `_maybe_run_ocr` → `pytesseract.image_to_string` / `pdf2image.convert_from_bytes`
   (shells out to **tesseract** and **poppler**) — **seconds** of CPU per file.

With `gunicorn --workers 3 --timeout 60` (Procfile), a handful of concurrent
scanner uploads doing OCR will **occupy all workers**, stall unrelated requests,
and risk the 60 s worker timeout on large/multi-page PDFs. This is the app's
single most expensive request. OCR, compression, and (ideally) malware scanning
belong in a background job; the upload should return quickly with a "processing"
status and the OCR result should arrive asynchronously.

See PERF-003.

---

## 12. Notifications / reminders / background jobs findings

* **No worker process exists.** `Procfile` defines only `web`. Scheduled
  commands (`process_due_notifications`, `purge_expired_trash`, key rotation,
  billing sync) must be invoked by an external scheduler (cron/Railway/Render
  scheduled job). This needs to be set up and documented before beta.
* **The reminder sweep does not scale.** `process_due_notifications`
  (`services.py:1060`) loops over **every active user** ordered by id, and for
  each calls `iter_due_candidates(user, now)` which fires ~10–15 separate
  queries (documents, reminder rules, subscriptions, bundles, checklists,
  checklist items, bundle requirements, org memberships, requests, submissions,
  campaigns, share links) — plus a per-document `doc.files.filter(...).exists()`
  N+1 (`services.py:484`). Cost is **O(total users)**, not O(due reminders). A
  global `limit=100` caps *evaluated candidates* but still iterates users until
  the limit trips, starving later users.
* **Email is synchronous SMTP** (`EmailMultiAlternatives.send(fail_silently=False)`,
  `services.py:315`), sent one at a time in the sweep loop. At 10k due emails ×
  ~200–400 ms each, a run takes tens of minutes single-threaded.

**Recommendation (post-beta):** introduce **Celery + Redis** (or RQ + Redis).

* `reminders.scan` (beat-scheduled, e.g. every 15 min) enqueues per-user or
  per-due-rule jobs based on an **indexed `next_run_at`** column, instead of
  sweeping all users.
* `email.send` and `push.send` as separate queues with retry + dead-letter.
* Idempotency is already handled by the `dedupe_key` mechanism — reuse it.
* Priority queues: security alerts > reminders > digests.

See PERF-003, PERF-004.

---

## 13. Caching opportunities

There is **no cache backend configured at all** (no `CACHES` in settings, no
Redis). Concrete, safe targets:

| Target | Key | TTL | Invalidate on | Privacy | Store |
| --- | --- | --- | --- | --- | --- |
| Pricing / plan catalog (`apps/users/plans.py`, billing plans) | `plans:v1` | 1 h | deploy / plan edit | public | Redis/app cache |
| Feature flags (`apps/features`) | `flags:all` | 60 s | flag write | public-ish | Redis |
| User entitlements (`apps/billing/entitlements.py`) | `entitlements:{user_id}` | 60 s | billing webhook, plan change | per-user | Redis |
| Dashboard summary counts | `dash:{user_id}` | 30–60 s | document/sub write | per-user | Redis |
| Notification unread count | `notif_unread:{user_id}` | 30 s | notification read/create | per-user | Redis |
| Founder analytics aggregates | `founder:agg:{range}` | 5–15 min | scheduled refresh | founder-only | Redis or roll-up table |
| Static / marketing / app-shell / Next hashed chunks | n/a | long, immutable | content hash | public | CDN edge |

**Unsafe to cache (must never enter a shared cache):** decrypted document bytes,
raw file responses, emergency-access details, share-code-protected responses,
any user-scoped sensitive API payload. Per-user entries above must be namespaced
by `user_id` and stored in a private cache, never a shared/CDN cache.

See PERF-008.

---

## 14. PWA / service worker performance notes

* The only service worker is `public/scanner-sw.js` (+ `src/lib/scanner/sw.ts`)
  — scoped to the scanner, not a full app-shell PWA.
* There is **no app manifest** for installability and **no app-shell caching**
  strategy, so repeat visits don't benefit from a cached shell.
* `next.config.ts` has **no `images` optimization config** and no
  `experimental.optimizePackageImports` for icon libraries (`lucide-react`,
  `simple-icons`) — worth enabling so only used icons ship.

This is fine for beta. For "flash-speed" repeat visits, add an app-shell SW and
a manifest later (Low priority). See PERF-013.

---

## 15. Founder analytics performance notes

`apps/founder/services.py` computes time series and breakdowns **directly from
the raw `ProductEvent` table on every request** using `TruncDate` + `Count`
(`services.py:570–650`) and `aggregate(Min(...))` over the whole table for the
date floor (`services.py:619–620`). `ProductEvent` is the fastest-growing table
in the system (one row per UI/product event) and is well-indexed, but:

* Per-request `TruncDate`/`Count`/`Min` over a growing event table gets slower
  linearly and competes with write traffic.
* The beta-users list adds 5 `Count(distinct=True)` join-annotations per row
  (`views.py:692`) — heavy as users/documents grow.

**Recommendation:** roll events up into a daily aggregate table (or materialized
view) via a scheduled job, and serve dashboards from the roll-up with a short
cache. Keep raw events for drill-down only. See PERF-005.

---

## 16. Billing / webhook performance notes

`apps/billing/views.py` `WebhookView.post` verifies the signature in the
provider adapter and calls `services.handle_webhook(payload, sig)`
**synchronously** in the request. This is standard and fine at low volume, but:

* Webhook side effects (entitlement updates, emails) run inline; a burst of
  provider retries can pile up on the 3 web workers.
* Recommendation (Growth stage): acknowledge the webhook fast (2xx after
  signature verify + persist raw event) and process side effects in a worker,
  with idempotency on the provider event id. Low/Medium priority until paid
  volume is real. See PERF-009.

---

## 17. Load-testing plan

Tooling: **k6** (skeletons provided in `tools/performance/`). Local/staging
only; never production; never destructive volumes on shared hardware.

**Data setup (staging):** seed a dedicated test user with **10 / 100 / 1,000 /
10,000** documents (a management command or factory), plus a code-protected
Quick Share link and a sample small PDF. Use throwaway accounts only.

**Scenarios → script:**

| # | Scenario | Script | Budget |
| --- | --- | --- | --- |
| 1 | login / refresh | (add) | p95 < 200 ms |
| 2 | dashboard load (fan-out) | `k6-dashboard.js` | each p95 < 300 ms |
| 3 | document list @ 10/100/1k/10k | `k6-vault-list.js` (`PAGE_SIZE`, seed sizes) | p95 < 200 ms |
| 4 | vault upload | (extend scanner script) | bounded memory |
| 5 | file preview | `k6-file-download.js` (preview path) | streamed |
| 6 | file download | `k6-file-download.js` | streamed, no RAM spike |
| 7 | public SafeSend metadata/preview | `k6-public-share.js` | metadata p95 < 150 ms |
| 8 | emergency metadata/item preview | (add, token-gated) | p95 < 200 ms |
| 9 | organization document list | (add) | paginated |
| 10 | notification list | `k6-dashboard.js` (notifications) | p95 < 200 ms |
| 11 | subscription dashboard | `k6-dashboard.js` (subscriptions) | p95 < 300 ms |
| 12 | founder analytics | (add, founder cookie) | p95 < 500 ms |
| 13 | billing webhook burst | (add, signed payloads) | fast 2xx |
| 14 | scanner upload | `k6-scanner-upload.js` | **keep VUs ≤ 3** |
| 15 | PWA asset load | static GETs of `/_next/static/...` | edge-cached |

**Concurrency stages:** 10 → 50 → 100 → 500 → 1,000 VUs, **staging only**, and
do not push scanner-upload past a handful of VUs (OCR will saturate workers —
that's the point of the test, but observe, don't melt the box).

**Metrics to collect:** `http_req_duration` p50/p95/p99, `http_req_failed`
rate, req/s; server-side: gunicorn worker saturation, DB query count/time
(Django Debug Toolbar or Silk locally; `EXPLAIN ANALYZE` on Postgres), RSS
during file downloads and scanner OCR.

---

## 18. Recommended benchmark scripts

Created under `tools/performance/` (safe templates, env-driven, no secrets):

* `_common.js` — shared base URL / auth-cookie / CSRF / options helpers.
* `k6-dashboard.js` — authenticated dashboard fan-out.
* `k6-vault-list.js` — paginated list across seeded account sizes (PERF-001).
* `k6-public-share.js` — anonymous public share metadata.
* `k6-file-download.js` — encrypted download (watch RAM; PERF-002).
* `k6-scanner-upload.js` — scanner upload (low VUs; PERF-003).
* `README.md` — env vars, how to capture a test auth cookie, how to run.

Not run in this audit (no seeded staging environment available here; see § 25).

---

## 19. Million-user scaling path

Honest assessment: **CertaNest cannot serve millions of users today**, primarily
because of the missing async/cache layer and the in-request file/OCR work — not
because of the data model, which is sound. Staged path:

**Stage A — Private beta (1–100 users).** Managed PostgreSQL, object storage
(S3/R2, already supported), email provider, an external scheduler for the
management commands, basic backups + uptime check. Fix PERF-001, bound PERF-003.

**Stage B — Early launch (100–1,000).** Redis + a worker (Celery/RQ). Move OCR,
PDF compression, email, and push to queues. Add the `next_run_at` reminder
index and switch the sweep to query due rules. Add Sentry + slow-query logging +
CDN for static assets. Add the missing composite indexes (§ 9).

**Stage C — Growth (1,000–10,000).** Caching layer (entitlements, dashboard,
flags, founder roll-ups). Worker autoscaling, queue priorities, DB connection
pooling (PgBouncer), read replica if read-heavy, structured logs, job dashboard,
storage-cost monitoring, API rate limits beyond the current throttles.

**Stage D — Serious SaaS (10,000–100,000).** Horizontal web scaling behind a LB,
CDN strategy, queue partitioning, fully async file processing + streamed
chunked decryption, robust observability + on-call, DB tuning, partition the
`ProductEvent` / notification-delivery / access-log tables by time.

**Stage E — Massive scale (100,000–1M+).** Multi-region static frontend, a
dedicated analytics pipeline / event stream separate from the OLTP DB, storage
lifecycle policies, advanced edge caching, tenant-isolation review, external
pentest + performance testing, cost optimization, compliance review.

---

## 20. Prioritized remediation roadmap

**Critical** — none that break a *small* beta, but these are the first to bite:

* PERF-001 unbounded list materialization (breaks large accounts).
* PERF-003 synchronous OCR/scan saturates the 3-worker pool under light concurrency.

**High**

* PERF-002 whole-file in-memory decryption.
* PERF-004 reminder sweep is O(total users) + N+1 + serial SMTP.
* PERF-006 client-rendered + fetch-after-hydration frontend (perceived speed).
* PERF-010 no worker/queue infrastructure; PERF-011 no scheduler wired up.

**Medium**

* PERF-005 founder analytics recomputed from raw events.
* PERF-007 zero `next/dynamic`, large client page modules.
* PERF-008 no caching of stable/per-user-summary data.
* PERF-012 founder beta-users multi-Count list.

**Low / Informational**

* PERF-009 synchronous billing webhook side effects.
* PERF-013 partial PWA / no app-shell, no image/icon import optimization.
* PERF-014 missing composite indexes (quick win).
* PERF-015 `attention_needed` in-memory load+sort.

---

## 21. Quick wins (small, safe, high value)

1. **Add the composite indexes in § 9** — migration-only, no logic change
   (PERF-014).
2. **Cap `attention_needed`** to the active, non-archived set with a DB-side
   `LIMIT` after sorting on indexable fields where possible (PERF-015).
3. **Add `experimental.optimizePackageImports: ["lucide-react", "simple-icons"]`**
   and an `images` config in `next.config.ts` so only used icons ship.
4. **Configure a local `LocMemCache` and cache the plan catalog + feature flags**
   (public, safe) — immediate win, no Redis needed for beta.
5. **`next/dynamic` the founder choropleth, scanner UI, and QR generator** to
   trim their route bundles' first paint (PERF-007).
6. **Add skeleton-on-server** (a server component shell with `loading.tsx`) for
   the heaviest dashboard routes so something paints before hydration+fetch.

## 22. Must-fix before private staging

* **PERF-001:** stop `list(queryset)` materializing the whole vault; push the
  health filters into the DB (annotate computed status) or paginate the queryset
  *before* the Python pass.
* **PERF-003:** bound the scanner — cap OCR pages/time hard, and/or move OCR +
  compression off the request (even a simple thread/`process_due`-style command
  is better than inline). At minimum, document the worker saturation risk.
* **PERF-011:** stand up an external scheduler to run
  `process_due_notifications` and `purge_expired_trash`.
* Managed PostgreSQL + object storage + real email provider configured.

## 23. Must-fix before closed beta

* **PERF-002:** stream encrypted downloads (chunked decryption) instead of
  loading whole files into RAM, or keep the 10 MB cap and document the limit.
* **PERF-004:** add `next_run_at` to reminder-bearing models and query due rows
  instead of sweeping all users; fix the `doc.files.exists()` N+1.
* **PERF-008:** cache plan catalog, feature flags, entitlements.
* Add Sentry + slow-query logging.

## 24. Must-fix before public launch

* **PERF-010:** Redis + worker queue for OCR, compression, email, push, webhook
  side effects, with retry + dead-letter.
* **PERF-005:** founder analytics roll-up table + cache.
* **PERF-006/007:** selective server rendering / streaming for top dashboard
  routes; dynamic-import heavy widgets.
* CDN for static assets; DB connection pooling; documented load-test results at
  500–1,000 VUs on staging.

---

## 25. Recommended tests / benchmarks to add

* **Query-count regression tests** using `assertNumQueries` around
  `DocumentViewSet.list`, `attention_needed`, the founder beta-users list, and
  `iter_due_candidates` — these lock in the no-N+1 behavior and would have
  flagged PERF-004's per-document `exists()`.
* **A seeding management command** (`seed_perf_account --documents N`) to create
  10/100/1k/10k-document accounts for the k6 vault-list runs.
* **A memory assertion / smoke test** on the download path to detect if a future
  change reads larger files fully into RAM (guards PERF-002).
* **k6 runs** per § 17 on staging, recording p95 against the budgets in § 26.
* **Bundle-size budget check** in CI (fail if first-load JS for `/dashboard`
  regresses past a threshold).

## 26. Final checklist

Performance target budgets (recommended):

* [ ] Landing page feels instant (mostly static; cache + CDN).
* [ ] Dashboard shows a skeleton **before** hydration/fetch.
* [ ] Common authenticated API p95 **< 200 ms** at realistic account sizes.
* [ ] Dashboard summary p95 **< 300 ms**.
* [ ] Document list paginated and **stable at 1k+ documents** (PERF-001 fixed).
* [ ] Public share metadata p95 **< 150 ms**.
* [ ] File preview/download **streamed**, no per-request whole-file RAM load.
* [ ] Heavy scanner libs load **only** on the scanner route (already true ✅).
* [ ] OCR / compression / email / push run in **background jobs**.
* [ ] Hot queries indexed (mostly true ✅; add § 9 composites).
* [ ] Analytics served from **aggregates**, not raw-event recomputation.
* [ ] Logs/events tables designed for growth (partition plan documented).

---

# Findings

## PERF-001: Document list materializes the entire vault into memory before pagination

* **Severity:** High (Critical for large accounts)
* **Area:** Backend / DRF list endpoint
* **Affected files:** `apps/documents/views.py:401-410` (`list`),
  `:359-399` (`_apply_health_filters`)
* **Description:** `list()` calls `self._apply_health_filters(list(queryset))`,
  which forces evaluation of the **entire** owner-scoped, annotated, prefetched
  queryset into a Python list, runs a Python loop computing health per document,
  and only then paginates the resulting Python list. DRF pagination thus limits
  the *response* but not the work: every list request loads and prepares the
  user's whole vault.
* **Evidence:**
  ```python
  def list(self, request, *args, **kwargs):
      queryset = self.filter_queryset(self.get_queryset())
      documents = self._apply_health_filters(list(queryset))   # full materialization
      page = self.paginate_queryset(documents)                 # paginates a Python list
  ```
  The queryset also `prefetch_related("tags", "reminder_rules", "proof_records")`,
  so all related rows for the whole vault are fetched too.
* **Impact:** Memory + latency grow linearly with vault size. A 10k-document
  account makes every list call load 10k Document objects + all their tags /
  reminder rules / proof records, regardless of page. Multiply by concurrency.
* **Likelihood:** High once power users exist.
* **Recommended fix:** Move the health filters into the queryset (the data —
  expiry/renewal dates, `file_count`, status — is already available to express
  `computed_status` as DB annotations/`Case`), then paginate the **queryset**
  (not a Python list). If a Python pass must remain, apply it after slicing to
  the page window, or pre-filter by the indexed columns first.
* **Suggested benchmark/test:** `tools/performance/k6-vault-list.js` against
  10/100/1k/10k-doc accounts; add an `assertNumQueries` + timing test on `list`.
* **Effort:** M (logic change; preserve filter semantics + tests).
* **Should fix before:** private staging.

## PERF-002: Encrypted files are fully decrypted into RAM before streaming

* **Severity:** High
* **Area:** Backend / file delivery + encryption
* **Affected files:** `apps/documents/file_encryption.py:57-103`
  (`encrypt_uploaded_file`, `read_plaintext`), `apps/documents/views.py:181-215`
  (`_file_response`)
* **Description:** Uploads are `uploaded.read()` whole; downloads/previews read
  the whole ciphertext, decrypt the whole blob, and return
  `FileResponse(io.BytesIO(plaintext))`. No streaming/chunking.
* **Evidence:**
  ```python
  plaintext = uploaded.read()                 # file_encryption.py:61
  with instance.file.open("rb") as fh:
      ciphertext = fh.read()                  # file_encryption.py:86
  return encryption.decrypt_bytes(ciphertext, ...)
  response = FileResponse(io.BytesIO(plaintext), ...)   # views.py:208
  ```
* **Impact:** Per-request RAM = full file size. Bounded today by the 10 MB
  upload cap, but concurrent downloads on 3 workers still multiply it, and any
  future cap increase scales RAM linearly.
* **Likelihood:** Medium now, High if the size cap is raised.
* **Recommended fix:** Stream chunked AES-GCM decryption to the response
  (decrypt in fixed-size blocks). Keep authenticated, ownership-checked,
  through-Django delivery — do **not** switch private docs to storage/CDN URLs.
* **Suggested benchmark/test:** `k6-file-download.js` while monitoring worker
  RSS; a regression test asserting the path does not read the whole file.
* **Effort:** M–L (crypto streaming must preserve GCM auth semantics).
* **Should fix before:** closed beta.

## PERF-003: Scanner upload runs malware scan + PDF compression + OCR synchronously in the request

* **Severity:** High (Critical for worker pool)
* **Area:** Backend / scanner
* **Affected files:** `apps/documents/scanner.py:455-512` (`ScannerUploadView`),
  `:154-192` (`scan_for_malware`), `:240-330` (OCR), `Procfile`
* **Description:** A single scanner upload blocks a gunicorn worker through
  ClamAV scan, `compress_pdf`, and `pytesseract`/`pdf2image` OCR (shelling out to
  tesseract + poppler — seconds per file). With `--workers 3 --timeout 60`, a
  few concurrent scans saturate the whole pool and can hit the worker timeout.
* **Evidence:**
  ```python
  scan_for_malware(data)
  data = compress_pdf(data)
  ocr_stored = _maybe_run_ocr(request.user, instance, data, content_type)
  ```
  ```
  web: gunicorn config.wsgi:application ... --workers 3 --timeout 60
  ```
* **Impact:** App-wide stalls under light scanner concurrency; risk of 60 s
  timeouts on multi-page PDFs.
* **Likelihood:** High once scanner is used concurrently.
* **Recommended fix (post-beta):** move OCR + compression (and ideally malware
  scan) to a background worker; return a fast "processing" response and surface
  OCR results asynchronously. **Before beta (interim):** hard-cap OCR pages and
  the `pytesseract` timeout, and keep `scanner_upload` throttle tight (already
  30/min/user).
* **Suggested benchmark/test:** `k6-scanner-upload.js` at 3–5 VUs while watching
  worker saturation and a control endpoint's latency.
* **Effort:** S (interim caps) / L (full async).
* **Should fix before:** private staging (bound it) / public launch (async).

## PERF-004: Reminder sweep iterates every active user (O(users)), with N+1 and serial SMTP

* **Severity:** High (scale)
* **Area:** Backend / notifications + reminders
* **Affected files:** `apps/notifications/services.py:1060-1134`
  (`process_due_notifications`), `:405-484+` (`iter_due_candidates`), `:291-315`
  (`send_notification_email`)
* **Description:** The sweep loops over all active users and runs ~10–15 queries
  per user to derive due dates in Python (no stored due column), including a
  per-document `doc.files.filter(is_trashed=False).exists()` N+1. Email is sent
  synchronously over SMTP, one at a time, in the loop. Cost scales with total
  users, not due reminders; the `limit` caps evaluated candidates but starves
  users after the cap.
* **Evidence:**
  ```python
  users = get_user_model().objects.filter(is_active=True).order_by("id")
  for user in users:
      for candidate in iter_due_candidates(user, now):
          ...
          result = deliver_notification(notification, now=now)  # sync SMTP inside
  # services.py:484
  if not doc.files.filter(is_trashed=False).exists():           # N+1 per document
  ```
* **Impact:** A run's duration grows with user count even when few reminders are
  due; serial SMTP makes large runs take tens of minutes.
* **Likelihood:** High at Growth stage.
* **Recommended fix:** add an indexed `next_run_at` to reminder-bearing models,
  query only due rows, enqueue per-due jobs to a worker, and send email via a
  dedicated queue with retry/dead-letter. Reuse the existing `dedupe_key` for
  idempotency. Fix the per-doc `exists()` via prefetch/annotation.
* **Suggested benchmark/test:** time a sweep against 1k/10k seeded users with a
  fixed number of due reminders; `assertNumQueries` around `iter_due_candidates`.
* **Effort:** M–L.
* **Should fix before:** closed beta (index + query change) / public launch (queue).

## PERF-005: Founder analytics recomputed from the raw ProductEvent table on every request

* **Severity:** Medium
* **Area:** Backend / founder analytics
* **Affected files:** `apps/founder/services.py:570-650`, `apps/founder/views.py:692-757`
* **Description:** Time series/breakdowns run `TruncDate`+`Count` and
  `aggregate(Min(...))` over the growing `ProductEvent` table per request; the
  beta-users list adds 5 `Count(distinct=True)` join-annotations per row. No cache.
* **Evidence:** `services.py:634-638` (`TruncDate`/`Count`), `:619-620`
  (`Min(created_at)` over all events), `views.py:692-708` (5 counts).
* **Impact:** Founder dashboards slow linearly with event/user growth and
  compete with write traffic.
* **Likelihood:** Medium (founder-only traffic, but unbounded table).
* **Recommended fix:** scheduled daily roll-up table/materialized view + short
  cache; serve dashboards from the roll-up, keep raw events for drill-down.
* **Suggested benchmark/test:** seed 1M `ProductEvent` rows on staging; measure
  analytics endpoint p95 before/after roll-up.
* **Effort:** M.
* **Should fix before:** public launch.

## PERF-006: Frontend is ~82% client components with client-side fetch-after-hydration

* **Severity:** High (perceived performance)
* **Area:** Frontend / rendering strategy
* **Affected files:** 79 of 96 `page.tsx` files; `src/lib/api.ts`;
  `src/app/(dashboard)/dashboard/*`
* **Description:** Most dashboard pages are `"use client"` and fetch data via
  `apiFetch` after the bundle loads and hydrates, producing a
  HTML→JS→hydrate→fetch→paint waterfall.
* **Evidence:** `grep -rl "use client" src/app --include=page.tsx` → 79/96;
  `src/lib/api.ts` is a client `fetch` wrapper; dashboard pages use
  `useEffect`+`apiFetch`.
* **Impact:** Slow time-to-content and poor perceived speed, especially on
  slow networks / mid-range mobile.
* **Likelihood:** Affects every user, every visit.
* **Recommended fix:** server-render the shell + initial data for top routes
  (dashboard, documents) with `loading.tsx` skeletons and streaming; keep
  interactive bits client-side. Implement against Next 16 docs in
  `node_modules/next/dist/docs/`.
* **Suggested benchmark/test:** Lighthouse on `/dashboard` before/after; CI
  first-load-JS budget.
* **Effort:** M–L (incremental, route by route).
* **Should fix before:** public launch (top routes); quick skeleton win earlier.

## PERF-007: Zero `next/dynamic`; large client page modules ship whole

* **Severity:** Medium
* **Area:** Frontend / bundling
* **Affected files:** whole `src/`; `documents/page.tsx` (982 LOC),
  `vault/page.tsx` (653), `dashboard/page.tsx` (554),
  `src/components/founder/world-choropleth.tsx`, scanner UI, `qrcode` usage
* **Description:** No `next/dynamic` anywhere; only 4 files use `lazy`/`Suspense`.
  Heavy in-page widgets load with their route bundle's first paint.
* **Evidence:** `grep -rn "next/dynamic\|dynamic("` → 0; total static JS 4.3 MB
  / 118 chunks (jsPDF and world-atlas already split ✅).
* **Impact:** Larger first paint on the scanner and founder routes than necessary.
* **Likelihood:** Medium.
* **Recommended fix:** `next/dynamic` (ssr:false where appropriate) for the
  choropleth, scanner capture UI, and QR generation; split the largest page
  modules.
* **Effort:** S–M.
* **Should fix before:** public launch.

## PERF-008: No caching layer for stable or per-user-summary data

* **Severity:** Medium
* **Area:** Backend / caching
* **Affected files:** `config/settings/base.py` (no `CACHES`), billing
  entitlements, features flags, plan catalog, dashboard summary
* **Description:** No cache backend is configured. Plans, feature flags,
  entitlements, dashboard counts, and unread counts are recomputed per request.
* **Evidence:** no `CACHES` in settings; no Redis in `requirements.txt`.
* **Impact:** Avoidable DB load and latency on hot, stable reads.
* **Recommended fix:** start with `LocMemCache` for public/stable data (plans,
  flags) at beta; add Redis for per-user summaries at Growth. Respect the
  unsafe-cache list in § 13.
* **Effort:** S (public data) / M (per-user with invalidation).
* **Should fix before:** closed beta (public data) / public launch (per-user).

## PERF-009: Billing webhook side effects run synchronously in the request

* **Severity:** Low
* **Area:** Backend / billing
* **Affected files:** `apps/billing/views.py:210-236` (`WebhookView.post`,
  `services.handle_webhook`)
* **Description:** Signature verification + all side effects run inline; provider
  retry bursts can pile up on web workers.
* **Recommended fix:** verify + persist raw event, return 2xx fast, process side
  effects in a worker with idempotency on provider event id.
* **Effort:** S–M.
* **Should fix before:** later (when paid volume is real).

## PERF-010: No background job / queue infrastructure

* **Severity:** High
* **Area:** Infrastructure
* **Affected files:** `requirements.txt`, `Procfile` (only `web`),
  `config/settings/*`
* **Description:** No Celery/RQ/Redis. Everything slow is in-request or in a
  single-process command. This is the root enabler of PERF-003/004/005/009.
* **Recommended fix:** Celery + Redis (or RQ + Redis); a `worker` (and `beat`)
  process in the Procfile; queues for `ocr`, `email`, `push`, `analytics`,
  `webhook`, with retry + dead-letter and a monitoring dashboard.
* **Effort:** M.
* **Should fix before:** public launch (foundational for B/C stages).

## PERF-011: Scheduled commands are not wired to a scheduler

* **Severity:** High (operational)
* **Area:** Infrastructure / reminders
* **Affected files:** `Procfile`, `apps/notifications/management/commands/process_due_notifications.py`, `apps/documents/management/commands/purge_expired_trash.py`
* **Description:** Reminders/trash purge exist only as management commands; the
  Procfile has no scheduler. Without an external cron/scheduled job, reminders
  never fire.
* **Recommended fix:** configure the platform scheduler (Railway/Render cron or
  Celery beat) to run `process_due_notifications` (e.g. every 15 min) and
  `purge_expired_trash` (daily); document in `docs/DEPLOYMENT.md`.
* **Effort:** S.
* **Should fix before:** private staging.

## PERF-012: Founder beta-users list uses 5 cross-join Count annotations per row

* **Severity:** Medium
* **Area:** Backend / founder
* **Affected files:** `apps/founder/views.py:692-757`
* **Description:** Each row annotates document/file/reminder/bundle/feedback
  counts with `Count(..., distinct=True)` across joins — expensive as data grows.
* **Recommended fix:** denormalized counters refreshed by a job, or a roll-up;
  paginate (already) and cache.
* **Effort:** S–M.
* **Should fix before:** public launch.

## PERF-013: Partial PWA; no app-shell cache, no image/icon import optimization

* **Severity:** Low
* **Area:** Frontend / PWA / assets
* **Affected files:** `public/scanner-sw.js`, `src/lib/scanner/sw.ts`,
  `next.config.ts`
* **Description:** Only a scanner-scoped SW exists; no manifest/app-shell; no
  `images` config or `optimizePackageImports` for `lucide-react`/`simple-icons`.
* **Recommended fix:** add `optimizePackageImports` + `images` config (quick);
  add an app-shell SW + manifest later for fast repeat visits.
* **Effort:** S (config) / M (full PWA).
* **Should fix before:** later.

## PERF-014: Missing composite indexes for hot ordering/lookup paths (quick win)

* **Severity:** Low (Informational, but cheap and valuable)
* **Area:** Database
* **Affected files:** `apps/documents/models.py` (Document, DocumentFile),
  `apps/notifications/models.py`
* **Description:** See § 9. The default list ordering
  (`-is_pinned, -created_at` after `owner`+`is_trashed`) and notification
  unread/list paths lack ideal composite indexes.
* **Recommended fix:** add the indexes in § 9 (migration-only).
* **Effort:** S.
* **Should fix before:** closed beta.
* **Note:** Not applied in this audit branch (audit-only); it is a safe,
  isolated migration to land in the optimization branch.

## PERF-015: `attention_needed` loads and sorts all non-trashed docs in memory

* **Severity:** Low
* **Area:** Backend / documents
* **Affected files:** `apps/documents/views.py:507-528`
* **Description:** Builds `list(...)` of all non-trashed, non-archived docs,
  computes health per doc, sorts in Python, serializes — no pagination.
* **Recommended fix:** express attention via DB annotations and paginate/limit;
  share the fix with PERF-001.
* **Effort:** S–M.
* **Should fix before:** public launch.
