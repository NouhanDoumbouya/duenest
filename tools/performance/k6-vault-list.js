// Scenario: paginated document/vault list. Run this against seeded accounts of
// 10 / 100 / 1,000 / 10,000 documents to expose the list() full-materialization
// cost (see PERF-001). Budget: p95 < 200 ms at realistic sizes.
import http from "k6/http";
import { sleep } from "k6";
import { API, authHeaders, baseOptions, ok } from "./_common.js";

export const options = baseOptions;
const PAGE_SIZE = __ENV.PAGE_SIZE || "20";

export default function () {
  // Plain list (page 1).
  ok(http.get(`${API}/documents/?page=1&page_size=${PAGE_SIZE}`, { headers: authHeaders() }), "vault:list");
  // List with a health filter — forces the Python-side _apply_health_filters
  // pass over the whole materialized queryset.
  ok(http.get(`${API}/documents/?needs_attention=true&page=1`, { headers: authHeaders() }), "vault:needs_attention");
  // Search — exercises the multi-field icontains OR query.
  ok(http.get(`${API}/documents/?search=passport&page=1`, { headers: authHeaders() }), "vault:search");
  sleep(1);
}
