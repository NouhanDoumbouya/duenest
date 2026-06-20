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
  | "error";

export interface DocumentCitation {
  document_id: number;
  title: string;
}

export interface AskResult {
  available: boolean;
  reason: AiReason;
  answer: string;
  answered: boolean;
  citations: DocumentCitation[];
  document_count: number;
}

/** Ask a natural-language question grounded in the user's own documents. */
export function askDocuments(question: string): Promise<AskResult> {
  return apiFetch<AskResult>("/documents/ask/", {
    method: "POST",
    body: { question },
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
