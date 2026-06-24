// Types for the Magic Inbox V1 (apps.magic_inbox). Owner-scoped. Capture
// anything (file / pasted text / link), then turn it into documents, reminders,
// packs, and applications. Analysis is deterministic by default (no AI, no
// credits) and can be upgraded to Smart analysis (AI, key-gated, 3 credits).
// Applying a chosen set of suggestions NEVER calls AI or charges credits.

/** What kind of thing was captured into the inbox. */
export type MagicInboxItemType = "file" | "text" | "link";

/** Lifecycle status of an inbox item. */
export type MagicInboxStatus =
  | "new"
  | "analyzed"
  | "applied"
  | "archived"
  | "failed";

/**
 * Suggestion kinds the analyzer can produce. Most apply in-place; two carry a
 * "continue elsewhere" route (import_requirement_link, generate_application_document).
 */
export type SuggestionType =
  | "save_to_vault"
  | "categorize_document"
  | "attach_to_pack"
  | "link_to_application"
  | "create_application"
  | "create_pack"
  | "add_requirements_to_pack"
  | "create_reminder"
  | "import_requirement_link"
  | "generate_application_document"
  | "ignore_or_archive";

/** Priority of a suggestion, drives grouping/sorting in the UI. */
export type SuggestionPriority = "low" | "medium" | "high";

/** A single actionable suggestion derived from analysis. */
export interface Suggestion {
  id: string;
  type: SuggestionType;
  label: string;
  description: string;
  priority: SuggestionPriority;
  /** Type-specific payload the apply step forwards back to the backend. */
  data?: Record<string, unknown>;
  /** A short excerpt from the source that motivated this suggestion. */
  source_snippet?: string;
}

/** A structured warning attached to an inbox item. */
export interface MagicInboxWarning {
  type: string;
  message: string;
}

/** Structured analysis output stored on the item. */
export interface ExtractedPayload {
  summary?: string;
  detected_type?: string;
  confidence?: number;
  detected_dates?: string[];
  required_documents?: string[];
}

/** The private file reference for a captured file (download_url only). */
export interface MagicInboxFile {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  /** The ONLY way to reference the file — the private download route. */
  download_url: string;
}

/** A captured inbox item with its analysis + suggestions. */
export interface MagicInboxItem {
  id: number;
  owner: number;
  item_type: MagicInboxItemType;
  status: MagicInboxStatus;
  title: string;
  source_label: string;
  source_url: string;
  pasted_text: string;
  linked_file: number | null;
  linked_document: number | null;
  linked_bundle: number | null;
  linked_application: number | null;
  extracted_payload: ExtractedPayload;
  suggestions: Suggestion[];
  warnings: MagicInboxWarning[];
  ai_model: string;
  credits_charged: number;
  file: MagicInboxFile | null;
  created_at: string;
  updated_at: string;
}

/** List response for the inbox. */
export interface MagicInboxListResponse {
  items: MagicInboxItem[];
  count: number;
}

/** Reasons the analyze endpoint can block a Smart (AI) analysis. */
export type AnalyzeBlockedReason =
  | "consent_required"
  | "ai_feature_not_in_plan"
  | "ai_credits_exhausted"
  | "budget"
  | "not_configured"
  | "error";

/** Request body for analyze. */
export interface AnalyzeRequest {
  use_ai: boolean;
  bundle_id?: number;
  application_id?: number;
}

/**
 * Result of an analyze call. Always HTTP 200 when the feature is on. When
 * `use_ai: true` is blocked, `available: false` carries a `reason`.
 */
export interface AnalyzeResult {
  available: boolean;
  reason: AnalyzeBlockedReason | "ok" | null;
  ai_used: boolean;
  credits_charged: number;
  item: MagicInboxItem;
}

/** A single suggestion the user has selected to apply. */
export interface SelectedSuggestion {
  id?: string;
  type: SuggestionType;
  data?: Record<string, unknown>;
}

/** Request body for apply. */
export interface ApplyRequest {
  selected_suggestions: SelectedSuggestion[];
}

/** An applied result entry. */
export interface AppliedResult {
  type: SuggestionType;
  [key: string]: unknown;
}

/** A skipped suggestion with a friendly reason key. */
export interface SkippedResult {
  type: SuggestionType;
  reason: string;
}

/**
 * A "continue elsewhere" hint. `route` names where the user should go to finish
 * a step that can't be completed inline.
 */
export interface ApplyRoute {
  type: SuggestionType;
  route: "requirement_link_import" | "application_document_generator" | string;
  bundle_id?: number;
  application_id?: number;
  [key: string]: unknown;
}

/** Result of an apply call. Never charges credits / calls AI. */
export interface ApplyResult {
  applied: AppliedResult[];
  skipped: SkippedResult[];
  routes: ApplyRoute[];
  item: MagicInboxItem;
}
