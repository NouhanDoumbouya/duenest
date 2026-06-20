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
