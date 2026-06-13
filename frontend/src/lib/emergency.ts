// Emergency access pack API helpers (/api/v1/emergency-packs/) and labels.

import { API_BASE_URL, apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  CreateEmergencyPackItemRequest,
  CreateEmergencyPackRequest,
  EmergencyPack,
  EmergencyPackItem,
  EmergencyPackStatus,
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

export const EMERGENCY_STATUS_LABELS: Record<EmergencyPackStatus, string> = {
  draft: "Draft",
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
};
