// Types for the AI Application Document Generator V1 (apps.ai /
// application-documents). Owner-scoped, key-gated, review-before-save. The
// backend always returns 200 with `{ available, reason, ... }` for the
// generate endpoint; `available: false` carries a blocked/failed reason.

/**
 * Reasons the generate endpoint can return. `ok` is success; the rest are
 * blocked/failed states (always HTTP 200 — the rollout flag being off is a 503
 * surfaced as an ApiError). Mirrors `lib/ai` `AiReason` plus the
 * generator-specific `not_found` / `invalid_request`.
 */
export type GenerateReason =
  | "ok"
  | "consent_required"
  | "ai_feature_not_in_plan"
  | "ai_credits_exhausted"
  | "budget"
  | "not_configured"
  | "not_found"
  | "invalid_request"
  | "error";

/** Export file formats a template can produce. */
export type ExportFormat = "pdf" | "docx";

/** Lifecycle status of a generated application document. */
export type GeneratedDocumentStatus =
  | "draft"
  | "reviewed"
  | "exported"
  | "saved";

/** A single document type the generator can produce (e.g. cover letter, CV). */
export interface DocumentTypeMeta {
  key: string;
  label: string;
  kind: string;
  credit_cost: number;
  ats_relevant: boolean;
  recommended_template: string;
  recommended_style: string;
  length_guidance: string;
  best_for: string;
  description: string;
  export_formats: ExportFormat[];
}

/** A short mini-preview hint used to differentiate template cards. */
export interface TemplatePreview {
  tone?: string;
  divider?: boolean;
  sample?: string;
}

/** A writing style applied to the generated content. */
export interface ContentStyle {
  key: string;
  label: string;
}

/** A layout/template the document can be rendered with. */
export interface DocumentTemplate {
  key: string;
  label: string;
  description: string;
  document_types: string[];
  export_formats: ExportFormat[];
  ats_safe: boolean;
  recommended_for: string[];
  kind: string;
  pro_only: boolean;
  best_for: string;
  preview: TemplatePreview;
}

/** Severity of a content/ATS warning, ordered low → high. */
export type WarningSeverity = "low" | "medium" | "high";

/**
 * A structured quality/ATS warning. `type` is a stable machine key
 * (e.g. "missing_education", "generic_language"); `message` is human copy.
 */
export interface DocumentWarning {
  type: string;
  severity: WarningSeverity;
  message: string;
}

/** The full registry returned by the templates endpoint. */
export interface TemplateRegistry {
  content_styles: ContentStyle[];
  document_types: DocumentTypeMeta[];
  templates: DocumentTemplate[];
}

/** Request body for the generate endpoint. */
export interface GenerateRequest {
  document_type: string;
  content_style?: string;
  template_key?: string;
  application_id?: number;
  bundle_id?: number;
  target_organization?: string;
  additional_instructions?: string;
}

/** Structured review feedback returned alongside a generated document. */
export interface QualityChecks {
  strengths: string[];
  missing_information: string[];
  risk_warnings: string[];
  suggested_improvements: string[];
}

/**
 * Result of a generate call. Mirrors the requirement-import union pattern: a
 * single interface with optional fields. `available: true` + `reason: "ok"`
 * means success; `available: false` carries a blocked/failed reason.
 */
export interface GenerateResult {
  available: boolean;
  reason: GenerateReason;
  /** Success fields (present when available && reason === "ok"). */
  generated_document_id?: number;
  document_type?: string;
  credit_cost?: number;
  credits_charged?: number;
  title?: string;
  template_key?: string;
  recommended_template?: string;
  plain_text_preview?: string;
  structured_content?: Record<string, unknown>;
  quality_checks?: QualityChecks;
  ats_score?: number | null;
  quality_score?: number | null;
  warnings?: DocumentWarning[];
  available_exports?: ExportFormat[];
  /** Blocked-state fields. */
  message?: string;
}

/** A persisted, reviewable generated application document. */
export interface GeneratedApplicationDocument {
  id: number;
  document_type: string;
  status: GeneratedDocumentStatus;
  title: string;
  target_organization: string;
  template_key: string;
  content_style: string;
  structured_content: Record<string, unknown>;
  plain_text_preview: string;
  ats_score: number | null;
  quality_score: number | null;
  warnings: DocumentWarning[];
  credits_charged: number;
  exported_pdf_file: number | null;
  exported_docx_file: number | null;
  created_document: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Narrow, editor-facing views of `structured_content`. The backend stores
 * `structured_content` as a free-form JSON object; these interfaces describe the
 * subset the editor reads and writes. Unknown keys are preserved on PATCH by
 * spreading the original object — the editor never discards fields it doesn't
 * understand.
 */

/** Header block shared by CV-style documents. */
export interface CvHeader {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
}

/**
 * CV-style structured content. The backend stores every list section as an
 * array of plain strings (each element is rendered with `str(item)`), and
 * `summary` as a string — only `header` is an object. Writing objects into the
 * list sections would render as literal dict text in the preview/PDF/DOCX, so
 * the editor must keep every list section as `string[]`.
 */
export interface CvStructuredContent {
  header?: CvHeader;
  summary?: string;
  education?: string[];
  experience?: string[];
  skills?: string[];
  projects?: string[];
  certifications?: string[];
  awards?: string[];
  leadership?: string[];
  languages?: string[];
}

/** A single labelled body block in a letter. */
export interface LetterSection {
  heading?: string;
  body?: string;
}

/** Letter-style structured content (subject, salutation, sections, closing). */
export interface LetterStructuredContent {
  subject?: string;
  salutation?: string;
  sections?: LetterSection[];
  closing?: string;
  signature?: string;
}

/** Writable fields when editing a reviewed document. */
export interface UpdateGeneratedDocumentRequest {
  title?: string;
  status?: GeneratedDocumentStatus;
  template_key?: string;
  content_style?: string;
  structured_content?: Record<string, unknown>;
  plain_text_preview?: string;
}

/** Request body for the export endpoint. */
export interface ExportRequest {
  format: ExportFormat;
  template_key?: string;
  save_to_pack?: boolean;
}

/** Result of an export call. */
export interface ExportResult {
  exported: boolean;
  format: ExportFormat;
  file_id: number;
  download_url: string;
  saved_to_pack?: boolean;
  document_id?: number;
  pack_readiness?: unknown;
}

/** Result of saving a generated document into a linked application pack. */
export interface SaveToPackResult {
  saved_to_pack: boolean;
  document_id: number;
  requirement_id: number;
  pack_readiness: unknown;
}
