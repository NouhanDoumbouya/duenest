// Documents API helpers. These wrap the shared `apiFetch` (which attaches the
// access token and normalizes errors), so token handling stays in one place.

import { apiFetch } from "./api";
import type {
  AttentionNeededResponse,
  CreateReminderRuleRequest,
  DocumentCategory,
  DocumentComputedStatus,
  DocumentLifecycleStatus,
  DocumentListParams,
  DocumentReminderRule,
  CreateDocumentRequest,
  DocumentActivityResponse,
  DocumentRecord,
  DocumentStatus,
  HealthOverviewResponse,
  MissingScanResponse,
  Paginated,
  ReminderTriggerType,
  UpdateDocumentRequest,
  UpdateReminderRuleRequest,
  UpcomingRemindersResponse,
} from "@/types/documents";

function toQueryString(params?: DocumentListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** List the current user's documents with backend-owned search/filter/sort. */
export function getDocuments(
  params?: DocumentListParams,
): Promise<Paginated<DocumentRecord>> {
  return apiFetch<Paginated<DocumentRecord>>(`/documents/${toQueryString(params)}`, {
    auth: true,
  });
}

/** Retrieve a single document the current user owns. */
export function getDocument(id: number): Promise<DocumentRecord> {
  return apiFetch<DocumentRecord>(`/documents/${id}/`, { auth: true });
}

/** System categories plus the current user's own private categories. */
export function listDocumentCategories(): Promise<DocumentCategory[]> {
  return apiFetch<DocumentCategory[]>("/document-categories/", { auth: true });
}

/** Create a private category for the current user. */
export function createDocumentCategory(payload: {
  name: string;
  description?: string;
}): Promise<DocumentCategory> {
  return apiFetch<DocumentCategory>("/document-categories/", {
    method: "POST",
    body: payload,
    auth: true,
  });
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

/**
 * Move a document to trash (soft delete). DELETE on a document is a soft delete
 * on the backend — the record is hidden, recoverable, and can be permanently
 * removed later from the Trash.
 */
export function deleteDocument(id: number): Promise<void> {
  return apiFetch<void>(`/documents/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** List the current user's trashed documents. */
export function getTrashedDocuments(): Promise<Paginated<DocumentRecord>> {
  return apiFetch<Paginated<DocumentRecord>>("/documents/trash/", { auth: true });
}

/** Restore a trashed document back to the active vault. */
export function restoreDocument(id: number): Promise<DocumentRecord> {
  return apiFetch<DocumentRecord>(`/documents/${id}/restore/`, {
    method: "POST",
    auth: true,
  });
}

/** Permanently delete a trashed document. Irreversible. */
export function permanentlyDeleteDocument(id: number): Promise<void> {
  return apiFetch<void>(`/documents/${id}/permanent-delete/`, {
    method: "DELETE",
    auth: true,
  });
}

export function getAttentionNeeded(): Promise<AttentionNeededResponse> {
  return apiFetch<AttentionNeededResponse>("/documents/attention-needed/", {
    auth: true,
  });
}

export function getDocumentReminderRules(
  documentId: number,
): Promise<DocumentReminderRule[]> {
  return apiFetch<DocumentReminderRule[]>(
    `/documents/${documentId}/reminder-rules/`,
    { auth: true },
  );
}

export function createDocumentReminderRule(
  documentId: number,
  payload: CreateReminderRuleRequest,
): Promise<DocumentReminderRule> {
  return apiFetch<DocumentReminderRule>(
    `/documents/${documentId}/reminder-rules/`,
    {
      method: "POST",
      body: payload,
      auth: true,
    },
  );
}

export function updateDocumentReminderRule(
  documentId: number,
  ruleId: number,
  payload: UpdateReminderRuleRequest,
): Promise<DocumentReminderRule> {
  return apiFetch<DocumentReminderRule>(
    `/documents/${documentId}/reminder-rules/${ruleId}/`,
    {
      method: "PATCH",
      body: payload,
      auth: true,
    },
  );
}

export function deleteDocumentReminderRule(
  documentId: number,
  ruleId: number,
): Promise<void> {
  return apiFetch<void>(`/documents/${documentId}/reminder-rules/${ruleId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function getUpcomingDocumentReminders(): Promise<UpcomingRemindersResponse> {
  return apiFetch<UpcomingRemindersResponse>("/documents/reminders/upcoming/", {
    auth: true,
  });
}

/** What-is-missing scanner summary across the vault. */
export function getMissingSummary(): Promise<MissingScanResponse> {
  return apiFetch<MissingScanResponse>("/documents/missing-summary/", {
    auth: true,
  });
}

/** Grouped health sections for the documents dashboard. */
export function getHealthOverview(): Promise<HealthOverviewResponse> {
  return apiFetch<HealthOverviewResponse>("/documents/health-overview/", {
    auth: true,
  });
}

/** Merged, owner-only activity timeline for one document. */
export function getDocumentActivity(
  id: number,
): Promise<DocumentActivityResponse> {
  return apiFetch<DocumentActivityResponse>(`/documents/${id}/activity/`, {
    auth: true,
  });
}

// ---- Display helpers -------------------------------------------------------

export const LIFECYCLE_STATUS_LABELS: Record<DocumentLifecycleStatus, string> = {
  draft: "Draft",
  collected: "Collected",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  renewed: "Renewed",
  archived: "Archived",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  active: "Active",
  expired: "Expired",
  renewal_due: "Renewal due",
  archived: "Archived",
};

export const COMPUTED_STATUS_LABELS: Record<DocumentComputedStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  renewal_due: "Renewal due",
  expired: "Expired",
  missing_file: "Missing file",
  missing_expiry_date: "Missing expiry date",
  needs_attention: "Needs attention",
  archived: "Archived",
};

export const REMINDER_TRIGGER_LABELS: Record<ReminderTriggerType, string> = {
  before_expiry: "Before expiry",
  before_renewal_date: "Before renewal date",
  on_expiry: "On expiry day",
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

/** The backend owns the 90-day expiry intelligence. */
export function isExpiringSoon(doc: DocumentRecord): boolean {
  return doc.is_expiring_soon || doc.computed_status === "expiring_soon";
}
