// Client for Redaction + Watermarking V1 (apps.protected_copies). Owner-only.
//
// A protected copy is a NEW server-generated copy of an owned file with
// redaction boxes burned in and/or a watermark applied. Redaction is performed
// SERVER-SIDE: this client only sends coordinates (normalized 0..1 page
// fractions) and a watermark config — it never uploads a client-rendered file.
//
// The whole surface is gated by the `redaction_watermarking` feature flag. When
// the flag is off the backend returns a 503 ApiError; callers should hide the
// entry points (via `useFeature`) and handle a 503 gracefully.

import { apiFetch } from "./api";
import { getInboxFileDownloadBlob, saveBlob } from "./document-files";
import type { StatusTone } from "./status-badge";
import type {
  AddProtectedCopyToRoomResponse,
  CreateProtectedCopyBody,
  ProtectedCopy,
  ProtectedCopyListResponse,
  ProtectedCopyStatus,
  ProtectionType,
  UpdateProtectedCopyBody,
} from "@/types/protected-copies";

// ---- Owner API (authenticated) ---------------------------------------------

/** List protected copies, optionally only those made from one original file. */
export function getProtectedCopies(
  originalFile?: number,
): Promise<ProtectedCopyListResponse> {
  const query =
    originalFile !== undefined
      ? `?original_file=${encodeURIComponent(originalFile)}`
      : "";
  return apiFetch<ProtectedCopyListResponse>(`/protected-copies/${query}`);
}

/** Read a single protected copy. */
export function getProtectedCopy(id: number): Promise<ProtectedCopy> {
  return apiFetch<ProtectedCopy>(`/protected-copies/${id}/`);
}

/** Create a protected copy (starts as a draft). */
export function createProtectedCopy(
  body: CreateProtectedCopyBody,
): Promise<ProtectedCopy> {
  return apiFetch<ProtectedCopy>("/protected-copies/", {
    method: "POST",
    body,
  });
}

/** Edit a draft/failed protected copy (config only — never the original). */
export function updateProtectedCopy(
  id: number,
  patch: UpdateProtectedCopyBody,
): Promise<ProtectedCopy> {
  return apiFetch<ProtectedCopy>(`/protected-copies/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

/**
 * Generate (render) the protected copy server-side. On success the returned
 * copy is `ready` with `protected_file` + `protected_file_info`. On render
 * failure the copy is `failed` with an `error_message`.
 */
export function generateProtectedCopy(id: number): Promise<ProtectedCopy> {
  return apiFetch<ProtectedCopy>(`/protected-copies/${id}/generate/`, {
    method: "POST",
  });
}

/** Archive a protected copy so it leaves the active list. */
export function archiveProtectedCopy(id: number): Promise<ProtectedCopy> {
  return apiFetch<ProtectedCopy>(`/protected-copies/${id}/archive/`, {
    method: "POST",
  });
}

/**
 * Add a READY protected copy to a sharing room. The backend adds the PROTECTED
 * file to the room — never the original. 400 if the copy isn't ready, 404 if
 * the room isn't owned.
 */
export function addProtectedCopyToRoom(
  id: number,
  roomId: number,
): Promise<AddProtectedCopyToRoomResponse> {
  return apiFetch<AddProtectedCopyToRoomResponse>(
    `/protected-copies/${id}/add-to-room/`,
    {
      method: "POST",
      body: { sharing_room: roomId },
    },
  );
}

/**
 * Download the generated protected file through the authenticated private blob
 * route and trigger a browser "save". The protected file lives in the owner's
 * file store, so the inbox download endpoint serves it. Never a raw file URL.
 *
 * Throws if the copy isn't ready yet (no generated file to download).
 */
export async function downloadProtectedCopy(copy: ProtectedCopy): Promise<void> {
  const info = copy.protected_file_info;
  if (!info) {
    throw new Error("This protected copy isn't ready to download yet.");
  }
  const blob = await getInboxFileDownloadBlob(info.id);
  saveBlob(blob, info.original_filename);
}

// ---- Pure helpers (no DOM — unit-testable in the Node env) ------------------

/** Friendly, calm labels for each protection type. */
export const PROTECTION_TYPE_LABELS: Record<ProtectionType, string> = {
  watermark: "Watermark",
  redaction: "Redaction",
  redaction_watermark: "Redaction + watermark",
};

/** Status order for grouping/sorting a protected-copies list. */
export const PROTECTED_COPY_STATUS_ORDER: ProtectedCopyStatus[] = [
  "ready",
  "processing",
  "draft",
  "failed",
  "archived",
];

/** Friendly labels for each protected-copy status. */
export const PROTECTED_COPY_STATUS_LABELS: Record<ProtectedCopyStatus, string> =
  {
    draft: "Draft",
    processing: "Processing",
    ready: "Ready",
    failed: "Failed",
    archived: "Archived",
  };

/** Status tone for the canonical StatusBadge. */
export const PROTECTED_COPY_STATUS_TONE: Record<
  ProtectedCopyStatus,
  StatusTone
> = {
  draft: "neutral",
  processing: "info",
  ready: "success",
  failed: "danger",
  archived: "neutral",
};

/**
 * Content types the server-side redaction/watermarking pipeline supports:
 * PDF, PNG, and JPEG. Anything else can't be protected and the editor should
 * show the unsupported-format state. Case-insensitive; tolerates a charset
 * suffix (e.g. "image/png; charset=binary").
 */
export function supportedForFormat(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    base === "application/pdf" ||
    base === "image/png" ||
    base === "image/jpeg" ||
    base === "image/jpg"
  );
}

/** Whether a content type is a PDF (drives PDF rasterize vs. image preview). */
export function isPdfContentType(
  contentType: string | null | undefined,
): boolean {
  if (!contentType) return false;
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/pdf";
}

/** A pixel rectangle on the displayed page (origin top-left, px units). */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
};

/**
 * Convert an on-screen pixel rectangle into NORMALIZED page fractions (0..1).
 *
 * `displayedW`/`displayedH` are the rendered page's displayed size in CSS
 * pixels. The result is DPI-independent: `x`/`y` are the top-left corner and
 * `width`/`height` are the box size, each a fraction of the page. All four are
 * clamped into [0, 1] and the box is kept inside the page bounds, so a box that
 * spills past an edge is trimmed rather than reaching past 1.
 *
 * Returns a zero box when the displayed size is non-positive (nothing to map
 * against) — callers should treat zero-area boxes as "not a redaction".
 */
export function normalizeRect(
  pxRect: PixelRect,
  displayedW: number,
  displayedH: number,
): { x: number; y: number; width: number; height: number } {
  if (
    !Number.isFinite(displayedW) ||
    !Number.isFinite(displayedH) ||
    displayedW <= 0 ||
    displayedH <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // Normalize the corners first (handles any drag direction), then clamp both
  // corners to the page before measuring width/height so the box can't extend
  // past the edges.
  const left = Math.min(pxRect.x, pxRect.x + pxRect.width);
  const top = Math.min(pxRect.y, pxRect.y + pxRect.height);
  const right = Math.max(pxRect.x, pxRect.x + pxRect.width);
  const bottom = Math.max(pxRect.y, pxRect.y + pxRect.height);

  const x = clamp01(left / displayedW);
  const y = clamp01(top / displayedH);
  const x2 = clamp01(right / displayedW);
  const y2 = clamp01(bottom / displayedH);

  return { x, y, width: x2 - x, height: y2 - y };
}

/** True for a normalized box big enough to be a deliberate redaction. */
export function isMeaningfulBox(box: {
  width: number;
  height: number;
}): boolean {
  return box.width >= 0.01 && box.height >= 0.01;
}
