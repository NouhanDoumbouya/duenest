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

/** Availability of an original / certified copy / translation. */
export type DocumentAvailability = "yes" | "no" | "unknown";

/** Owner-managed lifecycle status, separate from computed expiry status. */
export type DocumentLifecycleStatus =
  | "draft"
  | "collected"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "renewed"
  | "archived";

export type LastSafeActionStatus = "unknown" | "ok" | "approaching" | "passed";

/** A single factor in the confidence breakdown. */
export interface ConfidenceReason {
  key: string;
  label: string;
  met: boolean;
  weight: number;
  hint: string;
}

/** A shared document category (GET /api/v1/document-categories/). */
export interface DocumentCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

/** A user-owned tag (GET/POST /api/v1/document-tags/). */
export interface DocumentTag {
  id: number;
  owner: number;
  name: string;
  slug: string;
  color: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

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
  lifecycle_status: DocumentLifecycleStatus;
  custom_fields: Record<string, string>;
  tags: DocumentTag[];
  // Confidence / readiness.
  confidence_score: number;
  confidence_label: string;
  confidence_reasons: ConfidenceReason[];
  // Last safe action.
  last_safe_action_date: string | null;
  last_safe_action_override: string | null;
  days_until_last_safe_action: number | null;
  last_safe_action_status: LastSafeActionStatus;
  last_safe_action_is_manual: boolean;
  is_shared_externally: boolean;
  in_bundle: boolean;
  in_emergency: boolean;
  is_pinned: boolean;
  // Physical document location — "where is the original?" details.
  physical_location_label: string;
  physical_location_details: string;
  original_available: DocumentAvailability;
  certified_copy_available: DocumentAvailability;
  translation_available: DocumentAvailability;
  notes_about_original: string;
  // Soft delete (trash).
  is_trashed: boolean;
  trashed_at: string | null;
  days_until_permanent_deletion: number | null;
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
  lifecycle_status?: DocumentLifecycleStatus;
  is_pinned?: boolean;
  custom_fields?: Record<string, string>;
  tag_ids?: number[];
  last_safe_action_override?: string | null;
  physical_location_label?: string;
  physical_location_details?: string;
  original_available?: DocumentAvailability;
  certified_copy_available?: DocumentAvailability;
  translation_available?: DocumentAvailability;
  notes_about_original?: string;
}

/** Partial update — every field is optional. */
export type UpdateDocumentRequest = Partial<CreateDocumentRequest>;

export interface DocumentCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  is_system: boolean;
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
  shared?: boolean;
  in_bundle?: boolean;
  pinned?: boolean;
  expiry_from?: string;
  expiry_to?: string;
  expiring_within_days?: number;
  tag?: number | string;
  lifecycle_status?: DocumentLifecycleStatus;
  ordering?: DocumentOrdering;
  /** Override the page size (capped server-side). Useful for count-only or
   * small-preview requests so a full page of heavy objects isn't serialized. */
  page_size?: number;
  /** 1-based page number for paginated listing (default 1). */
  page?: number;
}

export interface AttentionNeededResponse {
  count: number;
  items: DocumentRecord[];
}

/** GET /api/v1/documents/missing-summary/ */
export interface MissingScanItem {
  id: number;
  title: string;
  document_type?: string;
  computed_status?: DocumentComputedStatus;
  status_label?: string;
  confidence_score?: number;
  missing_required_count?: number;
  readiness_score?: number;
}

export interface MissingScanGroup {
  key: string;
  label: string;
  hint: string;
  fix_target: "document" | "bundle";
  items: MissingScanItem[];
}

export interface MissingScanResponse {
  total: number;
  groups: MissingScanGroup[];
}

/** GET /api/v1/documents/:id/activity/ — merged document + file/share events. */
export interface DocumentActivityEvent {
  id: string;
  action: string;
  title: string;
  description: string;
  actor_type: string;
  timestamp: string;
  related_file: number | null;
  related_share: number | null;
  related_checklist: number | null;
  related_bundle: number | null;
  related_proof: number | null;
  metadata: Record<string, unknown>;
}

export interface DocumentActivityResponse {
  count: number;
  items: DocumentActivityEvent[];
}

/** GET /api/v1/documents/health-overview/ */
export interface HealthOverviewItem {
  id: number;
  title: string;
  document_type: string;
  computed_status: DocumentComputedStatus;
  status_label: string;
  urgency_level: DocumentUrgencyLevel;
  lifecycle_status: DocumentLifecycleStatus;
  confidence_score: number;
  confidence_label: string;
}

export interface HealthOverviewGroup {
  key: string;
  label: string;
  description: string;
  count: number;
  items: HealthOverviewItem[];
}

export interface HealthOverviewResponse {
  total: number;
  groups: HealthOverviewGroup[];
}

export type ReminderTriggerType =
  | "before_expiry"
  | "before_renewal_date"
  | "on_expiry";

export interface DocumentReminderRule {
  id: number;
  owner: number;
  document: number;
  document_title: string | null;
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
