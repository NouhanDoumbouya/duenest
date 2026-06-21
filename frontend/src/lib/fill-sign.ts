// API client for Fill & Sign — prepare a filled/signed copy of an owned PDF file.
//
// The backend renders the overlay onto the original PDF, stores the result as a
// new encrypted DocumentFile (the original is preserved), and records a
// signature audit trail. This is a prepared copy, not a legal e-signature.

import { apiFetch } from "./api";
import type { FillSignPayload, PreparedDocument } from "@/types/fill-sign";

/** Prepare a signed copy of file `fileId` from the given annotation overlay. */
export function prepareSignedCopy(
  fileId: number,
  payload: FillSignPayload,
): Promise<PreparedDocument> {
  return apiFetch<PreparedDocument>(`/files/${fileId}/fill-sign/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

/** List the user's prepared copies, optionally for one source file or document. */
export function listPreparedDocuments(params?: {
  originalFile?: number;
  document?: number;
}): Promise<PreparedDocument[]> {
  const query = new URLSearchParams();
  if (params?.originalFile) query.set("original_file", String(params.originalFile));
  if (params?.document) query.set("document", String(params.document));
  const qs = query.toString();
  return apiFetch<PreparedDocument[]>(
    `/fill-sign/prepared/${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}
