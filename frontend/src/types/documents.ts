// Types for the DueNest documents API (GET/POST/PATCH/DELETE /api/v1/documents/).
// These mirror the backend DocumentSerializer.

export type DocumentStatus = "active" | "expired" | "renewal_due" | "archived";

export type DocumentComputedStatus =
  | "active"
  | "expiring_soon"
  | "renewal_due"
  | "expired"
  | "missing_file"
  | "missing_expiry_date"
  | "needs_attention"
  | "archived";

export type DocumentUrgencyLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

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
  computed_status: DocumentComputedStatus;
  status_label: string;
  status_reason: string;
  urgency_level: DocumentUrgencyLevel;
  days_until_expiry: number | null;
  days_until_renewal: number | null;
  is_expired: boolean;
  is_expiring_soon: boolean;
  is_renewal_due: boolean;
  has_file: boolean;
  missing_expiry_date: boolean;
  missing_file: boolean;
  needs_attention: boolean;
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

export type DocumentOrdering =
  | "expiry_date"
  | "-expiry_date"
  | "created_at"
  | "-created_at"
  | "updated_at"
  | "-updated_at"
  | "title"
  | "-title";

export interface DocumentListParams {
  search?: string;
  status?: DocumentStatus;
  computed_status?: DocumentComputedStatus;
  category?: number | string;
  document_type?: string;
  country?: string;
  issuer?: string;
  has_file?: boolean;
  missing_file?: boolean;
  missing_expiry_date?: boolean;
  needs_attention?: boolean;
  expiry_from?: string;
  expiry_to?: string;
  expiring_within_days?: number;
  ordering?: DocumentOrdering;
}

export interface AttentionNeededResponse {
  count: number;
  items: DocumentRecord[];
}

export type ReminderTriggerType =
  | "before_expiry"
  | "before_renewal_date"
  | "on_expiry";

export interface DocumentReminderRule {
  id: number;
  owner: number;
  document: number;
  trigger_type: ReminderTriggerType;
  days_before: number;
  is_enabled: boolean;
  upcoming_reminder_date: string | null;
  date_source: "expiry_date" | "renewal_date";
  created_at: string;
  updated_at: string;
}

export interface CreateReminderRuleRequest {
  trigger_type: ReminderTriggerType;
  days_before?: number;
  is_enabled?: boolean;
}

export type UpdateReminderRuleRequest = Partial<CreateReminderRuleRequest>;

export interface UpcomingRemindersResponse {
  count: number;
  items: DocumentReminderRule[];
}

/** DRF PageNumberPagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
