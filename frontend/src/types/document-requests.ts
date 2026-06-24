// Types for Document Request Links V1 (apps.document_requests). Owner-scoped.
// An owner creates a secure link asking someone (often without an account) to
// upload a single document — a passport, transcript, certificate, or
// recommendation letter. The recipient uploads via the PUBLIC token route; the
// owner reviews (accept / reject / needs-replacement) and can save the accepted
// file to their vault or attach it to an application pack.
//
// Nothing is accepted automatically: the owner always reviews before anything
// enters their vault. The public page never exposes the owner's private file
// download URL.

/** Lifecycle status of a document request link. */
export type DocumentRequestStatus =
  | "draft"
  | "requested"
  | "opened"
  | "uploaded"
  | "under_review"
  | "accepted"
  | "rejected"
  | "needs_replacement"
  | "expired"
  | "cancelled";

/** Review actions an owner can take on an uploaded request. */
export type DocumentRequestReviewAction =
  | "accept"
  | "reject"
  | "needs_replacement";

/**
 * The private file reference for an uploaded request. `download_url` is the
 * PRIVATE owner route (`/api/v1/files/{id}/download/`) — only ever used by the
 * authenticated owner via the blob-download helper, NEVER linked on the public
 * page.
 */
export interface DocumentRequestFileInfo {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  /** PRIVATE owner-only download route. Do not surface publicly. */
  download_url: string;
}

/** A single document request link owned by the current user. */
export interface DocumentRequestLink {
  id: number;
  owner: number;
  status: DocumentRequestStatus;
  /** Opaque token used in the public upload URL. */
  token: string;
  /** The full public upload URL the recipient visits. */
  upload_url: string;

  requested_document_title: string;
  requested_document_type: string;
  instructions: string;

  recipient_name: string;
  recipient_email: string;
  recipient_message: string;

  due_date: string | null;
  expires_at: string | null;
  max_uploads: number;
  upload_count: number;

  linked_bundle: number | null;
  linked_application: number | null;
  linked_requirement: number | null;

  uploaded_file: number | null;
  uploaded_file_info: DocumentRequestFileInfo | null;
  created_document: number | null;

  rejection_reason: string;
  owner_note: string;

  is_expired: boolean;
  can_upload: boolean;

  opened_at: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

/** List response for the owner's document requests. */
export interface DocumentRequestListResponse {
  requests: DocumentRequestLink[];
  count: number;
}

/** Body for creating a document request link. Only the title is required. */
export interface CreateDocumentRequestBody {
  requested_document_title: string;
  requested_document_type?: string;
  instructions?: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_message?: string;
  due_date?: string;
  expires_at?: string;
  linked_bundle?: number;
  linked_application?: number;
  linked_requirement?: number;
  owner_note?: string;
  /** When true and a recipient_email is set, the backend emails the link. */
  send_email?: boolean;
}

/** Body for editing a request's metadata (no status transitions here). */
export interface UpdateDocumentRequestBody {
  requested_document_title?: string;
  requested_document_type?: string;
  instructions?: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_message?: string;
  due_date?: string | null;
  expires_at?: string | null;
  owner_note?: string;
}

/** Response from the send-email action. */
export interface SendDocumentRequestResponse {
  sent: boolean;
  request: DocumentRequestLink;
}

/** Response from saving an accepted request's file to the vault. */
export interface SaveToVaultResponse {
  document_id: number;
  request: DocumentRequestLink;
}

/** Response from attaching an accepted request's file to a pack requirement. */
export interface AttachToPackResponse {
  requirement_id: number;
  bundle_id: number;
  readiness_score: number;
  request: DocumentRequestLink;
}

// ---- Public (no-auth) shapes ------------------------------------------------

/** Why a public request can't currently be uploaded to. */
export type PublicDocumentRequestState =
  | "ok"
  | "expired"
  | "cancelled"
  | "closed"
  | "not_found";

/**
 * The PUBLIC view of a request, returned by the token route with NO auth. It
 * deliberately omits the owner's identity beyond a display name and never
 * includes any private file URL.
 */
export interface PublicDocumentRequest {
  requested_document_title: string;
  requested_document_type: string;
  instructions: string;
  recipient_name: string;
  recipient_message: string;
  due_date: string | null;
  expires_at: string | null;
  status: DocumentRequestStatus;
  can_upload: boolean;
  /** Display name of the person who requested the document. */
  from_name: string;
  /** Optional app/organization name shown for context. */
  app_name: string;
  state: PublicDocumentRequestState;
}

/** Response from a successful public upload. */
export interface PublicUploadResponse {
  ok: true;
  detail: string;
}
