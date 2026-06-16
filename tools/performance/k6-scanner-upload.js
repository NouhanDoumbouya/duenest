// Scenario: scanner upload. This is the most expensive request in the app —
// it runs malware scan + PDF compression + synchronous OCR inside the request
// (see PERF-003). Keep VUs very low; a handful of concurrent OCR uploads can
// saturate all gunicorn workers. Budget: should be moved to a background job.
import http from "k6/http";
import { sleep } from "k6";
import { open } from "k6/experimental/fs"; // or use the classic open() at init
import { API, csrfHeaders, baseOptions, ok } from "./_common.js";

// Load a small, safe sample PDF at init time (NOT a real user's document).
const SAMPLE = open(__ENV.SAMPLE_PDF_PATH || "./sample.pdf", "b");

export const options = {
  ...baseOptions,
  vus: Number(__ENV.VUS || 3),
  thresholds: { http_req_failed: ["rate<0.05"] }, // OCR can be slow
};

export default function () {
  const res = http.post(
    `${API}/documents/scanner/upload/`,
    { file: http.file(SAMPLE, "scan.pdf", "application/pdf") },
    { headers: csrfHeaders() },
  );
  ok(res, "scanner:upload");
  sleep(2);
}
