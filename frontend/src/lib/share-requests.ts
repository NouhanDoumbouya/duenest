import { apiFetch } from "./api";
import type {
  CreateShareRequestPayload,
  PublicShareRequest,
  ShareRequest,
} from "@/types/share-requests";

export function listShareRequests(): Promise<ShareRequest[]> {
  return apiFetch<ShareRequest[]>("/share-requests/", { auth: true });
}

export function createShareRequest(
  payload: CreateShareRequestPayload,
): Promise<ShareRequest> {
  return apiFetch<ShareRequest>("/share-requests/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function closeShareRequest(id: number): Promise<ShareRequest> {
  return apiFetch<ShareRequest>(`/share-requests/${id}/`, {
    method: "POST",
    auth: true,
  });
}

export function deleteShareRequest(id: number): Promise<void> {
  return apiFetch<void>(`/share-requests/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** Public — checklist metadata for the responder (no auth). */
export function getPublicShareRequest(
  token: string,
): Promise<PublicShareRequest> {
  return apiFetch<PublicShareRequest>(
    `/share-requests/respond/${encodeURIComponent(token)}/`,
    { auth: false },
  );
}

/** Public — upload a file as a non-DueNest person (no auth). */
export function uploadExternalShareRequest(
  token: string,
  payload: { file: File; email?: string; notes?: string },
): Promise<{ ok: boolean; detail: string }> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.email) form.append("email", payload.email);
  if (payload.notes) form.append("notes", payload.notes);
  return apiFetch<{ ok: boolean; detail: string }>(
    `/public/share-requests/${encodeURIComponent(token)}/upload/`,
    { method: "POST", body: form, auth: false },
  );
}

export function submitShareRequestResponse(
  token: string,
  items: {
    item_id: number;
    file_ids?: number[];
    document_ids?: number[];
  }[],
): Promise<{ ok: boolean; detail: string }> {
  return apiFetch<{ ok: boolean; detail: string }>(
    `/share-requests/respond/${encodeURIComponent(token)}/submit/`,
    { method: "POST", body: { items }, auth: true },
  );
}
