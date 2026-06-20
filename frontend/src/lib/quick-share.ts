// API helpers for Quick Share QR (owner, claim, and "Shared with me").
//
// Access codes are passed as the `X-Access-Code` header and re-validated by the
// backend on every request. File bytes are fetched as blobs so the access token
// and access code can be attached to the request.

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  CreateQuickSharePayload,
  QuickShareActivity,
  QuickShareClaimSummary,
  QuickShareListItem,
  QuickSharePublic,
  QuickShareSession,
  ShareVerification,
  SharedWithMeItem,
} from "@/types/quick-share";

// ---- Owner endpoints -------------------------------------------------------

export function listQuickShares(): Promise<QuickShareListItem[]> {
  return apiFetch<QuickShareListItem[]>("/quick-share/sessions/", { auth: true });
}

export function getQuickShare(id: number): Promise<QuickShareSession> {
  return apiFetch<QuickShareSession>(`/quick-share/sessions/${id}/`, {
    auth: true,
  });
}

export function createQuickShare(
  payload: CreateQuickSharePayload,
): Promise<QuickShareSession> {
  return apiFetch<QuickShareSession>("/quick-share/sessions/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function getQuickShareActivity(
  id: number,
): Promise<QuickShareActivity[]> {
  return apiFetch<QuickShareActivity[]>(
    `/quick-share/sessions/${id}/activity/`,
    { auth: true },
  );
}

export function revokeQuickShare(id: number): Promise<QuickShareSession> {
  return apiFetch<QuickShareSession>(`/quick-share/sessions/${id}/revoke/`, {
    method: "POST",
    auth: true,
  });
}

/** Move a share's expiry forward (or re-open an expired share). */
export function extendQuickShare(
  id: number,
  expiresAt: string,
): Promise<QuickShareSession> {
  return apiFetch<QuickShareSession>(`/quick-share/sessions/${id}/extend/`, {
    method: "POST",
    body: { expires_at: expiresAt },
    auth: true,
  });
}

export function deleteQuickShare(id: number): Promise<void> {
  return apiFetch<void>(`/quick-share/sessions/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function approveQuickShareClaim(
  id: number,
  claimId: number,
): Promise<QuickShareClaimSummary> {
  return apiFetch<QuickShareClaimSummary>(
    `/quick-share/sessions/${id}/approve-claim/`,
    { method: "POST", body: { claim_id: claimId }, auth: true },
  );
}

export function denyQuickShareClaim(
  id: number,
  claimId: number,
): Promise<QuickShareClaimSummary> {
  return apiFetch<QuickShareClaimSummary>(
    `/quick-share/sessions/${id}/deny-claim/`,
    { method: "POST", body: { claim_id: claimId }, auth: true },
  );
}

// ---- Receive by DueNest code -----------------------------------------------

export interface ReceiveCodeResult {
  ok: boolean;
  token: string;
  claim_path: string;
  mode: string;
}

/**
 * Resolve a typed DueNest code to its share. On success the backend returns the
 * session token + claim path so the caller can hand off to the normal, fully
 * guarded claim flow. Errors surface as ApiError with a friendly `detail`.
 */
export function receiveByCode(code: string): Promise<ReceiveCodeResult> {
  return apiFetch<ReceiveCodeResult>("/quick-share/receive/", {
    method: "POST",
    body: { code },
  });
}

// ---- Claim endpoints (token-gated) -----------------------------------------

function codeHeaders(accessCode?: string): Record<string, string> {
  return accessCode ? { "X-Access-Code": accessCode } : {};
}

export function getQuickShareClaim(
  token: string,
  accessCode?: string,
): Promise<QuickSharePublic> {
  return apiFetch<QuickSharePublic>(
    `/quick-share/claim/${encodeURIComponent(token)}/`,
    { auth: true, headers: codeHeaders(accessCode) },
  );
}

/** Public tamper-evidence check for a verified share (no auth, metadata only). */
export function getShareVerification(token: string): Promise<ShareVerification> {
  return apiFetch<ShareVerification>(
    `/verify/${encodeURIComponent(token)}/`,
    { auth: false },
  );
}

export function verifyQuickShareCode(
  token: string,
  accessCode: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/quick-share/claim/${encodeURIComponent(token)}/verify-code/`,
    { method: "POST", body: { access_code: accessCode } },
  );
}

export function acceptQuickShare(
  token: string,
  accessCode?: string,
): Promise<SharedWithMeItem> {
  return apiFetch<SharedWithMeItem>(
    `/quick-share/claim/${encodeURIComponent(token)}/accept/`,
    { method: "POST", auth: true, headers: codeHeaders(accessCode) },
  );
}

export function declineQuickShare(token: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/quick-share/claim/${encodeURIComponent(token)}/decline/`,
    { method: "POST", auth: true },
  );
}

/** Recipient pings the owner for more time (works on an expired share). */
export function requestQuickShareExtension(
  token: string,
): Promise<{ ok: boolean; detail: string }> {
  return apiFetch<{ ok: boolean; detail: string }>(
    `/quick-share/claim/${encodeURIComponent(token)}/request-extension/`,
    { method: "POST" },
  );
}

async function claimBlob(
  path: string,
  accessCode: string | undefined,
  fallback: string,
): Promise<Blob> {
  const headers = new Headers();
  headers.set("Accept", "*/*");
  const authToken = getAccessToken();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  if (accessCode) headers.set("X-Access-Code", accessCode);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0, null);
  }
  if (!response.ok) {
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const data: unknown = isJson ? await response.json() : null;
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : fallback;
    throw new ApiError(detail, response.status, data);
  }
  return response.blob();
}

export function getQuickShareFilePreviewBlob(
  token: string,
  fileId: number,
  accessCode?: string,
): Promise<Blob> {
  return claimBlob(
    `/quick-share/claim/${encodeURIComponent(token)}/files/${fileId}/preview/`,
    accessCode,
    "Could not preview this file.",
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadQuickShareFile(
  token: string,
  fileId: number,
  filename: string,
  accessCode?: string,
): Promise<void> {
  const blob = await claimBlob(
    `/quick-share/claim/${encodeURIComponent(token)}/files/${fileId}/download/`,
    accessCode,
    "Could not download this file.",
  );
  saveBlob(blob, filename);
}

export function saveQuickShareCopy(
  token: string,
  fileId: number,
  accessCode?: string,
): Promise<{ ok: boolean; document_id: number; file_id: number; detail: string }> {
  return apiFetch(
    `/quick-share/claim/${encodeURIComponent(token)}/files/${fileId}/save-copy/`,
    { method: "POST", auth: true, headers: codeHeaders(accessCode) },
  );
}

// ---- Shared with me --------------------------------------------------------

export function listSharedWithMe(): Promise<SharedWithMeItem[]> {
  return apiFetch<SharedWithMeItem[]>("/shared-with-me/", { auth: true });
}

export function getSharedWithMe(claimId: number): Promise<SharedWithMeItem> {
  return apiFetch<SharedWithMeItem>(`/shared-with-me/${claimId}/`, {
    auth: true,
  });
}

export function removeSharedWithMe(claimId: number): Promise<void> {
  return apiFetch<void>(`/shared-with-me/${claimId}/remove/`, {
    method: "POST",
    auth: true,
  });
}
