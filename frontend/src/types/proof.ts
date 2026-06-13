// Types for proof-of-submission records.
// Mirrors the backend ProofRecordSerializer (/api/v1/proof-records/).

export type ProofType =
  | "submission_confirmation"
  | "payment_receipt"
  | "tracking_number"
  | "approval_letter"
  | "rejection_notice"
  | "email_confirmation"
  | "other";

export type ProofStatus =
  | "saved"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_follow_up"
  | "archived";

export interface ProofRecord {
  id: number;
  owner: number;
  title: string;
  proof_type: ProofType;
  document: number | null;
  document_title: string | null;
  bundle: number | null;
  checklist: number | null;
  linked_file: number | null;
  reference_number: string;
  submitted_to: string;
  submitted_at: string | null;
  status: ProofStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProofRecordRequest {
  title: string;
  proof_type: ProofType;
  document?: number | null;
  bundle?: number | null;
  checklist?: number | null;
  linked_file?: number | null;
  reference_number?: string;
  submitted_to?: string;
  submitted_at?: string | null;
  status?: ProofStatus;
  notes?: string;
}

export type UpdateProofRecordRequest = Partial<CreateProofRecordRequest>;
