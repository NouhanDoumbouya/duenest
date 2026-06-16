// Scenario: realistic MIXED traffic against a seeded staging account. Combines
// the individual scenarios in one run with a weighted blend that roughly mirrors
// real usage (lots of reads, fewer uploads). Staging only — never production.
//
// Seed the target account first, e.g.:
//   python manage.py seed_perf_account --user-email tester@example.com --documents 1000
//
// Run (staging only; climb VUs deliberately):
//   k6 run --vus 20 --duration 1m tools/performance/k6-mixed-traffic.js
import http from "k6/http";
import { group, sleep } from "k6";
import { API, authHeaders, ok } from "./_common.js";

const SHARE_TOKEN = __ENV.TEST_SHARE_TOKEN || "";
const FILE_ID = __ENV.TEST_FILE_ID || "";

export const options = {
  scenarios: {
    mixed: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP || "20s", target: Number(__ENV.VUS || 20) },
        { duration: __ENV.HOLD || "40s", target: Number(__ENV.VUS || 20) },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "http_req_duration{kind:read}": ["p(95)<400"],
    "http_req_duration{kind:public}": ["p(95)<300"],
  },
};

export default function () {
  // ~70% dashboard/list reads
  group("reads", () => {
    ok(
      http.get(`${API}/documents/?page=1`, {
        headers: authHeaders(),
        tags: { kind: "read" },
      }),
      "mixed:list",
    );
    ok(
      http.get(`${API}/documents/attention-needed/`, {
        headers: authHeaders(),
        tags: { kind: "read" },
      }),
      "mixed:attention",
    );
    ok(
      http.get(`${API}/notifications/?page=1`, {
        headers: authHeaders(),
        tags: { kind: "read" },
      }),
      "mixed:notifications",
    );
  });

  // ~20% public share metadata (anonymous), if a token is provided
  if (SHARE_TOKEN) {
    group("public", () => {
      ok(
        http.get(`${API}/quick-share/${SHARE_TOKEN}/`, {
          headers: { Accept: "application/json" },
          tags: { kind: "public" },
        }),
        "mixed:share",
      );
    });
  }

  // ~10% file download (heavier), if a file id is provided
  if (FILE_ID && Math.random() < 0.1) {
    group("download", () => {
      ok(
        http.get(`${API}/documents/files/${FILE_ID}/download/`, {
          headers: authHeaders(),
          tags: { kind: "download" },
        }),
        "mixed:download",
      );
    });
  }

  sleep(1);
}
