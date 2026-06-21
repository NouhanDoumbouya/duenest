// Types for the drafts library — saved AI-drafted documents.

export type GeneratedDocStatus = "draft" | "saved" | "discarded";

export type GeneratedDocType =
  | "cv"
  | "cover_letter"
  | "motivation_letter"
  | "statement_of_purpose"
  | "recommendation_email"
  | "formal_letter"
  | "application_email"
  | "request_message"
  | "pack_cover_sheet"
  | "other";

export interface GeneratedDocument {
  id: number;
  title: string;
  document_type: GeneratedDocType;
  input_payload: Record<string, unknown>;
  output_text: string;
  status: GeneratedDocStatus;
  related_pack: number | null;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface SaveGeneratedDocumentInput {
  title: string;
  document_type?: GeneratedDocType;
  output_text: string;
  input_payload?: Record<string, unknown>;
  status?: GeneratedDocStatus;
  related_pack?: number | null;
}
