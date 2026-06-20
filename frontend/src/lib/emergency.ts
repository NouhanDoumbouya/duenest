// Emergency access pack API helpers (/api/v1/emergency-packs/) and labels.

import { API_BASE_URL, apiFetch } from "./api";
import { fetchBlob, saveBlob } from "./document-files";
import type { Paginated } from "@/types/documents";
import type {
  CreateEmergencyPackItemRequest,
  CreateEmergencyPackRequest,
  CreateTrustedContactRequest,
  CreateUnlockRequestPayload,
  EmergencyActivityEvent,
  EmergencyLocationPrecision,
  EmergencyPack,
  EmergencyPackItem,
  EmergencyPackStatus,
  EmergencyTrustedContact,
  EmergencyUnlockRequest,
  PublicEmergencyPack,
  UnlockRequestResult,
  UpdateEmergencyPackRequest,
} from "@/types/emergency";

export function getEmergencyPacks(): Promise<Paginated<EmergencyPack>> {
  return apiFetch<Paginated<EmergencyPack>>("/emergency-packs/", { auth: true });
}

export function getEmergencyPack(id: number): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/`, { auth: true });
}

export function createEmergencyPack(
  payload: CreateEmergencyPackRequest,
): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>("/emergency-packs/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateEmergencyPack(
  id: number,
  payload: UpdateEmergencyPackRequest,
): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteEmergencyPack(id: number): Promise<void> {
  return apiFetch<void>(`/emergency-packs/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function addEmergencyPackItem(
  packId: number,
  payload: CreateEmergencyPackItemRequest,
): Promise<EmergencyPackItem> {
  return apiFetch<EmergencyPackItem>(`/emergency-packs/${packId}/items/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function removeEmergencyPackItem(
  packId: number,
  itemId: number,
): Promise<void> {
  return apiFetch<void>(`/emergency-packs/${packId}/items/${itemId}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** Activate the pack (creates a public token for shareable packs). */
export function enableEmergencyPack(id: number): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/enable/`, {
    method: "POST",
    auth: true,
  });
}

/** Disable the pack — any public link stops working immediately. */
export function disableEmergencyPack(id: number): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/disable/`, {
    method: "POST",
    auth: true,
  });
}

/** Rotate the public token, invalidating the previous link. */
export function regenerateEmergencyPackLink(id: number): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/regenerate-link/`, {
    method: "POST",
    auth: true,
  });
}

/** Mark the pack as freshly reviewed (resets the "needs review" prompt). */
export function reviewEmergencyPack(id: number): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${id}/review/`, {
    method: "POST",
    auth: true,
  });
}

// ---- Trusted contacts ------------------------------------------------------

export function getTrustedContacts(
  packId: number,
): Promise<EmergencyTrustedContact[]> {
  return apiFetch<EmergencyTrustedContact[]>(
    `/emergency-packs/${packId}/contacts/`,
    { auth: true },
  );
}

export function addTrustedContact(
  packId: number,
  payload: CreateTrustedContactRequest,
): Promise<EmergencyTrustedContact> {
  return apiFetch<EmergencyTrustedContact>(
    `/emergency-packs/${packId}/contacts/`,
    { method: "POST", body: payload, auth: true },
  );
}

export function updateTrustedContact(
  packId: number,
  contactId: number,
  payload: Partial<CreateTrustedContactRequest>,
): Promise<EmergencyTrustedContact> {
  return apiFetch<EmergencyTrustedContact>(
    `/emergency-packs/${packId}/contacts/${contactId}/`,
    { method: "PATCH", body: payload, auth: true },
  );
}

export function removeTrustedContact(
  packId: number,
  contactId: number,
): Promise<void> {
  return apiFetch<void>(`/emergency-packs/${packId}/contacts/${contactId}/`, {
    method: "DELETE",
    auth: true,
  });
}

// ---- Emergency location (off by default) -----------------------------------

export function updateEmergencyLocation(
  packId: number,
  payload: {
    location_enabled?: boolean;
    location_precision?: EmergencyLocationPrecision;
    label?: string;
    lat?: number | null;
    lng?: number | null;
    /** True for background auto-refreshes — suppresses the activity-log entry. */
    auto?: boolean;
  },
): Promise<EmergencyPack> {
  return apiFetch<EmergencyPack>(`/emergency-packs/${packId}/location/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

// ---- Activity + unlock requests (owner) ------------------------------------

export function getEmergencyActivity(
  packId: number,
): Promise<EmergencyActivityEvent[]> {
  return apiFetch<EmergencyActivityEvent[]>(
    `/emergency-packs/${packId}/activity/`,
    { auth: true },
  );
}

export function getUnlockRequests(
  packId: number,
): Promise<EmergencyUnlockRequest[]> {
  return apiFetch<EmergencyUnlockRequest[]>(
    `/emergency-packs/${packId}/unlock-requests/`,
    { auth: true },
  );
}

export function approveUnlockRequest(
  packId: number,
  requestId: number,
): Promise<EmergencyUnlockRequest> {
  return apiFetch<EmergencyUnlockRequest>(
    `/emergency-packs/${packId}/unlock-requests/${requestId}/approve/`,
    { method: "POST", auth: true },
  );
}

export function denyUnlockRequest(
  packId: number,
  requestId: number,
): Promise<EmergencyUnlockRequest> {
  return apiFetch<EmergencyUnlockRequest>(
    `/emergency-packs/${packId}/unlock-requests/${requestId}/deny/`,
    { method: "POST", auth: true },
  );
}

export function revokeUnlockRequest(
  packId: number,
  requestId: number,
): Promise<EmergencyUnlockRequest> {
  return apiFetch<EmergencyUnlockRequest>(
    `/emergency-packs/${packId}/unlock-requests/${requestId}/revoke/`,
    { method: "POST", auth: true },
  );
}

/** Build the full absolute public share URL from a relative share path. */
export function buildShareUrl(sharePath: string | null): string | null {
  if (!sharePath) return null;
  // share_url_path is an /api/v1/... path; derive the API origin from the base.
  try {
    const origin = new URL(API_BASE_URL).origin;
    return `${origin}${sharePath}`;
  } catch {
    return sharePath;
  }
}

/**
 * Build the absolute frontend viewer URL (the human-friendly page recipients
 * open) from the relative public_url_path. Uses the current site origin.
 */
export function buildPublicViewerUrl(publicPath: string | null): string | null {
  if (!publicPath) return null;
  if (typeof window === "undefined") return publicPath;
  return `${window.location.origin}${publicPath}`;
}

// ---- Public viewer API (no auth; optional access code) ---------------------

function emergencyHeaders(
  accessCode?: string,
  requestToken?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessCode) headers["X-Access-Code"] = accessCode;
  if (requestToken) headers["X-Request-Token"] = requestToken;
  return headers;
}

/** Fetch the safe public metadata for a shared emergency pack. */
export function getPublicEmergencyPack(
  token: string,
  accessCode?: string,
  requestToken?: string,
): Promise<PublicEmergencyPack> {
  return apiFetch<PublicEmergencyPack>(
    `/share/emergency-packs/${encodeURIComponent(token)}/`,
    { headers: emergencyHeaders(accessCode, requestToken) },
  );
}

/** Start an emergency unlock request from the public link. */
export function createUnlockRequest(
  token: string,
  payload: CreateUnlockRequestPayload,
): Promise<UnlockRequestResult> {
  return apiFetch<UnlockRequestResult>(
    `/share/emergency-packs/${encodeURIComponent(token)}/request/`,
    { method: "POST", body: payload },
  );
}

/** Poll the status of an unlock request (and read items once unlocked). */
export function getUnlockRequestStatus(
  token: string,
  requestToken: string,
): Promise<PublicEmergencyPack> {
  return apiFetch<PublicEmergencyPack>(
    `/share/emergency-packs/${encodeURIComponent(token)}/request/${encodeURIComponent(
      requestToken,
    )}/`,
  );
}

/** Verify the access code for a protected emergency pack. */
export function verifyEmergencyAccessCode(
  token: string,
  accessCode: string,
): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(
    `/share/emergency-packs/${encodeURIComponent(token)}/verify-code/`,
    { method: "POST", body: { access_code: accessCode } },
  );
}

/** Inline preview blob for one item in a shared emergency pack. */
export function getEmergencyItemPreviewBlob(
  token: string,
  itemId: number,
  accessCode?: string,
  requestToken?: string,
): Promise<Blob> {
  return fetchBlob(
    `/share/emergency-packs/${encodeURIComponent(token)}/items/${itemId}/preview/`,
    {
      accessCode,
      headers: requestToken ? { "X-Request-Token": requestToken } : undefined,
      fallbackError: "Could not preview this item.",
    },
  );
}

/** Download one item in a shared emergency pack. */
export async function downloadEmergencyItem(
  token: string,
  itemId: number,
  filename: string,
  accessCode?: string,
  requestToken?: string,
): Promise<void> {
  const blob = await fetchBlob(
    `/share/emergency-packs/${encodeURIComponent(token)}/items/${itemId}/download/`,
    {
      accessCode,
      headers: requestToken ? { "X-Request-Token": requestToken } : undefined,
      fallbackError: "Could not download this item.",
    },
  );
  saveBlob(blob, filename);
}

export const EMERGENCY_STATUS_LABELS: Record<EmergencyPackStatus, string> = {
  draft: "Draft",
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
};
