// Scenario: authenticated encrypted file download. This decrypts the whole file
// into server memory before streaming (see PERF-002), so watch server RSS and
// latency as file size and concurrency grow. Budget: streamed, no memory spike.
import http from "k6/http";
import { sleep } from "k6";
import { API, authHeaders, baseOptions, ok } from "./_common.js";

export const options = {
  ...baseOptions,
  vus: Number(__ENV.VUS || 5), // keep low; downloads are heavy
};
const FILE_ID = __ENV.TEST_FILE_ID || "REPLACE_WITH_TEST_FILE_ID";

export default function () {
  const res = http.get(`${API}/documents/files/${FILE_ID}/download/`, {
    headers: authHeaders(),
  });
  ok(res, "file:download");
  sleep(1);
}
