// Types for the DueNest documents API (GET/POST/PATCH/DELETE /api/v1/documents/).
// These mirror the backend DocumentSerializer.

export type DocumentStatus = "active" | "expired" | "renewal_due" | "archived";

export interface DocumentRecord {
  id: number;
  owner: number;
  category: number | null;
  category_name: string | null;
  title: string;
  document_type: string;
  issuer: string;
  country: string;
  reference_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  notes: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Fields a client may send when creating a document. `owner` is set by the
 * backend from the request user and must never be sent.
 */
export interface CreateDocumentRequest {
  title: string;
  document_type?: string;
  issuer?: string;
  country?: string;
  reference_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  renewal_date?: string | null;
  notes?: string;
  status?: DocumentStatus;
  category?: number | null;
}

/** Partial update — every field is optional. */
export type UpdateDocumentRequest = Partial<CreateDocumentRequest>;

export interface DocumentCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/** DRF PageNumberPagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
