// Documents API helpers. These wrap the shared `apiFetch` (which attaches the
// access token and normalizes errors), so token handling stays in one place.

import { apiFetch } from "./api";
import type {
  CreateDocumentRequest,
  DocumentRecord,
  DocumentStatus,
  Paginated,
  UpdateDocumentRequest,
} from "@/types/documents";

/** List the current user's documents (first page, newest first). */
export function getDocuments(): Promise<Paginated<DocumentRecord>> {
  return apiFetch<Paginated<DocumentRecord>>("/documents/", { auth: true });
}

/** Retrieve a single document the current user owns. */
export function getDocument(id: number): Promise<DocumentRecord> {
  return apiFetch<DocumentRecord>(`/documents/${id}/`, { auth: true });
}

export function createDocument(
  payload: CreateDocumentRequest,
): Promise<DocumentRecord> {
  return apiFetch<DocumentRecord>("/documents/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateDocument(
  id: number,
  payload: UpdateDocumentRequest,
): Promise<DocumentRecord> {
  return apiFetch<DocumentRecord>(`/documents/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteDocument(id: number): Promise<void> {
  return apiFetch<void>(`/documents/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

// ---- Display helpers -------------------------------------------------------

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  active: "Active",
  expired: "Expired",
  renewal_due: "Renewal due",
  archived: "Archived",
};

/** Format an ISO date (YYYY-MM-DD) for display; returns "—" when empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Whole days from today until the given date (negative if in the past). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

/** A document is "expiring soon" if it expires within the next 30 days. */
export function isExpiringSoon(doc: DocumentRecord): boolean {
  const days = daysUntil(doc.expiry_date);
  return days !== null && days >= 0 && days <= 30;
}
