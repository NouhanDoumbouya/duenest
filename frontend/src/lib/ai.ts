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
