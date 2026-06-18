// Document files API helpers. Reuse the shared `apiFetch` (token + error
// handling) so auth logic lives in one place. Uploads use FormData; downloads
// use an authenticated blob fetch (the download endpoint needs the Bearer
// token, so a plain <a href> would not work).

import { API_BASE_URL, ApiError, apiFetch, readCookie } from "./api";
import { getAccessToken } from "./auth";

const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "duenest_csrftoken";

/**
 * Upload a file to the File Inbox with progress events. Mirrors apiFetch's
 * cookie auth (credentials + X-CSRFToken) but uses XMLHttpRequest so we can
 * report real per-file upload progress (fetch has no upload progress events).
 */
export function uploadInboxFileWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DocumentFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/files/`);
    xhr.withCredentials = true; // send the HttpOnly auth cookies
    xhr.setRequestHeader("Accept", "application/json");
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
    // Do NOT set Content-Type — the browser adds the multipart boundary.

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as DocumentFile);
      } else {
        const message =
          data && typeof data === "object" && "detail" in data
            ? String((data as Record<string, unknown>).detail)
            : "Could not upload file.";
        reject(new ApiError(message, xhr.status, data));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("Unable to reach the server. Please try again.", 0, null));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}
import type {
  CreateShareLinkPayload,
  CreatedDocumentFileShareLink,
  DocumentFile,
  DocumentFileActivity,
  DocumentFileShareLink,
  PublicSharedFileMetadata,
} from "@/types/document-files";
import type { DocumentRecord, Paginated } from "@/types/documents";

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
export const ACCEPT_ATTR = "image/*,application/pdf,.doc,.docx";
export const SCAN_ACCEPT_ATTR = "image/*";

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

export async function fetchBlob(
  path: string,
  {
    auth = false,
    accessCode,
    headers: extraHeaders,
    fallbackError,
  }: {
    auth?: boolean;
    accessCode?: string;
    headers?: Record<string, string>;
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
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

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
    throw new ApiError(
      getApiErrorMessage(data, fallbackError),
      response.status,
      data,
    );
  }

  return response.blob();
}

export function saveBlob(blob: Blob, filename: string) {
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

export function getFileInbox(): Promise<Paginated<DocumentFile>> {
  return apiFetch<Paginated<DocumentFile>>("/files/", { auth: true });
}

export function uploadInboxFile(file: File): Promise<DocumentFile> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<DocumentFile>("/files/", {
    method: "POST",
    body: formData,
    auth: true,
  });
}

export function getTrashedInboxFiles(): Promise<Paginated<DocumentFile>> {
  return apiFetch<Paginated<DocumentFile>>("/files/trash/", { auth: true });
}

export function deleteInboxFile(fileId: number): Promise<void> {
  return apiFetch<void>(`/files/${fileId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function restoreInboxFile(fileId: number): Promise<DocumentFile> {
  return apiFetch<DocumentFile>(`/files/${fileId}/restore/`, {
    method: "POST",
    auth: true,
  });
}

export function permanentlyDeleteInboxFile(fileId: number): Promise<void> {
  return apiFetch<void>(`/files/${fileId}/permanent-delete/`, {
    method: "DELETE",
    auth: true,
  });
}

export function attachInboxFileToDocument(
  fileId: number,
  documentId: number,
): Promise<DocumentFile> {
  return apiFetch<DocumentFile>(`/files/${fileId}/attach-document/`, {
    method: "POST",
    body: { document: documentId },
    auth: true,
  });
}

/** Whether the user already has a non-trashed file with this name. */
export function checkInboxDuplicate(
  filename: string,
): Promise<{ exists: boolean; count: number }> {
  return apiFetch<{ exists: boolean; count: number }>(
    `/files/check-duplicate/?filename=${encodeURIComponent(filename)}`,
    { auth: true },
  );
}

export type DuplicateLevel = "exact" | "possible" | "name" | "none";

export interface DuplicateMatch {
  id: number;
  file_uuid: string;
  original_filename: string;
  file_size: number;
  content_type: string;
  created_at: string;
  document_id: number | null;
  reasons: string[];
}

export interface DuplicateCheckResult {
  exists: boolean;
  count: number;
  level: DuplicateLevel;
  matches: DuplicateMatch[];
}

/**
 * SHA-256 of a blob as lowercase hex, matching the backend's stored checksum.
 * Returns "" if Web Crypto isn't available (insecure context) so callers can
 * fall back to name/size matching without breaking.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return "";
  try {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/** Rich duplicate check by checksum (exact) → name+size (possible) → name. */
export function checkDuplicateFile(
  file: { name: string; size: number },
  checksum?: string,
): Promise<DuplicateCheckResult> {
  const params = new URLSearchParams({ filename: file.name });
  if (Number.isFinite(file.size)) params.set("size", String(file.size));
  if (checksum) params.set("checksum", checksum);
  return apiFetch<DuplicateCheckResult>(
    `/files/check-duplicate/?${params.toString()}`,
    { auth: true },
  );
}

export function createDocumentFromInboxFile(
  fileId: number,
  payload: {
    title?: string;
    document_type?: string;
    notes?: string;
    category?: number | string;
    expiry_date?: string;
    issue_date?: string;
    country?: string;
    reference_number?: string;
  },
): Promise<{ document: DocumentRecord; file: DocumentFile }> {
  return apiFetch<{ document: DocumentRecord; file: DocumentFile }>(
    `/files/${fileId}/create-document/`,
    {
      method: "POST",
      body: payload,
      auth: true,
    },
  );
}

/**
 * Move a file to trash (soft delete). DELETE soft-trashes on the backend — the
 * file is hidden, any existing share links stop working, and it can be restored
 * or permanently deleted from the Trash.
 */
export function deleteDocumentFile(
  documentId: number,
  fileId: number,
): Promise<void> {
  return apiFetch<void>(`/documents/${documentId}/files/${fileId}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** List a document's trashed files. */
export function getTrashedDocumentFiles(
  documentId: number,
): Promise<Paginated<DocumentFile>> {
  return apiFetch<Paginated<DocumentFile>>(
    `/documents/${documentId}/files/trash/`,
    { auth: true },
  );
}

/** Restore a trashed file. */
export function restoreDocumentFile(
  documentId: number,
  fileId: number,
): Promise<DocumentFile> {
  return apiFetch<DocumentFile>(
    `/documents/${documentId}/files/${fileId}/restore/`,
    { method: "POST", auth: true },
  );
}

/** Permanently delete a trashed file. Irreversible. */
export function permanentlyDeleteDocumentFile(
  documentId: number,
  fileId: number,
): Promise<void> {
  return apiFetch<void>(
    `/documents/${documentId}/files/${fileId}/permanent-delete/`,
    { method: "DELETE", auth: true },
  );
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

export function getInboxFilePreviewBlob(fileId: number): Promise<Blob> {
  return fetchBlob(`/files/${fileId}/preview/`, {
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

export function getInboxFileDownloadBlob(fileId: number): Promise<Blob> {
  return fetchBlob(`/files/${fileId}/download/`, {
    auth: true,
    fallbackError: "Could not download this file.",
  });
}

/**
 * Download a file through the authenticated endpoint and trigger a browser
 * "save" using its original filename.
 */
export async function downloadDocumentFile(file: DocumentFile): Promise<void> {
  const blob =
    file.document === null
      ? await getInboxFileDownloadBlob(file.id)
      : await getDocumentFileDownloadBlob(file.document, file.id);
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

// After the viewer verifies an access code, the backend returns a short-lived
// grant. We send that grant as a `?grant=` query param on later requests rather
// than re-sending the raw code. The query param (vs a custom header) also avoids
// a CORS preflight on the cross-origin preview/download requests.
function withGrant(path: string, grant?: string): string {
  if (!grant) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}grant=${encodeURIComponent(grant)}`;
}

export interface SharedFileAccessGrant {
  detail: string;
  grant?: string;
  grant_expires_in?: number;
}

export function getSharedFileMetadata(
  token: string,
  grant?: string,
): Promise<PublicSharedFileMetadata> {
  return apiFetch<PublicSharedFileMetadata>(
    withGrant(`/share/files/${encodeURIComponent(token)}/`, grant),
  );
}

export function verifySharedFileAccessCode(
  token: string,
  accessCode: string,
): Promise<SharedFileAccessGrant> {
  return apiFetch<SharedFileAccessGrant>(
    `/share/files/${encodeURIComponent(token)}/verify-code/`,
    {
      method: "POST",
      body: { access_code: accessCode },
    },
  );
}

export function getSharedFilePreviewBlob(
  token: string,
  grant?: string,
): Promise<Blob> {
  return fetchBlob(
    withGrant(`/share/files/${encodeURIComponent(token)}/preview/`, grant),
    { fallbackError: "Could not preview this shared file." },
  );
}

export function getSharedFileDownloadBlob(
  token: string,
  grant?: string,
): Promise<Blob> {
  return fetchBlob(
    withGrant(`/share/files/${encodeURIComponent(token)}/download/`, grant),
    { fallbackError: "Could not download this shared file." },
  );
}

export async function downloadSharedFile(
  token: string,
  filename: string,
  grant?: string,
): Promise<void> {
  const blob = await getSharedFileDownloadBlob(token, grant);
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
