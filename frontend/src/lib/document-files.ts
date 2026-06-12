// Document files API helpers. Reuse the shared `apiFetch` (token + error
// handling) so auth logic lives in one place. Uploads use FormData; downloads
// use an authenticated blob fetch (the download endpoint needs the Bearer
// token, so a plain <a href> would not work).

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  CreateShareLinkPayload,
  CreatedDocumentFileShareLink,
  DocumentFile,
  DocumentFileActivity,
  DocumentFileShareLink,
  PublicSharedFileMetadata,
} from "@/types/document-files";
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

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

async function fetchBlob(
  path: string,
  {
    auth = false,
    accessCode,
    fallbackError,
  }: {
    auth?: boolean;
    accessCode?: string;
    fallbackError: string;
  },
): Promise<Blob> {
  const headers = new Headers();
  headers.set("Accept", "*/*");

  if (auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (accessCode) headers.set("X-Access-Code", accessCode);

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
    throw new ApiError(
      getApiErrorMessage(data, fallbackError),
      response.status,
      data,
    );
  }

  return response.blob();
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

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

export function getDocumentFilePreviewUrl(
  documentId: number,
  fileId: number,
): string {
  return `${API_BASE_URL}/documents/${documentId}/files/${fileId}/preview/`;
}

export function getDocumentFilePreviewBlob(
  documentId: number,
  fileId: number,
): Promise<Blob> {
  return fetchBlob(`/documents/${documentId}/files/${fileId}/preview/`, {
    auth: true,
    fallbackError: "Could not preview this file.",
  });
}

export function getDocumentFileDownloadBlob(
  documentId: number,
  fileId: number,
): Promise<Blob> {
  return fetchBlob(`/documents/${documentId}/files/${fileId}/download/`, {
    auth: true,
    fallbackError: "Could not download this file.",
  });
}

/**
 * Download a file through the authenticated endpoint and trigger a browser
 * "save" using its original filename.
 */
export async function downloadDocumentFile(file: DocumentFile): Promise<void> {
  const blob = await getDocumentFileDownloadBlob(file.document, file.id);
  saveBlob(blob, file.original_filename);
}

export function isPreviewableDocumentFile(file: DocumentFile): boolean {
  return Boolean(file.is_previewable);
}

// ---- Share links + activity ------------------------------------------------

export function listDocumentFileShareLinks(
  documentId: number,
  fileId: number,
): Promise<DocumentFileShareLink[]> {
  return apiFetch<DocumentFileShareLink[]>(
    `/documents/${documentId}/files/${fileId}/share-links/`,
    { auth: true },
  );
}

export function createDocumentFileShareLink(
  documentId: number,
  fileId: number,
  payload: CreateShareLinkPayload,
): Promise<CreatedDocumentFileShareLink> {
  return apiFetch<CreatedDocumentFileShareLink>(
    `/documents/${documentId}/files/${fileId}/share-links/`,
    {
      method: "POST",
      body: payload,
      auth: true,
    },
  );
}

export function revokeDocumentFileShareLink(
  documentId: number,
  fileId: number,
  shareId: number,
): Promise<DocumentFileShareLink> {
  return apiFetch<DocumentFileShareLink>(
    `/documents/${documentId}/files/${fileId}/share-links/${shareId}/revoke/`,
    {
      method: "POST",
      auth: true,
    },
  );
}

export function getDocumentFileActivity(
  documentId: number,
  fileId: number,
): Promise<DocumentFileActivity[]> {
  return apiFetch<DocumentFileActivity[]>(
    `/documents/${documentId}/files/${fileId}/activity/`,
    { auth: true },
  );
}

// ---- Public shared-file helpers -------------------------------------------

export function getSharedFileMetadata(
  token: string,
  accessCode?: string,
): Promise<PublicSharedFileMetadata> {
  const headers = accessCode ? { "X-Access-Code": accessCode } : undefined;
  return apiFetch<PublicSharedFileMetadata>(
    `/share/files/${encodeURIComponent(token)}/`,
    { headers },
  );
}

export function verifySharedFileAccessCode(
  token: string,
  accessCode: string,
): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(
    `/share/files/${encodeURIComponent(token)}/verify-code/`,
    {
      method: "POST",
      body: { access_code: accessCode },
    },
  );
}

export function getSharedFilePreviewBlob(
  token: string,
  accessCode?: string,
): Promise<Blob> {
  return fetchBlob(`/share/files/${encodeURIComponent(token)}/preview/`, {
    accessCode,
    fallbackError: "Could not preview this shared file.",
  });
}

export function getSharedFileDownloadBlob(
  token: string,
  accessCode?: string,
): Promise<Blob> {
  return fetchBlob(`/share/files/${encodeURIComponent(token)}/download/`, {
    accessCode,
    fallbackError: "Could not download this shared file.",
  });
}

export async function downloadSharedFile(
  token: string,
  filename: string,
  accessCode?: string,
): Promise<void> {
  const blob = await getSharedFileDownloadBlob(token, accessCode);
  saveBlob(blob, filename);
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
