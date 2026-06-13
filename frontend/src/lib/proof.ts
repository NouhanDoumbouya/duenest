// Proof-of-submission API helpers (/api/v1/proof-records/) plus display labels.

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  CreateProofRecordRequest,
  ProofRecord,
  ProofStatus,
  ProofType,
  UpdateProofRecordRequest,
} from "@/types/proof";

/** Proof records for one document the user owns. */
export function getDocumentProofRecords(
  documentId: number,
): Promise<Paginated<ProofRecord>> {
  return apiFetch<Paginated<ProofRecord>>(
    `/documents/${documentId}/proof-records/`,
    { auth: true },
  );
}

/** Proof records for one bundle the user owns. */
export function getBundleProofRecords(
  bundleId: number,
): Promise<Paginated<ProofRecord>> {
  return apiFetch<Paginated<ProofRecord>>(
    `/document-bundles/${bundleId}/proof-records/`,
    { auth: true },
  );
}

export function createProofRecord(
  payload: CreateProofRecordRequest,
): Promise<ProofRecord> {
  return apiFetch<ProofRecord>("/proof-records/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateProofRecord(
  id: number,
  payload: UpdateProofRecordRequest,
): Promise<ProofRecord> {
  return apiFetch<ProofRecord>(`/proof-records/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteProofRecord(id: number): Promise<void> {
  return apiFetch<void>(`/proof-records/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  submission_confirmation: "Submission confirmation",
  payment_receipt: "Payment receipt",
  tracking_number: "Tracking number",
  approval_letter: "Approval letter",
  rejection_notice: "Rejection notice",
  email_confirmation: "Email confirmation",
  other: "Other",
};

export const PROOF_STATUS_LABELS: Record<ProofStatus, string> = {
  saved: "Saved",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  needs_follow_up: "Needs follow-up",
  archived: "Archived",
};
