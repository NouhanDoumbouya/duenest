// Shared helpers for the CertaNest k6 skeletons. No secrets are hardcoded — every
// value comes from the environment (see tools/performance/README.md).
import { check } from "k6";

export const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const API = `${BASE_URL}/api/v1`;

export const VUS = Number(__ENV.VUS || 10);
export const DURATION = __ENV.DURATION || "30s";

// Cookie-based auth: paste a logged-in TEST session's Cookie header into
// AUTH_COOKIE. CSRF_TOKEN is only needed for unsafe methods (POST/upload).
export function authHeaders(extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  if (__ENV.AUTH_COOKIE) headers.Cookie = __ENV.AUTH_COOKIE;
  return headers;
}

export function csrfHeaders(extra = {}) {
  const headers = authHeaders(extra);
  if (__ENV.CSRF_TOKEN) headers["X-CSRFToken"] = __ENV.CSRF_TOKEN;
  return headers;
}

export const baseOptions = {
  // Conservative default. Override with --vus / --stage on staging only.
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"], // loose ceiling; tighten per scenario
  },
};

export function ok(res, name) {
  check(res, { [`${name}: 2xx`]: (r) => r.status >= 200 && r.status < 300 });
}
