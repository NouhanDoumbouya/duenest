// Types for the Document Renewal Workspace API: checklists, checklist
// templates, bundles, timeline, and OCR-assisted extraction. These mirror the
// backend serializers in apps/documents/serializers.py.

import type { DocumentRecord } from "./documents";

// ---- Checklist templates ---------------------------------------------------

export type ChecklistType =
  | "renewal"
  | "application"
  | "travel"
  | "insurance"
  | "custom";

export interface ChecklistItemTemplate {
  id: number;
  title: string;
  description: string;
  is_required: boolean;
  sort_order: number;
  suggested_due_offset_days: number | null;
  metadata: Record<string, unknown>;
}

export interface ChecklistTemplate {
  id: number;
  title: string;
  description: string;
  document_type: string;
  use_case: string;
  checklist_type: ChecklistType;
  country: string;
  is_system_template: boolean;
  is_active: boolean;
  sort_order: number;
  slug: string | null;
  item_count: number;
  item_templates: ChecklistItemTemplate[];
  created_at: string;
  updated_at: string;
}

// ---- Checklists ------------------------------------------------------------

export type ChecklistStatus = "not_started" | "in_progress" | "completed";
export type ChecklistItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

export interface ChecklistItem {
  id: number;
  owner: number;
  checklist: number;
  title: string;
  description: string;
  is_required: boolean;
  status: ChecklistItemStatus;
  due_date: string | null;
  linked_document: number | null;
  linked_file: number | null;
  completed_at: string | null;
  sort_order: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistProgress {
  percent: number;
  status: ChecklistStatus;
  total_items: number;
  completed_items: number;
  skipped_items: number;
  required_items: number;
  required_completed: number;
  required_incomplete: number;
}

export interface Checklist {
  id: number;
  owner: number;
  document: number | null;
  bundle: number | null;
  template: number | null;
  title: string;
  description: string;
  checklist_type: ChecklistType;
  status: ChecklistStatus;
  progress_percent: number;
  due_date: string | null;
  progress: ChecklistProgress;
  items: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateChecklistRequest {
  title: string;
  description?: string;
  checklist_type?: ChecklistType;
  due_date?: string | null;
  bundle?: number | null;
}

export interface CreateChecklistFromTemplateRequest {
  template: number;
  title?: string;
  due_date?: string | null;
  bundle?: number | null;
}

export interface CreateChecklistItemRequest {
  title: string;
  description?: string;
  is_required?: boolean;
  status?: ChecklistItemStatus;
  due_date?: string | null;
  linked_document?: number | null;
  linked_file?: number | null;
  notes?: string;
}

export type UpdateChecklistItemRequest = Partial<CreateChecklistItemRequest>;

// ---- Bundles ---------------------------------------------------------------

export type BundleType =
  | "renewal"
  | "application"
  | "travel"
  | "emergency"
  | "scholarship"
  | "insurance"
  | "custom";

export type BundleStatus =
  | "draft"
  | "in_progress"
  | "ready"
  | "submitted"
  | "completed"
  | "archived";

export type RequirementType =
  | "document"
  | "file"
  | "proof"
  | "payment"
  | "form"
  | "other";

export type RequirementStatus =
  | "missing"
  | "attached"
  | "completed"
  | "skipped";

export interface BundleRequirement {
  id: number;
  owner: number;
  bundle: number;
  title: string;
  description: string;
  is_required: boolean;
  requirement_type: RequirementType;
  expected_document_type: string;
  linked_document: number | null;
  linked_file: number | null;
  status: RequirementStatus;
  is_satisfied: boolean;
  due_date: string | null;
  sort_order: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BundleReadiness {
  score: number;
  is_ready: boolean;
  total_requirements: number;
  required_total: number;
  required_satisfied: number;
  required_missing: number;
  optional_total: number;
  optional_satisfied: number;
  missing_required_titles: string[];
}

/** Application Pack Readiness V1 — rich deterministic payload from
 *  `GET /document-bundles/{id}/readiness/` (a superset of BundleReadiness). */
export type PackRequirementStatus =
  | "satisfied"
  | "missing"
  | "expired"
  | "expiring_soon"
  | "needs_review";

export interface PackRequirement {
  requirement_id: number;
  title: string;
  description: string;
  requirement_type: string;
  is_required: boolean;
  expected_document_type: string | null;
  status: PackRequirementStatus;
  document_id: number | null;
  document_title: string | null;
  expiry_date: string | null;
  days_until_expiry: number | null;
}

export interface PackReadinessWarning {
  type: "expired" | "expiring_soon" | "needs_review";
  severity: "critical" | "warning";
  message: string;
  document_id: number | null;
  requirement_id: number;
  action: { type: string; label: string };
}

export interface PackReadinessAction {
  type: string;
  label: string;
  description: string;
  priority: "high" | "medium" | "low";
  bundle_id: number;
  requirement_id?: number;
  document_id?: number;
}

export interface PackReadiness extends BundleReadiness {
  pack_id: number;
  name: string;
  base_score: number;
  label: string;
  has_checklist: boolean;
  is_ready_to_share: boolean;
  target_date: string | null;
  status: string;
  summary: {
    required_count: number;
    satisfied_count: number;
    missing_count: number;
    warning_count: number;
    expired_count: number;
    expiring_soon_count: number;
  };
  required_documents: PackRequirement[];
  satisfied_requirements: PackRequirement[];
  missing_requirements: PackRequirement[];
  attached_documents: PackRequirement[];
  warnings: PackReadinessWarning[];
  next_actions: PackReadinessAction[];
}

export interface PackReadinessSummaryRow {
  pack_id: number;
  name: string;
  score: number;
  label: string;
  is_ready_to_share: boolean;
  summary: PackReadiness["summary"];
  target_date: string | null;
  status: string;
}

export interface PackReadinessSummary {
  total_packs: number;
  ready_packs: number;
  needs_attention_packs: number;
  total_missing_required: number;
  packs: PackReadinessSummaryRow[];
}

// ---- Requirement Link → Checklist import -----------------------------------

export interface RequirementImportDoc {
  title: string;
  description: string;
  required: boolean;
  source_snippet: string;
  source_url: string;
}

export interface RequirementImportDeadline {
  title: string;
  date: string | null;
  description: string;
  source_snippet: string;
}

export interface RequirementImportNote {
  text: string;
  source_snippet: string;
}

export interface RequirementImportWarning {
  type: string;
  message: string;
}

/** Response from POST .../requirements/import-link/ (extract step). */
export interface RequirementImportResult {
  available?: boolean;
  reason?: string;
  message?: string;
  draft_id?: number;
  status?: string;
  credits_charged?: number;
  title?: string;
  summary?: string;
  confidence?: "high" | "medium" | "low";
  source_url?: string;
  page_title?: string;
  required_documents?: RequirementImportDoc[];
  optional_documents?: RequirementImportDoc[];
  deadlines?: RequirementImportDeadline[];
  eligibility_notes?: RequirementImportNote[];
  submission_instructions?: RequirementImportNote[];
  warnings?: RequirementImportWarning[];
  upgrade?: boolean;
}

export interface RequirementImportSelection {
  selected_required_documents: string[];
  selected_optional_documents: string[];
  selected_deadlines: number[];
  create_reminders: boolean;
}

/** Response from POST .../import-link/{draftId}/apply/ (apply step). */
export interface RequirementImportApplyResult {
  applied: boolean;
  created_requirements: number;
  created_reminders: number;
  target_date_set: string | null;
  pack_readiness: PackReadiness;
}

export type ReadinessSeverity = "blocker" | "warning" | "suggestion";
export type ReadinessOverall = "ready" | "issues" | "blocked";

export interface ReadinessFinding {
  severity: ReadinessSeverity;
  title: string;
  detail: string;
  fix: string;
}

export interface ShareReadinessReport {
  /** True when Claude reviewed the pack; false = deterministic facts only. */
  ai: boolean;
  overall: ReadinessOverall;
  summary: string;
  findings: ReadinessFinding[];
}

export interface Bundle {
  id: number;
  owner: number;
  title: string;
  description: string;
  bundle_type: BundleType;
  target_date: string | null;
  status: BundleStatus;
  country: string;
  authority_or_provider: string;
  notes: string;
  readiness_score: number;
  readiness: BundleReadiness;
  requirement_count: number;
  missing_required_count: number;
  requirements: BundleRequirement[];
  created_at: string;
  updated_at: string;
}

export interface CreateBundleRequest {
  title: string;
  description?: string;
  bundle_type?: BundleType;
  target_date?: string | null;
  status?: BundleStatus;
  country?: string;
  authority_or_provider?: string;
  notes?: string;
  /**
   * Optional pack-template key (e.g. "scholarship"). When the application-pack
   * templates feature is enabled, the backend seeds an editable starter
   * checklist from it. Ignored otherwise — never required.
   */
  template?: string;
}

export type UpdateBundleRequest = Partial<CreateBundleRequest>;

/** A generic, non-official pack template used to seed a starter checklist. */
export interface PackTemplateItem {
  title: string;
  is_required: boolean;
}

export interface PackTemplate {
  key: string;
  label: string;
  description: string;
  bundle_type: BundleType;
  disclaimer: string;
  items: PackTemplateItem[];
}

export interface CreateRequirementRequest {
  title: string;
  description?: string;
  is_required?: boolean;
  requirement_type?: RequirementType;
  expected_document_type?: string;
  status?: RequirementStatus;
  due_date?: string | null;
  notes?: string;
}

export type UpdateRequirementRequest = Partial<CreateRequirementRequest>;

// ---- Bundle exports --------------------------------------------------------

export type BundleExportType =
  | "bundle_metadata_json"
  | "bundle_requirements_csv";

export type ExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

export interface BundleExportRequest {
  id: number;
  export_type: BundleExportType;
  status: ExportStatus;
  download_url: string | null;
  is_expired: boolean;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  error_message: string;
  metadata: Record<string, unknown>;
}

export interface CreateBundleExportRequest {
  export_type: BundleExportType;
}

// ---- Bundle files ----------------------------------------------------------

export interface BundleFile {
  id: number;
  document: number | null;
  document_title: string;
  requirement_id: number;
  requirement_title: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  is_previewable: boolean;
  available: boolean;
  created_at: string;
}

export type BundleMissingFileReason =
  | "no_file"
  | "file_trashed"
  | "document_trashed";

export interface BundleMissingFile {
  requirement_id: number;
  requirement_title: string;
  document_id: number | null;
  document_title: string | null;
  reason: BundleMissingFileReason;
}

export interface BundleFilesResponse {
  files: BundleFile[];
  missing_files: BundleMissingFile[];
  summary: {
    total_files: number;
    total_size: number;
    documents_count: number;
    missing_count: number;
  };
}

// ---- Timeline --------------------------------------------------------------

export type TimelineEventType =
  | "document_expiry"
  | "document_renewal"
  | "reminder"
  | "checklist_item_due"
  | "bundle_target_date"
  | "bundle_requirement_due"
  | "subscription_renewal"
  | "subscription_cancellation_deadline"
  | "subscription_trial_ending";

export type TimelineUrgency = "low" | "medium" | "high" | "critical";

export interface TimelineEvent {
  id: string;
  event_type: TimelineEventType;
  title: string;
  description: string;
  date: string;
  urgency_level: TimelineUrgency;
  related_document: number | null;
  related_bundle: number | null;
  related_checklist: number | null;
  related_subscription: number | null;
  metadata: Record<string, unknown>;
}

export interface TimelineResponse {
  count: number;
  items: TimelineEvent[];
}

export interface TimelineParams {
  start_date?: string;
  end_date?: string;
  event_type?: TimelineEventType;
  document_id?: number;
  bundle_id?: number;
}

// ---- Extraction ------------------------------------------------------------

export type ExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review";

export type ExtractionProvider = "manual" | "local_text" | "future_ocr";

export type ExtractableField =
  | "title"
  | "document_type"
  | "issuer"
  | "country"
  | "reference_number"
  | "issue_date"
  | "expiry_date"
  | "renewal_date";

export type ExtractedFields = Partial<Record<ExtractableField, string>>;

export interface DocumentExtraction {
  id: number;
  owner: number;
  document: number;
  file: number;
  extraction_status: ExtractionStatus;
  extracted_fields: ExtractedFields;
  confidence_score: number | null;
  provider: ExtractionProvider;
  error_message: string;
  has_raw_text: boolean;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplyExtractionResponse {
  applied_fields: ExtractableField[];
  extraction: DocumentExtraction;
  document: DocumentRecord;
}
