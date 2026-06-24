// Client for Document Request Links V1 (apps.document_requests).
//
// Two surfaces:
//   * Owner endpoints (authenticated) reuse the shared `apiFetch` (cookie auth +
//     CSRF + error handling).
//   * Public endpoints (token only, NO auth) talk to `/public/document-request-links/`.
//     The public upload must NOT send any auth header — it is an anonymous,
//     unauthenticated multipart POST, mirroring how other public pages call the
//     API. Progress uses XMLHttpRequest (fetch has no upload progress events),
//     but unlike the owner uploads it sends no credentials and no Authorization
//     header.
//
// Trust model: nothing is accepted automatically. The owner reviews every
// upload, and the public page never receives a private file download URL.

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import type {
  AttachToPackResponse,
  CreateDocumentRequestBody,
  DocumentRequestLink,
  DocumentRequestListResponse,
  DocumentRequestReviewAction,
  DocumentRequestStatus,
  PublicDocumentRequest,
  PublicUploadResponse,
  SaveToVaultResponse,
  SendDocumentRequestResponse,
  UpdateDocumentRequestBody,
} from "@/types/document-requests";

// ---- Owner API (authenticated) ---------------------------------------------

/** List the owner's document requests, optionally filtered by status. */
export function getDocumentRequests(
  status?: DocumentRequestStatus,
): Promise<DocumentRequestListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<DocumentRequestListResponse>(`/document-requests/${query}`);
}

/** Read a single document request. */
export function getDocumentRequest(id: number): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/`);
}

/** Create a new document request link. */
export function createDocumentRequest(
  body: CreateDocumentRequestBody,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>("/document-requests/", {
    method: "POST",
    body,
  });
}

/** Edit a request's metadata (title, instructions, recipient, dates, note). */
export function updateDocumentRequest(
  id: number,
  patch: UpdateDocumentRequestBody,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

/** Email the secure link to the recipient (requires a recipient_email). */
export function sendDocumentRequest(
  id: number,
): Promise<SendDocumentRequestResponse> {
  return apiFetch<SendDocumentRequestResponse>(
    `/document-requests/${id}/send/`,
    { method: "POST" },
  );
}

/** Cancel a request so it stops accepting uploads. */
export function cancelDocumentRequest(
  id: number,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/cancel/`, {
    method: "POST",
  });
}

/**
 * Review an uploaded request. The single endpoint handles every action; the
 * dedicated /accept/, /reject/, /needs-replacement/ helpers below wrap it for
 * call-site clarity. Reject / needs-replacement carry a reason.
 */
export function reviewDocumentRequest(
  id: number,
  review: { action: DocumentRequestReviewAction; reason?: string },
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/review/`, {
    method: "POST",
    body: review,
  });
}

/** Accept the uploaded file. Never happens automatically — owner-triggered. */
export function acceptDocumentRequest(
  id: number,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/accept/`, {
    method: "POST",
  });
}

/** Reject the uploaded file with a reason. */
export function rejectDocumentRequest(
  id: number,
  reason: string,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(`/document-requests/${id}/reject/`, {
    method: "POST",
    body: { reason },
  });
}

/** Ask the recipient for a replacement upload, with a reason. */
export function needsReplacementDocumentRequest(
  id: number,
  reason: string,
): Promise<DocumentRequestLink> {
  return apiFetch<DocumentRequestLink>(
    `/document-requests/${id}/needs-replacement/`,
    { method: "POST", body: { reason } },
  );
}

/** Save an accepted request's file into the owner's vault as a document. */
export function saveRequestToVault(id: number): Promise<SaveToVaultResponse> {
  return apiFetch<SaveToVaultResponse>(
    `/document-requests/${id}/save-to-vault/`,
    { method: "POST" },
  );
}

/** Attach an accepted request's file to its linked pack requirement. */
export function attachRequestToPack(
  id: number,
): Promise<AttachToPackResponse> {
  return apiFetch<AttachToPackResponse>(
    `/document-requests/${id}/attach-to-pack/`,
    { method: "POST" },
  );
}

// ---- Public API (NO auth — token only) -------------------------------------

/**
 * Read the PUBLIC view of a request by token. No auth: this is the page an
 * unauthenticated recipient lands on. `apiFetch` sends cookie credentials, but
 * the endpoint ignores them — the token in the path is the only identifier, and
 * the response never includes private owner data.
 */
export function getPublicDocumentRequest(
  token: string,
): Promise<PublicDocumentRequest> {
  return apiFetch<PublicDocumentRequest>(
    `/public/document-request-links/${encodeURIComponent(token)}/`,
  );
}

/**
 * Upload a file to a public request by token, with optional progress.
 *
 * This is an ANONYMOUS upload: no Authorization header, no CSRF token, and no
 * credentials are attached. The token in the URL authorizes the upload, and the
 * recipient is (by design) not logged in. Mirrors `uploadFileItemWithProgress`'s
 * XHR progress handling but deliberately omits all auth.
 */
export function uploadPublicDocumentRequest(
  token: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PublicUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${API_BASE_URL}/public/document-request-links/${encodeURIComponent(token)}/upload/`,
    );
    // Anonymous: do NOT send cookies, CSRF, or an Authorization header.
    xhr.withCredentials = false;
    xhr.setRequestHeader("Accept", "application/json");
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
        resolve(data as PublicUploadResponse);
      } else {
        const message =
          data && typeof data === "object" && "detail" in data
            ? String((data as Record<string, unknown>).detail)
            : "We couldn't upload your file. Please try again.";
        reject(new ApiError(message, xhr.status, data));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError("Unable to reach the server. Please try again.", 0, null),
      );

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

// ---- Pure helpers (no DOM — unit-testable in the Node env) ------------------

/**
 * Status order for grouping the owner list. Roughly: live (waiting) → needs the
 * owner's attention (review) → resolved → ended.
 */
export const DOCUMENT_REQUEST_STATUS_ORDER: DocumentRequestStatus[] = [
  "draft",
  "requested",
  "opened",
  "uploaded",
  "under_review",
  "needs_replacement",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
];

/** Friendly, calm labels for each request status. */
export const DOCUMENT_REQUEST_STATUS_LABELS: Record<
  DocumentRequestStatus,
  string
> = {
  draft: "Draft",
  requested: "Sent",
  opened: "Opened",
  uploaded: "Uploaded",
  under_review: "Under review",
  needs_replacement: "Needs replacement",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Status tone for the canonical StatusBadge. */
export const DOCUMENT_REQUEST_STATUS_TONE: Record<
  DocumentRequestStatus,
  "success" | "warning" | "danger" | "info" | "trust" | "neutral"
> = {
  draft: "neutral",
  requested: "info",
  opened: "info",
  uploaded: "warning",
  under_review: "warning",
  needs_replacement: "warning",
  accepted: "success",
  rejected: "danger",
  expired: "danger",
  cancelled: "neutral",
};

/**
 * Coarse buckets for the owner page, in display order. "Needs you" surfaces the
 * uploads waiting for a review decision so the owner's next action is obvious.
 */
export type DocumentRequestBucket =
  | "needs_you"
  | "waiting"
  | "accepted"
  | "ended";

/** Bucket order + labels for grouped display. */
export const DOCUMENT_REQUEST_BUCKET_ORDER: DocumentRequestBucket[] = [
  "needs_you",
  "waiting",
  "accepted",
  "ended",
];

export const DOCUMENT_REQUEST_BUCKET_LABELS: Record<
  DocumentRequestBucket,
  string
> = {
  needs_you: "Needs your review",
  waiting: "Waiting on the recipient",
  accepted: "Accepted",
  ended: "Ended",
};

/** Map a status to its owner-page bucket. */
export function bucketForStatus(
  status: DocumentRequestStatus,
): DocumentRequestBucket {
  switch (status) {
    case "uploaded":
    case "under_review":
      return "needs_you";
    case "draft":
    case "requested":
    case "opened":
    case "needs_replacement":
      return "waiting";
    case "accepted":
      return "accepted";
    case "rejected":
    case "expired":
    case "cancelled":
      return "ended";
  }
}

/**
 * Group a list of requests into the owner-page buckets, in display order. Empty
 * buckets are omitted so callers render only what exists. Within a bucket,
 * input order is preserved (the list arrives newest-first from the API).
 */
export function groupRequestsByBucket(
  requests: DocumentRequestLink[],
): { bucket: DocumentRequestBucket; items: DocumentRequestLink[] }[] {
  return DOCUMENT_REQUEST_BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: requests.filter((r) => bucketForStatus(r.status) === bucket),
  })).filter((group) => group.items.length > 0);
}

/** Whether a status means the request still needs the recipient to act. */
export function isAwaitingRecipient(status: DocumentRequestStatus): boolean {
  return (
    status === "requested" ||
    status === "opened" ||
    status === "needs_replacement"
  );
}

/** Whether a status means an upload is waiting for the owner's review. */
export function isAwaitingReview(status: DocumentRequestStatus): boolean {
  return status === "uploaded" || status === "under_review";
}

/**
 * Build the absolute public upload URL for a token. Prefers the server-provided
 * `upload_url`; falls back to constructing one from the current origin (so the
 * copy-link button always has something to copy, even mid-render before a
 * refresh). Returns "" only when neither a URL nor an origin is available.
 */
export function buildPublicRequestUrl(
  request: Pick<DocumentRequestLink, "upload_url" | "token">,
  origin?: string,
): string {
  if (request.upload_url) return request.upload_url;
  if (!request.token) return "";
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/document-request/${request.token}`;
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

/** Friendly copy for a blocked / unavailable public request state. */
export function publicStateMessage(
  state: PublicDocumentRequest["state"],
): { title: string; description: string } {
  switch (state) {
    case "expired":
      return {
        title: "This request has expired",
        description:
          "The link is no longer accepting uploads. Ask the person who sent it for a new link.",
      };
    case "cancelled":
      return {
        title: "This request was cancelled",
        description:
          "The person who sent it is no longer collecting this document.",
      };
    case "closed":
      return {
        title: "This request is closed",
        description:
          "A document has already been received, so no more uploads are needed.",
      };
    case "not_found":
      return {
        title: "We couldn't find this request",
        description:
          "The link may be incorrect or has been removed. Double-check the link you were sent.",
      };
    case "ok":
    default:
      return {
        title: "Upload your document",
        description: "",
      };
  }
}
