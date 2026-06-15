import { apiFetch } from "@/lib/api";

import {
  getDecryptedScanBlob,
  listQueuedScans,
  removeScan,
  updateScan,
} from "./queue";
import type { UploadResult } from "./types";

const SCAN_ENDPOINT = "/scanner/upload-scanned-document/";

/** Upload a scanned PDF blob. Auth + CSRF flow through the shared apiFetch. */
export async function uploadScan(blob: Blob, filename: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", blob, filename);
  return apiFetch<UploadResult>(SCAN_ENDPOINT, {
    method: "POST",
    body: form,
  });
}

export interface FlushOutcome {
  uploaded: number;
  failed: number;
}

/**
 * Attempt to upload every queued scan. Successful items are deleted; failures
 * are kept and marked so the user can retry. Used both by manual retry and by
 * the "back online" handler. Network errors stop further attempts (still
 * offline) rather than burning through the whole queue.
 */
export async function flushQueuedScans(): Promise<FlushOutcome> {
  const items = await listQueuedScans();
  let uploaded = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status === "uploading") continue;
    await updateScan(item.id, { status: "uploading" });
    try {
      const blob = await getDecryptedScanBlob(item);
      await uploadScan(blob, item.filename);
      await removeScan(item.id);
      uploaded += 1;
    } catch (err) {
      failed += 1;
      const status = (err as { status?: number }).status;
      await updateScan(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: (err as Error).message,
      });
      // status 0 = network unreachable: we're still offline, stop early.
      if (status === 0) break;
    }
  }

  return { uploaded, failed };
}
