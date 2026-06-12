// Document files API helpers. Reuse the shared `apiFetch` (token + error
// handling) so auth logic lives in one place. Uploads use FormData; downloads
// use an authenticated blob fetch (the download endpoint needs the Bearer
// token, so a plain <a href> would not work).

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type { DocumentFile } from "@/types/document-files";
import type { Paginated } from "@/types/documents";

// Frontend validation mirrors the backend rules (backend remains the source
// of truth). See backend apps/documents/constants.py.
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".doc",
  ".docx",
] as const;
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(",");

export function getDocumentFiles(
  documentId: number,
): Promise<Paginated<DocumentFile>> {
  return apiFetch<Paginated<DocumentFile>>(`/documents/${documentId}/files/`, {
    auth: true,
  });
}

export function getDocumentFile(
  documentId: number,
  fileId: number,
): Promise<DocumentFile> {
  return apiFetch<DocumentFile>(
    `/documents/${documentId}/files/${fileId}/`,
    { auth: true },
  );
}

export function uploadDocumentFile(
  documentId: number,
  file: File,
): Promise<DocumentFile> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<DocumentFile>(`/documents/${documentId}/files/`, {
    method: "POST",
    body: formData,
    auth: true,
  });
}

export function deleteDocumentFile(
  documentId: number,
  fileId: number,
): Promise<void> {
  return apiFetch<void>(`/documents/${documentId}/files/${fileId}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** Build the controlled download endpoint URL (needs an auth header to use). */
export function getDocumentFileDownloadUrl(
  documentId: number,
  fileId: number,
): string {
  return `${API_BASE_URL}/documents/${documentId}/files/${fileId}/download/`;
}

/**
 * Download a file through the authenticated endpoint and trigger a browser
 * "save" using its original filename.
 */
export async function downloadDocumentFile(file: DocumentFile): Promise<void> {
  const url = getDocumentFileDownloadUrl(file.document, file.id);
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0, null);
  }
  if (!response.ok) {
    throw new ApiError("Could not download this file.", response.status, null);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.original_filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

// ---- Display + validation helpers -----------------------------------------

/** Human-readable file size, e.g. 184213 → "180 KB". */
export function formatFileSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Client-side pre-upload check (UX only). Returns an error message, or null
 * when the file looks acceptable.
 */
export function validateFile(file: File): string | null {
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File is too large. Maximum size is 10 MB.";
  }
  if (file.size === 0) {
    return "This file appears to be empty.";
  }
  return null;
}
