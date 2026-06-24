// Types for Redaction + Watermarking V1 (apps.protected_copies). Owner-scoped.
//
// A "protected copy" is a NEW, server-generated copy of an owned file with
// redaction boxes burned in and/or a watermark applied. The original is never
// touched — redaction always produces a separate copy. The actual rendering is
// done SERVER-SIDE: the editor only sends redaction coordinates (normalized
// fractions of each page) plus a watermark config; it never uploads a
// client-rendered file.
//
// Coordinate model: every redaction box is expressed as fractions of the page
// (0..1), so it is DPI- and render-size-independent. `{page_number, x, y,
// width, height}` where x/y are the top-left corner and width/height are the
// box size, all in 0..1.

/** What protection the copy applies. */
export type ProtectionType =
  | "watermark"
  | "redaction"
  | "redaction_watermark";

/** Lifecycle status of a protected copy. */
export type ProtectedCopyStatus =
  | "draft"
  | "processing"
  | "ready"
  | "failed"
  | "archived";

/** Where the watermark text is placed on the page. */
export type WatermarkPosition = "diagonal" | "center" | "footer" | "header";

/**
 * A single redaction box, in NORMALIZED page fractions (0..1). `page_number`
 * is 1-based to match the backend. `coordinate_space` is informational metadata
 * returned by the backend (e.g. "normalized"); requests only send the fractions.
 */
export interface RedactionBox {
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinate_space?: string;
}

/**
 * The PRIVATE file reference for the generated protected copy. `download_url`
 * is the owner-only route (`/api/v1/files/{id}/download/`) — used solely by the
 * authenticated owner via the blob-download helper, NEVER linked publicly.
 */
export interface ProtectedFileInfo {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  /** PRIVATE owner-only download route. Do not surface a raw URL publicly. */
  download_url: string;
}

/** A full protected copy owned by the current user. */
export interface ProtectedCopy {
  id: number;
  title: string;
  protection_type: ProtectionType;
  status: ProtectedCopyStatus;
  /** The original DocumentFile id this copy was made from. */
  original_file: number;
  /** The owning document, if the original file belongs to one. */
  original_document: number | null;
  /** The generated protected file's id, once ready. */
  protected_file: number | null;
  protected_file_info: ProtectedFileInfo | null;
  watermark_text: string;
  watermark_position: WatermarkPosition;
  watermark_opacity: number;
  redactions: RedactionBox[];
  output_mime_type: string;
  page_count: number;
  error_message: string;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

/** List response for a file's protected copies. */
export interface ProtectedCopyListResponse {
  protected_copies: ProtectedCopy[];
  count: number;
}

/** A redaction box as SENT to the backend (no metadata fields). */
export interface RedactionInput {
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Body for creating a protected copy. `original_file` is required. */
export interface CreateProtectedCopyBody {
  original_file: number;
  title?: string;
  protection_type: ProtectionType;
  watermark_text?: string;
  watermark_position?: WatermarkPosition;
  watermark_opacity?: number;
  redactions?: RedactionInput[];
}

/**
 * Body for editing a draft/failed protected copy. Every field is optional;
 * only draft and failed copies can be patched (the backend enforces this).
 */
export interface UpdateProtectedCopyBody {
  title?: string;
  protection_type?: ProtectionType;
  watermark_text?: string;
  watermark_position?: WatermarkPosition;
  watermark_opacity?: number;
  redactions?: RedactionInput[];
}

/** Response from adding a ready protected copy to a sharing room. */
export interface AddProtectedCopyToRoomResponse {
  room_id: number;
  item_id: number;
  protected_copy: ProtectedCopy;
}
