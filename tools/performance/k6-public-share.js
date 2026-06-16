// Scenario: anonymous public share (Quick Share / SafeSend) metadata + preview.
// No auth cookie. Budget: metadata p95 < 150 ms.
import http from "k6/http";
import { sleep } from "k6";
import { API, baseOptions, ok } from "./_common.js";

export const options = baseOptions;
const TOKEN = __ENV.TEST_SHARE_TOKEN || "REPLACE_WITH_TEST_TOKEN";

export default function () {
  // Public metadata lookup (token in path; access code is NOT in the URL).
  ok(http.get(`${API}/quick-share/${TOKEN}/`, { headers: { Accept: "application/json" } }), "share:metadata");
  sleep(1);
}
