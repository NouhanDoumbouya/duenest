# DueNest performance / load-test harness

Safe, **local/staging-only** load-test skeletons for the DueNest API. These are
[k6](https://k6.io/) scripts. They are templates: they read all targets and
credentials from environment variables and never hardcode secrets, tokens, or
document IDs.

> **Do not run these against production.** Do not run high-concurrency stages
> against a machine that cannot absorb the load. Start at 10 VUs and climb only
> on a disposable staging environment with seeded test data.

## Prerequisites

```bash
# Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/)
# macOS:    brew install k6
# Debian:   sudo apt-get install k6   (after adding the k6 apt repo)
```

## Environment variables

| Variable            | Used by                         | Notes                                                      |
| ------------------- | ------------------------------- | ---------------------------------------------------------- |
| `BASE_URL`          | all                             | e.g. `http://127.0.0.1:8000` (Django) — no trailing slash. |
| `AUTH_COOKIE`       | authenticated scripts           | Full `Cookie:` header value from a logged-in test session. |
| `CSRF_TOKEN`        | authenticated POST/upload       | Value of the readable `duenest_csrftoken` cookie.          |
| `TEST_SHARE_TOKEN`  | `k6-public-share.js`            | A Quick Share / SafeSend session token (test data only).   |
| `TEST_SHARE_CODE`   | `k6-public-share.js`            | The matching access code, if the link is code-protected.   |
| `TEST_FILE_ID`      | `k6-file-download.js`           | A `DocumentFile` id owned by the auth'd test user.         |
| `SAMPLE_PDF_PATH`   | `k6-scanner-upload.js`          | Path to a small, safe test PDF on disk.                    |
| `VUS`               | all                             | Virtual users (default 10).                                |
| `DURATION`          | all                             | Test duration (default `30s`).                             |

### Seeding a large test account

Use the management command (test/staging DB only — it refuses to run in a
production-like environment without `--i-understand-production`):

```bash
python manage.py seed_perf_account --user-email tester@example.com --documents 1000
python manage.py seed_perf_account --user-email tester@example.com --documents 10000 \
    --with-files --with-notifications --with-subscriptions
python manage.py seed_perf_account --user-email tester@example.com --documents 1000 --dry-run
```

All generated rows are tagged `[PERFTEST]` so they are easy to find and delete.
The most informative run is `k6-vault-list.js` against accounts seeded at
10 / 100 / 1,000 / 10,000 documents, and `k6-mixed-traffic.js` for a blended
read/upload load.

### Getting an auth cookie for a test account (staging)

DueNest uses HttpOnly cookie auth. The simplest safe way to capture a session
for load testing is to log in with a **dedicated throwaway staging account** in
a browser, then copy the `Cookie` request header from DevTools → Network into
`AUTH_COOKIE`. Never use a real user's session.

## Running

```bash
export BASE_URL="http://127.0.0.1:8000"
export AUTH_COOKIE="duenest_access=...; duenest_refresh=...; duenest_csrftoken=..."
export CSRF_TOKEN="..."

# Suggested concurrency stages: 10 -> 50 -> 100 -> 500 -> 1000 VUs,
# but only on staging hardware that can take it.
k6 run --vus 10 --duration 30s tools/performance/k6-dashboard.js
k6 run --vus 10 --duration 30s tools/performance/k6-vault-list.js
k6 run --vus 10 --duration 30s tools/performance/k6-public-share.js
k6 run --vus 5  --duration 30s tools/performance/k6-file-download.js
k6 run --vus 5  --duration 30s tools/performance/k6-scanner-upload.js
```

## What to measure

For each scenario, record `http_req_duration` p50 / p95 / p99, error rate, and
throughput (req/s). Compare against the budgets in
`docs/performance/flash-speed-scalability-audit.md` (§ Performance targets):

* Common authenticated API: **p95 < 200 ms** at realistic account sizes.
* Dashboard summary: **p95 < 300 ms**.
* Public share metadata: **p95 < 150 ms**.
* Document list: stable and paginated at 1k+ documents.

The most important scaling experiment is **`k6-vault-list.js` against seeded
accounts holding 10 / 100 / 1,000 / 10,000 documents** — that is where the
`list()` full-materialization behavior (see finding PERF-001) shows up.
