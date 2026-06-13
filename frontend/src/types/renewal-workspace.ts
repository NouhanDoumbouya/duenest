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
}

export type UpdateBundleRequest = Partial<CreateBundleRequest>;

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
  document: number;
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
  | "bundle_requirement_due";

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
