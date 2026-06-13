// API helpers for Secure Rooms / Shared Packs (owner + public access).

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import type {
  CreateShareRoomPayload,
  CreatedShareRoom,
  PublicRoomMetadata,
  RoomActivity,
  ShareRoom,
} from "@/types/share-rooms";

// ---- Owner endpoints -------------------------------------------------------

export function listShareRooms(): Promise<ShareRoom[]> {
  return apiFetch<ShareRoom[]>("/share-rooms/", { auth: true });
}

export function getShareRoom(roomId: number): Promise<ShareRoom> {
  return apiFetch<ShareRoom>(`/share-rooms/${roomId}/`, { auth: true });
}

export function createShareRoom(
  payload: CreateShareRoomPayload,
): Promise<CreatedShareRoom> {
  return apiFetch<CreatedShareRoom>("/share-rooms/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateShareRoom(
  roomId: number,
  payload: Partial<CreateShareRoomPayload>,
): Promise<CreatedShareRoom> {
  return apiFetch<CreatedShareRoom>(`/share-rooms/${roomId}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteShareRoom(roomId: number): Promise<void> {
  return apiFetch<void>(`/share-rooms/${roomId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function addShareRoomItem(
  roomId: number,
  item: { document?: number; file?: number; proof?: number },
): Promise<ShareRoom> {
  return apiFetch<ShareRoom>(`/share-rooms/${roomId}/items/`, {
    method: "POST",
    body: item,
    auth: true,
  });
}

export function removeShareRoomItem(
  roomId: number,
  itemId: number,
): Promise<void> {
  return apiFetch<void>(`/share-rooms/${roomId}/items/${itemId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function revokeShareRoom(roomId: number): Promise<ShareRoom> {
  return apiFetch<ShareRoom>(`/share-rooms/${roomId}/revoke/`, {
    method: "POST",
    auth: true,
  });
}

export function getShareRoomActivity(roomId: number): Promise<RoomActivity[]> {
  return apiFetch<RoomActivity[]>(`/share-rooms/${roomId}/activity/`, {
    auth: true,
  });
}

// ---- Public endpoints ------------------------------------------------------

function withGrant(path: string, grant?: string): string {
  if (!grant) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}grant=${encodeURIComponent(grant)}`;
}

export function getPublicRoom(
  token: string,
  grant?: string,
): Promise<PublicRoomMetadata> {
  return apiFetch<PublicRoomMetadata>(
    withGrant(`/public/rooms/${encodeURIComponent(token)}/`, grant),
  );
}

export function verifyPublicRoomCode(
  token: string,
  accessCode: string,
): Promise<{ detail: string; grant?: string; grant_expires_in?: number }> {
  return apiFetch(`/public/rooms/${encodeURIComponent(token)}/verify-code/`, {
    method: "POST",
    body: { access_code: accessCode },
  });
}

async function publicRoomBlob(path: string, fallback: string): Promise<Blob> {
  const headers = new Headers();
  headers.set("Accept", "*/*");
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers });
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

export function getPublicRoomFilePreviewBlob(
  token: string,
  fileId: number,
  grant?: string,
): Promise<Blob> {
  return publicRoomBlob(
    withGrant(
      `/public/rooms/${encodeURIComponent(token)}/files/${fileId}/preview/`,
      grant,
    ),
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

export async function downloadPublicRoomFile(
  token: string,
  fileId: number,
  filename: string,
  grant?: string,
): Promise<void> {
  const blob = await publicRoomBlob(
    withGrant(
      `/public/rooms/${encodeURIComponent(token)}/files/${fileId}/download/`,
      grant,
    ),
    "Could not download this file.",
  );
  saveBlob(blob, filename);
}

export async function downloadPublicRoomZip(
  token: string,
  grant?: string,
): Promise<void> {
  const blob = await publicRoomBlob(
    withGrant(`/public/rooms/${encodeURIComponent(token)}/download-zip/`, grant),
    "Could not download this room.",
  );
  saveBlob(blob, `duenest-room-${token.slice(0, 8)}.zip`);
}
