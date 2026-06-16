// Scenario: authenticated dashboard load (the bundle of calls the dashboard
// landing page fires after hydration). Budget: each call p95 < 300 ms.
import http from "k6/http";
import { sleep } from "k6";
import { API, authHeaders, baseOptions, ok } from "./_common.js";

export const options = baseOptions;

export default function () {
  // Mirror the real dashboard fan-out: summary + first page of documents +
  // notifications + subscriptions. Adjust paths to match docs/api-spec.md.
  const reqs = {
    documents: { method: "GET", url: `${API}/documents/?page=1`, params: { headers: authHeaders() } },
    attention: { method: "GET", url: `${API}/documents/attention-needed/`, params: { headers: authHeaders() } },
    notifications: { method: "GET", url: `${API}/notifications/?page=1`, params: { headers: authHeaders() } },
    subscriptions: { method: "GET", url: `${API}/subscriptions/?page=1`, params: { headers: authHeaders() } },
  };
  const res = http.batch(reqs);
  for (const key of Object.keys(reqs)) ok(res[key], `dashboard:${key}`);
  sleep(1);
}
