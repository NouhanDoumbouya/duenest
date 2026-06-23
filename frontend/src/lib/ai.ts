import { apiFetch } from "./api";

/**
 * Client for the opt-in, key-gated AI features (apps.ai / apps.documents).
 *
 * Each endpoint always returns `200` with `{ available, reason, ... }` when the
 * feature flags are on — `available: false` means the key isn't configured or
 * there was nothing to work with. When the flags are OFF the backend returns
 * `503`; callers surface that as "not enabled yet". Nothing is ever saved or
 * sent automatically by these calls.
 */

export type AiReason =
  | "ok"
  | "not_configured"
  | "no_documents"
  | "empty_question"
  | "empty_instructions"
  | "empty_goal"
  | "empty_message"
  | "budget"
  | "consent_required"
  | "error";

export interface DocumentCitation {
  document_id: number;
  title: string;
}

/** Backend chunk-retrieval modes. Mapped to friendly copy by `retrievalModeLabel`. */
export type RetrievalMode =
  | "chunk_vector"
  | "chunk_lexical"
  | "document_fallback"
  | "no_context";

/** One supporting excerpt behind a grounded answer (chunk-level RAG). */
export interface AnswerSource {
  document_id: number;
  document_title: string;
  chunk_index: number;
  page_number: number | null;
  excerpt: string;
}

export interface AskResult {
  available: boolean;
  reason: AiReason;
  answer: string;
  answered: boolean;
  citations: DocumentCitation[];
  document_count: number;
  /** Chunk-level RAG fields (optional — older backends omit them). */
  sources?: AnswerSource[];
  retrieval_mode?: RetrievalMode;
  indexed?: boolean;
}

/** Friendly, non-technical label for where an answer came from. */
export function retrievalModeLabel(mode: RetrievalMode | undefined): string | null {
  switch (mode) {
    case "chunk_vector":
      return "Answered from document content";
    case "chunk_lexical":
      return "Answered from document content search";
    case "document_fallback":
      return "Answered from document details";
    case "no_context":
      return "Not enough information found";
    default:
      return null;
  }
}

/**
 * Ask a natural-language question grounded in the user's own documents.
 *
 * Pass `documentId` to scope the answer to a single document (the contextual
 * "ask about this document" entry point). Omit it for whole-vault Q&A. Scoping
 * is enforced owner-side on the server, so an unknown id simply grounds on
 * nothing rather than leaking other documents.
 */
export function askDocuments(
  question: string,
  documentId?: number,
): Promise<AskResult> {
  return apiFetch<AskResult>("/documents/ask/", {
    method: "POST",
    body: documentId ? { question, document_id: documentId } : { question },
  });
}

export type DraftTone = "formal" | "friendly" | "concise";

export interface DraftResult {
  available: boolean;
  reason: AiReason;
  subject: string;
  body: string;
  used_document_ids: number[];
}

export interface DraftInput {
  instructions: string;
  documentIds?: number[];
  tone?: DraftTone;
}

/** Draft a letter/email from instructions, optionally grounded in documents. */
export function draftDocument(input: DraftInput): Promise<DraftResult> {
  return apiFetch<DraftResult>("/documents/draft/", {
    method: "POST",
    body: {
      instructions: input.instructions,
      document_ids: input.documentIds ?? [],
      tone: input.tone ?? "formal",
    },
  });
}

export type PackStatus = "have" | "missing" | "unclear";

export interface PackDocumentRef {
  document_id: number;
  title: string;
  expiry_date: string | null;
  expires_before_deadline: boolean;
}

export interface PackRequirement {
  name: string;
  description: string;
  status: PackStatus;
  documents: PackDocumentRef[];
}

export interface PackResult {
  available: boolean;
  reason: AiReason;
  goal: string;
  deadline: string | null;
  summary: string;
  requirements: PackRequirement[];
  document_count: number;
  have_count: number;
  missing_count: number;
}

/**
 * Application Pack Copilot: for a goal, get the requirement checklist matched
 * against the user's own vault, with documents expiring before the deadline
 * flagged. Suggestions only — never official.
 */
export function analyzePack(
  goal: string,
  deadline?: string,
): Promise<PackResult> {
  return apiFetch<PackResult>("/documents/pack-copilot/", {
    method: "POST",
    body: { goal, deadline: deadline || null },
  });
}

export interface CreatePackRequirement {
  name: string;
  description: string;
  document_ids: number[];
}

export interface CreatePackResult {
  bundle_id: number;
  title: string;
  readiness_score: number;
}

/** Turn a copilot analysis into a real draft bundle (one requirement per item). */
export function createPackBundle(input: {
  goal: string;
  deadline?: string | null;
  requirements: CreatePackRequirement[];
}): Promise<CreatePackResult> {
  return apiFetch<CreatePackResult>("/documents/pack-copilot/create-bundle/", {
    method: "POST",
    body: {
      goal: input.goal,
      deadline: input.deadline || null,
      requirements: input.requirements,
    },
  });
}

export type BriefingUrgency = "high" | "medium" | "low";

export interface BriefingItem {
  title: string;
  detail: string;
  urgency: BriefingUrgency;
  action_label: string;
  document_id: number | null;
  document_title: string | null;
}

export interface BriefingResult {
  available: boolean;
  reason: AiReason;
  summary: string;
  items: BriefingItem[];
  attention_count: number;
}

/** A prioritized "what to do now" briefing across the user's vault. */
export function getBriefing(): Promise<BriefingResult> {
  return apiFetch<BriefingResult>("/documents/ai-briefing/", { method: "POST" });
}

export type ChatActionType = "draft" | "pack" | "open_document" | "briefing";

export interface ChatAction {
  type: ChatActionType;
  label: string;
  goal?: string;
  document_id?: number;
  document_title?: string;
}

export interface ChatResult {
  available: boolean;
  reason: AiReason;
  reply: string;
  actions: ChatAction[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Chat grounded in the user's documents; returns a reply + confirm-gated actions. */
export function chatWithAssistant(
  message: string,
  history: ChatTurn[],
): Promise<ChatResult> {
  return apiFetch<ChatResult>("/documents/ai-chat/", {
    method: "POST",
    body: { message, history },
  });
}

export type IntakeSuggestionType =
  | "create_document"
  | "set_reminder"
  | "add_to_pack"
  | "draft";

export interface IntakeSuggestion {
  type: IntakeSuggestionType;
  label: string;
  goal?: string;
}

export interface IntakeSuggestedFields {
  title?: string;
  document_type?: string;
  expiry_date?: string;
  reference_number?: string;
}

export interface IntakeResult {
  available: boolean;
  reason: AiReason;
  summary: string;
  suggested_fields: IntakeSuggestedFields;
  suggestions: IntakeSuggestion[];
}

/** Understand an uploaded file and get confirm-gated next-action suggestions. */
export function getFileIntake(fileId: number): Promise<IntakeResult> {
  return apiFetch<IntakeResult>(`/files/${fileId}/intake/`, { method: "POST" });
}

// --- Chunk-level RAG: index a document's content so it can be asked about ---

/** How embeddings resolved for an index attempt. `unavailable`/`failed` still
 *  index by content search (lexical) — they are not error states. */
export type IndexEmbeddingsState = "ready" | "unavailable" | "failed";

export type IndexStatusCode =
  | "indexed"
  | "unchanged"
  | "no_text"
  | "forbidden"
  | "consent_required";

/** Result of indexing a document for AI (no Anthropic call is made here). */
export interface IndexResult {
  status: IndexStatusCode;
  chunks_created: number;
  embeddings: IndexEmbeddingsState;
  embedded: boolean;
  /** Present only when the endpoint gates on consent. */
  available?: boolean;
  reason?: AiReason;
}

/** Whether a document is prepared for content Q&A. */
export interface AiIndexStatus {
  indexed: boolean;
  chunk_count: number;
  embedded: boolean;
  embeddings_configured: boolean;
}

/** Read whether a document is indexed for AI content Q&A. */
export function getIndexStatus(documentId: number): Promise<AiIndexStatus> {
  return apiFetch<AiIndexStatus>(`/documents/${documentId}/ai/index-status/`);
}

/**
 * Prepare a document's extracted text for content Q&A. This never calls the AI
 * model — it only chunks already-extracted text (and embeds it when configured).
 * Pass `force` to re-index unchanged text.
 */
export function indexDocument(
  documentId: number,
  force = false,
): Promise<IndexResult> {
  return apiFetch<IndexResult>(`/documents/${documentId}/ai/index/`, {
    method: "POST",
    body: force ? { force: true } : {},
  });
}

export interface AiDisclosure {
  provider: string;
  used_for_training: boolean;
  summary: string;
}

/** Per-user AI usage snapshot (own numbers only — never global spend). */
export interface AiUsageSummary {
  daily_tokens_used: number;
  daily_token_cap: number;
  paused: boolean;
}

export interface AiPreferences {
  ai_enabled: boolean;
  redact_sensitive: boolean;
  ai_available?: boolean;
  disclosure?: AiDisclosure;
  usage?: AiUsageSummary;
}

/** The current user's AI consent + privacy settings (with the data stance). */
export function getAiPreferences(): Promise<AiPreferences> {
  return apiFetch<AiPreferences>("/ai/preferences/");
}

/** Update AI consent / Privacy Mode. */
export function updateAiPreferences(
  patch: Partial<Pick<AiPreferences, "ai_enabled" | "redact_sensitive">>,
): Promise<AiPreferences> {
  return apiFetch<AiPreferences>("/ai/preferences/", {
    method: "PUT",
    body: patch,
  });
}
