// Client for Sharing Rooms V1 (apps.sharing_rooms).
//
// Two surfaces:
//   * Owner endpoints (authenticated) reuse the shared `apiFetch` (cookie auth +
//     CSRF + error handling).
//   * Public endpoints (token only, NO auth) talk to `/public/sharing-rooms/`.
//     The public preview/download fetchers hit the token-scoped proxy routes
//     WITHOUT any auth header — they mirror the unauthenticated public fetches
//     used elsewhere. The token in the URL authorizes the read; the response
//     never contains a raw file URL.
//
// Trust model: nothing is shared until the owner creates a room and hands out
// the link. The public page never receives a private file download URL — every
// document is reached through the token-scoped public proxy.

import { API_BASE_URL, ApiError } from "./api";
import { apiFetch } from "./api";
import type {
  AddSharingRoomItemBody,
  CreateSharingRoomBody,
  PublicSharingRoom,
  PublicSharingRoomState,
  SharingRoom,
  SharingRoomItemType,
  SharingRoomListResponse,
  SharingRoomStatus,
  SharingRoomType,
  UpdateSharingRoomBody,
} from "@/types/sharing-rooms";

// ---- Owner API (authenticated) ---------------------------------------------

/** List the owner's sharing rooms, optionally filtered by status. */
export function getSharingRooms(
  status?: SharingRoomStatus,
): Promise<SharingRoomListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<SharingRoomListResponse>(`/sharing-rooms/${query}`);
}

/** Read a single sharing room. */
export function getSharingRoom(id: number): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/`);
}

/** Create a new sharing room. */
export function createSharingRoom(
  body: CreateSharingRoomBody,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>("/sharing-rooms/", {
    method: "POST",
    body,
  });
}

/** Edit a room's metadata (title, description, type, expiry, permissions). */
export function updateSharingRoom(
  id: number,
  patch: UpdateSharingRoomBody,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

/** Add a document, file, or request to a room. Returns the updated room. */
export function addSharingRoomItem(
  id: number,
  body: AddSharingRoomItemBody,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/add-item/`, {
    method: "POST",
    body,
  });
}

/** Remove an item from a room by its item id. Returns the updated room. */
export function removeSharingRoomItem(
  id: number,
  itemId: number,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/remove-item/`, {
    method: "POST",
    body: { item_id: itemId },
  });
}

/** Revoke a room so its link stops working. Returns the updated room. */
export function revokeSharingRoom(id: number): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/revoke/`, {
    method: "POST",
  });
}

/** Archive a room so it leaves the active list. Returns the updated room. */
export function archiveSharingRoom(id: number): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/${id}/archive/`, {
    method: "POST",
  });
}

/** Create a room pre-populated from an application pack (bundle). */
export function createSharingRoomFromPack(
  bundleId: number,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(`/sharing-rooms/from-pack/${bundleId}/`, {
    method: "POST",
  });
}

/** Create a room pre-populated from an application. */
export function createSharingRoomFromApplication(
  applicationId: number,
): Promise<SharingRoom> {
  return apiFetch<SharingRoom>(
    `/sharing-rooms/from-application/${applicationId}/`,
    { method: "POST" },
  );
}

// ---- Public API (NO auth — token only) -------------------------------------

/**
 * Read the PUBLIC view of a room by token. No auth: this is the page an
 * unauthenticated visitor lands on. The token in the path is the only
 * identifier, and the response never includes private owner data or raw file
 * URLs.
 */
export function getPublicRoom(token: string): Promise<PublicSharingRoom> {
  return apiFetch<PublicSharingRoom>(
    `/public/sharing-rooms/${encodeURIComponent(token)}/`,
  );
}

/**
 * Fetch a room document's bytes through the token-scoped public PROXY route.
 *
 * This is an ANONYMOUS request: no Authorization header, no CSRF token. The
 * token + file_id in the URL authorize the read. Returns a Blob the caller can
 * turn into an object URL for inline preview (image/PDF) or saving.
 */
async function fetchPublicRoomBlob(
  path: string,
  fallbackError: string,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "*/*" },
      // Anonymous: do NOT attach credentials. The token in the path is the only
      // authorization, mirroring the public document-request fetches.
      credentials: "omit",
    });
  } catch {
    throw new ApiError(
      "Unable to reach the server. Please try again.",
      0,
      null,
    );
  }

  if (!response.ok) {
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const data: unknown = isJson ? await response.json().catch(() => null) : null;
    const message =
      data && typeof data === "object" && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : fallbackError;
    throw new ApiError(message, response.status, data);
  }

  return response.blob();
}

/** Preview a room document (image/PDF) via the public proxy. */
export function getPublicRoomFilePreviewBlob(
  token: string,
  fileId: number,
): Promise<Blob> {
  return fetchPublicRoomBlob(
    `/public/sharing-rooms/${encodeURIComponent(token)}/files/${fileId}/preview/`,
    "Could not preview this file.",
  );
}

/**
 * Download a room document via the public proxy. The backend returns 403 when
 * the room has `allow_download: false`, surfaced here as an ApiError so callers
 * can show a friendly message.
 */
export function getPublicRoomFileDownloadBlob(
  token: string,
  fileId: number,
): Promise<Blob> {
  return fetchPublicRoomBlob(
    `/public/sharing-rooms/${encodeURIComponent(token)}/files/${fileId}/download/`,
    "Could not download this file.",
  );
}

// ---- Pure helpers (no DOM — unit-testable in the Node env) ------------------

/** Status order for grouping/sorting the owner list. */
export const SHARING_ROOM_STATUS_ORDER: SharingRoomStatus[] = [
  "active",
  "expired",
  "revoked",
  "archived",
];

/** Friendly, calm labels for each room status. */
export const SHARING_ROOM_STATUS_LABELS: Record<SharingRoomStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  archived: "Archived",
};

/** Status tone for the canonical StatusBadge. */
export const SHARING_ROOM_STATUS_TONE: Record<
  SharingRoomStatus,
  "success" | "warning" | "danger" | "info" | "trust" | "neutral"
> = {
  active: "success",
  expired: "warning",
  revoked: "danger",
  archived: "neutral",
};

/** Type order for the create-room select. */
export const SHARING_ROOM_TYPE_ORDER: SharingRoomType[] = [
  "general",
  "application",
  "pack",
  "organization",
  "emergency",
];

/** Friendly labels for each room type. */
export const SHARING_ROOM_TYPE_LABELS: Record<SharingRoomType, string> = {
  general: "General",
  application: "Application",
  pack: "Application pack",
  organization: "Organization",
  emergency: "Emergency",
};

/** Friendly labels for the kinds of item a room can hold. */
export const SHARING_ROOM_ITEM_TYPE_LABELS: Record<SharingRoomItemType, string> =
  {
    document: "Document",
    file: "File",
    request: "Request",
  };

/**
 * Build the absolute public room URL for a token. Prefers the server-provided
 * `public_url`; falls back to constructing one from the given/current origin so
 * the copy-link button always has something to copy. Returns "" only when
 * neither a URL nor an origin is available.
 *
 * Note: the SINGULAR `/room/{token}` route — distinct from the older ShareRoom
 * feature's plural `/rooms/{token}`.
 */
export function buildPublicRoomUrl(
  room: Pick<SharingRoom, "public_url" | "token">,
  origin?: string,
): string {
  if (room.public_url) return room.public_url;
  if (!room.token) return "";
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/room/${room.token}`;
}

/**
 * Copy text to the clipboard. Returns true on success. Falls back to a
 * temporary textarea + execCommand for non-secure contexts where the async
 * Clipboard API is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Friendly copy for a blocked / unavailable public room state. */
export function publicRoomStateMessage(state: PublicSharingRoomState): {
  title: string;
  description: string;
} {
  switch (state) {
    case "expired":
      return {
        title: "This room has expired",
        description:
          "The link is no longer available. Ask the person who shared it for a new link.",
      };
    case "revoked":
      return {
        title: "This room was revoked",
        description:
          "The person who shared it has closed access. Reach out to them if you still need these documents.",
      };
    case "not_found":
      return {
        title: "We couldn't find this room",
        description:
          "The link may be incorrect or has been removed. Double-check the link you were sent.",
      };
    case "ok":
    default:
      return {
        title: "",
        description: "",
      };
  }
}
