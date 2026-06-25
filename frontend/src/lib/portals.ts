// Client for CertaNest Portals (B2B Portals MVP). All endpoints are
// organization-scoped under `organizations/{orgId}/portal/` and authenticated
// via the shared `apiFetch` (cookie auth + CSRF + error handling).
//
// The whole feature is behind the `b2b_portals` feature flag: a disabled flag
// surfaces as a 503 ApiError (show a "coming soon" state). Writes require an org
// admin/owner role: non-admins get a 403 (show a view-only message). Non-members
// get 403; an archived/missing org gives 404.
//
// Trust model: `room_public_url` and a request's `upload_url` are FRONTEND page
// routes (`/room/{token}`, `/document-request/{token}`) — safe to display and
// copy. Nothing here is a raw storage URL.

import { ApiError, apiFetch } from "./api";
import { fetchBlob, saveBlob } from "./document-files";
import type {
  CaseType,
  CreateCaseFromTemplateBody,
  CreateCaseFromTemplateResult,
  CreateCaseFromTemplateWarning,
  CreateCasePackBody,
  CreateCaseRequestBody,
  CreatePortalCaseBody,
  CreatePortalPersonBody,
  OrgCaseTemplate,
  OrgCaseTemplateBody,
  OrgCaseTemplatesResponse,
  DashboardActivityItem,
  OrganizationDashboard,
  PortalCase,
  PortalCaseFilters,
  PortalCasePriority,
  PortalCaseProgress,
  PortalCaseReviewItemsResponse,
  PortalCaseStatus,
  PortalCaseType,
  PortalCasesResponse,
  PortalLimitResource,
  PortalLimits,
  PortalPeopleResponse,
  PortalPerson,
  PortalPersonStatus,
  PortalPersonType,
  PortalReviewDecision,
  PortalReviewItem,
  PortalReviewQueueFilters,
  PortalReviewQueueResponse,
  PortalReviewStatus,
  PortalSummary,
  CreateReminderBatchBody,
  ReminderBatch,
  ReminderBatchesResponse,
  ReminderCandidate,
  ReminderPreview,
  ReminderPreviewQuery,
  ReminderType,
  SendReminderBatchBody,
  ReviewCaseRequestBody,
  ReviewCaseRequestResponse,
  ReviewDecision,
  ReviewDecisionsResponse,
  UpdatePortalCaseBody,
  UpdatePortalPersonBody,
} from "@/types/portals";
import type { StatusTone } from "./status-badge";

/** Build the base path for a portal sub-resource. */
function base(orgId: number, suffix = ""): string {
  return `/organizations/${orgId}/portal/${suffix}`;
}

// ---- Plan + limits ----------------------------------------------------------

/**
 * Read the org's portal plan, limits, usage, and remaining headroom. Readable
 * by any org member even when the portal is not enabled (so the paywall can
 * render). Use `portal_enabled` to decide between the live portal and the
 * Teams paywall.
 */
export function getPortalLimits(orgId: number): Promise<PortalLimits> {
  return apiFetch<PortalLimits>(base(orgId, "limits/"));
}

// ---- Summary ----------------------------------------------------------------

/** Read the portal dashboard summary counts. */
export function getPortalSummary(orgId: number): Promise<PortalSummary> {
  return apiFetch<PortalSummary>(base(orgId, "summary/"));
}

// ---- Organization dashboard -------------------------------------------------

/**
 * Read the org's operational dashboard: plan/limits, metrics, action queues,
 * and recent activity in one call. Readable by any active org member behind the
 * `b2b_portals` flag + Teams entitlement. The queue `action_url`s are relative
 * app routes — safe to use with `next/link`; there are no file URLs or tokens.
 */
export function getPortalDashboard(
  orgId: number,
): Promise<OrganizationDashboard> {
  return apiFetch<OrganizationDashboard>(base(orgId, "dashboard/"));
}

// ---- People -----------------------------------------------------------------

/** List the portal's people, optionally filtered by status. */
export function getPortalPeople(
  orgId: number,
  status?: PortalPersonStatus,
): Promise<PortalPeopleResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PortalPeopleResponse>(base(orgId, `people/${query}`));
}

/** Create a person. */
export function createPortalPerson(
  orgId: number,
  body: CreatePortalPersonBody,
): Promise<PortalPerson> {
  return apiFetch<PortalPerson>(base(orgId, "people/"), {
    method: "POST",
    body,
  });
}

/** Read a single person. */
export function getPortalPerson(
  orgId: number,
  personId: number,
): Promise<PortalPerson> {
  return apiFetch<PortalPerson>(base(orgId, `people/${personId}/`));
}

/** Edit a person. */
export function updatePortalPerson(
  orgId: number,
  personId: number,
  patch: UpdatePortalPersonBody,
): Promise<PortalPerson> {
  return apiFetch<PortalPerson>(base(orgId, `people/${personId}/`), {
    method: "PATCH",
    body: patch,
  });
}

/** Archive a person so they leave the active list. */
export function archivePortalPerson(
  orgId: number,
  personId: number,
): Promise<PortalPerson> {
  return apiFetch<PortalPerson>(base(orgId, `people/${personId}/archive/`), {
    method: "POST",
  });
}

// ---- Cases ------------------------------------------------------------------

/** List cases, optionally filtered by status, person, and active-only. */
export function getPortalCases(
  orgId: number,
  filters: PortalCaseFilters = {},
): Promise<PortalCasesResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (typeof filters.person === "number") {
    params.set("person", String(filters.person));
  }
  if (filters.active) params.set("active", "true");
  const query = params.toString();
  return apiFetch<PortalCasesResponse>(
    base(orgId, `cases/${query ? `?${query}` : ""}`),
  );
}

/** Create a case. */
export function createPortalCase(
  orgId: number,
  body: CreatePortalCaseBody,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, "cases/"), {
    method: "POST",
    body,
  });
}

/** Read a single case. */
export function getPortalCase(
  orgId: number,
  caseId: number,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/`));
}

/** Edit a case. */
export function updatePortalCase(
  orgId: number,
  caseId: number,
  patch: UpdatePortalCaseBody,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/`), {
    method: "PATCH",
    body: patch,
  });
}

/** Archive a case so it leaves the active list. */
export function archivePortalCase(
  orgId: number,
  caseId: number,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/archive/`), {
    method: "POST",
  });
}

/** Turn a case's requirements into a linked application pack. */
export function createCasePack(
  orgId: number,
  caseId: number,
  body: CreateCasePackBody = {},
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/create-pack/`), {
    method: "POST",
    body,
  });
}

/** Create a linked sharing room for a case (returns its public URL). */
export function createCaseRoom(
  orgId: number,
  caseId: number,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/create-room/`), {
    method: "POST",
  });
}

/** Create a document request attached to a case. */
export function createCaseRequest(
  orgId: number,
  caseId: number,
  body: CreateCaseRequestBody,
): Promise<PortalCase> {
  return apiFetch<PortalCase>(base(orgId, `cases/${caseId}/create-request/`), {
    method: "POST",
    body,
  });
}

/** Read a case's readiness/progress snapshot. */
export function getCaseProgress(
  orgId: number,
  caseId: number,
): Promise<PortalCaseProgress> {
  return apiFetch<PortalCaseProgress>(base(orgId, `cases/${caseId}/progress/`));
}

// ---- Review queue -----------------------------------------------------------

/**
 * List review items across all cases. With no filters the backend returns only
 * uploaded/under-review items (the work queue); pass `status` to filter to a
 * single review status, or `case_id`/`person_id`/`search` to narrow.
 */
export function getPortalReviewQueue(
  orgId: number,
  filters: PortalReviewQueueFilters = {},
): Promise<PortalReviewQueueResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (typeof filters.case_id === "number") {
    params.set("case_id", String(filters.case_id));
  }
  if (typeof filters.person_id === "number") {
    params.set("person_id", String(filters.person_id));
  }
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return apiFetch<PortalReviewQueueResponse>(
    base(orgId, `review-queue/${query ? `?${query}` : ""}`),
  );
}

/** List every review item for a single case (all statuses). */
export function getCaseReviewItems(
  orgId: number,
  caseId: number,
): Promise<PortalCaseReviewItemsResponse> {
  return apiFetch<PortalCaseReviewItemsResponse>(
    base(orgId, `cases/${caseId}/review-items/`),
  );
}

/**
 * Start reviewing an uploaded case request (UPLOADED → under_review).
 * Admin/owner only.
 */
export function startCaseRequestReview(
  orgId: number,
  caseId: number,
  caseRequestId: number,
): Promise<PortalReviewItem> {
  return apiFetch<PortalReviewItem>(
    base(orgId, `cases/${caseId}/requests/${caseRequestId}/start-review/`),
    { method: "POST" },
  );
}

/**
 * Record a review decision on a case request's upload. Admin/owner only.
 * `note` is required by the backend for `rejected`/`needs_replacement`.
 */
export function reviewCaseRequest(
  orgId: number,
  caseId: number,
  caseRequestId: number,
  body: ReviewCaseRequestBody,
): Promise<ReviewCaseRequestResponse> {
  return apiFetch<ReviewCaseRequestResponse>(
    base(orgId, `cases/${caseId}/requests/${caseRequestId}/review/`),
    { method: "POST", body },
  );
}

/** Read a case request's decision history (most-recent audit trail). */
export function getCaseRequestDecisions(
  orgId: number,
  caseId: number,
  caseRequestId: number,
): Promise<ReviewDecision[]> {
  return apiFetch<ReviewDecisionsResponse>(
    base(orgId, `cases/${caseId}/requests/${caseRequestId}/decisions/`),
  ).then((response) => response.decisions);
}

/**
 * Fetch the uploaded file behind a case request as an authenticated blob,
 * through the org-scoped preview proxy. This is the ONLY way to view the file —
 * there is no raw storage URL.
 */
export function getReviewFilePreviewBlob(
  orgId: number,
  caseId: number,
  caseRequestId: number,
): Promise<Blob> {
  return fetchBlob(
    base(orgId, `cases/${caseId}/requests/${caseRequestId}/file/preview/`),
    { auth: true, fallbackError: "Could not preview this file." },
  );
}

/**
 * Download the uploaded file behind a case request through the org-scoped
 * download proxy (authenticated blob), then trigger a browser save.
 */
export async function getReviewFileDownloadBlob(
  orgId: number,
  caseId: number,
  caseRequestId: number,
  filename: string,
): Promise<void> {
  const blob = await fetchBlob(
    base(orgId, `cases/${caseId}/requests/${caseRequestId}/file/download/`),
    { auth: true, fallbackError: "Could not download this file." },
  );
  saveBlob(blob, filename);
}

// ---- Bulk reminder emails ---------------------------------------------------

/**
 * Preview who a reminder of a given type would reach. Any org member may read
 * this (so a non-admin can see the work), but only admins/owners can send.
 * Pass `case_id`/`person_id` to scope, and `include_recently_reminded` to also
 * surface recipients reminded in the last few days (otherwise held back).
 */
export function getReminderPreview(
  orgId: number,
  query: ReminderPreviewQuery,
): Promise<ReminderPreview> {
  const params = new URLSearchParams();
  params.set("reminder_type", query.reminder_type);
  if (typeof query.case_id === "number") {
    params.set("case_id", String(query.case_id));
  }
  if (typeof query.person_id === "number") {
    params.set("person_id", String(query.person_id));
  }
  if (query.include_recently_reminded) {
    params.set("include_recently_reminded", "true");
  }
  return apiFetch<ReminderPreview>(
    base(orgId, `reminders/preview/?${params.toString()}`),
  );
}

/**
 * Create a reminder batch (and send it immediately when `send_now` is true).
 * Admin/owner only — members get a 403. `selected_candidate_ids` narrows the
 * batch to the chosen recipients; omit to include every eligible candidate.
 */
export function createReminderBatch(
  orgId: number,
  body: CreateReminderBatchBody,
): Promise<ReminderBatch> {
  return apiFetch<ReminderBatch>(base(orgId, "reminders/batches/"), {
    method: "POST",
    body,
  });
}

/** List the org's reminder batches (most recent first). */
export function getReminderBatches(
  orgId: number,
): Promise<ReminderBatchesResponse> {
  return apiFetch<ReminderBatchesResponse>(base(orgId, "reminders/batches/"));
}

/** Read a single reminder batch with its recipients. */
export function getReminderBatch(
  orgId: number,
  batchId: number,
): Promise<ReminderBatch> {
  return apiFetch<ReminderBatch>(base(orgId, `reminders/batches/${batchId}/`));
}

/** Send a draft reminder batch. Admin/owner only. */
export function sendReminderBatch(
  orgId: number,
  batchId: number,
  body: SendReminderBatchBody = {},
): Promise<ReminderBatch> {
  return apiFetch<ReminderBatch>(
    base(orgId, `reminders/batches/${batchId}/send/`),
    { method: "POST", body },
  );
}

/** Cancel a draft reminder batch. Admin/owner only. */
export function cancelReminderBatch(
  orgId: number,
  batchId: number,
): Promise<ReminderBatch> {
  return apiFetch<ReminderBatch>(
    base(orgId, `reminders/batches/${batchId}/cancel/`),
    { method: "POST" },
  );
}

// ---- Organization case templates --------------------------------------------

/**
 * List the org's case templates. Any member may read. Archived templates are
 * hidden unless `include_archived` is true.
 */
export function getPortalTemplates(
  orgId: number,
  options: { include_archived?: boolean } = {},
): Promise<OrgCaseTemplatesResponse> {
  const query = options.include_archived ? "?include_archived=true" : "";
  return apiFetch<OrgCaseTemplatesResponse>(base(orgId, `templates/${query}`));
}

/** Create a template. Admin/owner only (members get a 403). */
export function createPortalTemplate(
  orgId: number,
  body: OrgCaseTemplateBody,
): Promise<OrgCaseTemplate> {
  return apiFetch<OrgCaseTemplate>(base(orgId, "templates/"), {
    method: "POST",
    body,
  });
}

/** Read a single template with its full ordered requirements. Any member. */
export function getPortalTemplate(
  orgId: number,
  templateId: number,
): Promise<OrgCaseTemplate> {
  return apiFetch<OrgCaseTemplate>(base(orgId, `templates/${templateId}/`));
}

/**
 * Edit a template. Admin/owner only. Include `requirements` in the body to
 * replace the full requirement set; omit it to leave them untouched.
 */
export function updatePortalTemplate(
  orgId: number,
  templateId: number,
  body: OrgCaseTemplateBody,
): Promise<OrgCaseTemplate> {
  return apiFetch<OrgCaseTemplate>(base(orgId, `templates/${templateId}/`), {
    method: "PATCH",
    body,
  });
}

/** Archive a template so it leaves the active list. Admin/owner only. */
export function archivePortalTemplate(
  orgId: number,
  templateId: number,
): Promise<OrgCaseTemplate> {
  return apiFetch<OrgCaseTemplate>(
    base(orgId, `templates/${templateId}/archive/`),
    { method: "POST" },
  );
}

/** Duplicate a template into a fresh copy. Admin/owner only. */
export function duplicatePortalTemplate(
  orgId: number,
  templateId: number,
): Promise<OrgCaseTemplate> {
  return apiFetch<OrgCaseTemplate>(
    base(orgId, `templates/${templateId}/duplicate/`),
    { method: "POST" },
  );
}

/**
 * Create a case from a template. Admin/owner only. Omitted `create_*` toggles
 * fall back to the template's `auto_create_*` defaults. A case-limit hit comes
 * back as a 403 `organization_plan_limit_exceeded`; room/request limits are NOT
 * errors — they appear in the result's `warnings`.
 */
export function createCaseFromTemplate(
  orgId: number,
  templateId: number,
  body: CreateCaseFromTemplateBody,
): Promise<CreateCaseFromTemplateResult> {
  return apiFetch<CreateCaseFromTemplateResult>(
    base(orgId, `templates/${templateId}/create-case/`),
    { method: "POST", body },
  );
}

// ---- Pure helpers (no DOM where possible — unit-testable) -------------------

/** Order for grouping/sorting the person-type select. */
export const PORTAL_PERSON_TYPE_ORDER: PortalPersonType[] = [
  "client",
  "student",
  "applicant",
  "employee",
  "family_member",
  "other",
];

/** Friendly, calm labels for each person type. */
export const PORTAL_PERSON_TYPE_LABELS: Record<PortalPersonType, string> = {
  client: "Client",
  student: "Student",
  applicant: "Applicant",
  employee: "Employee",
  family_member: "Family member",
  other: "Other",
};

/** Order for the person-status filter. */
export const PORTAL_PERSON_STATUS_ORDER: PortalPersonStatus[] = [
  "active",
  "waiting_for_documents",
  "under_review",
  "completed",
  "archived",
];

/** Friendly labels for each person status. */
export const PORTAL_PERSON_STATUS_LABELS: Record<PortalPersonStatus, string> = {
  active: "Active",
  waiting_for_documents: "Waiting for documents",
  under_review: "Under review",
  completed: "Completed",
  archived: "Archived",
};

/** Status tone for the canonical StatusBadge. */
export const PORTAL_PERSON_STATUS_TONE: Record<PortalPersonStatus, StatusTone> =
  {
    active: "info",
    waiting_for_documents: "warning",
    under_review: "warning",
    completed: "success",
    archived: "neutral",
  };

/** Order for the case-type select. */
export const PORTAL_CASE_TYPE_ORDER: PortalCaseType[] = [
  "visa",
  "scholarship",
  "admission",
  "employee_onboarding",
  "compliance",
  "client_file",
  "general",
];

/** Friendly labels for each case type. */
export const PORTAL_CASE_TYPE_LABELS: Record<PortalCaseType, string> = {
  visa: "Visa",
  scholarship: "Scholarship",
  admission: "Admission",
  employee_onboarding: "Employee onboarding",
  compliance: "Compliance",
  client_file: "Client file",
  general: "General",
};

/** Order for the case-status filter. */
export const PORTAL_CASE_STATUS_ORDER: PortalCaseStatus[] = [
  "draft",
  "collecting_documents",
  "waiting_for_review",
  "ready",
  "submitted",
  "completed",
  "blocked",
  "archived",
];

/** Friendly labels for each case status. */
export const PORTAL_CASE_STATUS_LABELS: Record<PortalCaseStatus, string> = {
  draft: "Draft",
  collecting_documents: "Collecting documents",
  waiting_for_review: "Waiting for review",
  ready: "Ready",
  submitted: "Submitted",
  completed: "Completed",
  blocked: "Blocked",
  archived: "Archived",
};

/** Status tone for the canonical StatusBadge. */
export const PORTAL_CASE_STATUS_TONE: Record<PortalCaseStatus, StatusTone> = {
  draft: "neutral",
  collecting_documents: "info",
  waiting_for_review: "warning",
  ready: "success",
  submitted: "success",
  completed: "success",
  blocked: "danger",
  archived: "neutral",
};

/** Order for the priority select. */
export const PORTAL_CASE_PRIORITY_ORDER: PortalCasePriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

/** Friendly labels for each priority. */
export const PORTAL_CASE_PRIORITY_LABELS: Record<PortalCasePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** Tone for each priority (used for a small priority pill). */
export const PORTAL_CASE_PRIORITY_TONE: Record<PortalCasePriority, StatusTone> =
  {
    low: "neutral",
    normal: "info",
    high: "warning",
    urgent: "danger",
  };

// ---- Review workflow helpers ------------------------------------------------

/** Order review statuses appear in grouped views. */
export const REVIEW_STATUS_ORDER: PortalReviewStatus[] = [
  "uploaded",
  "under_review",
  "needs_replacement",
  "rejected",
  "accepted",
  "pending_upload",
  "cancelled",
];

/** Friendly, calm labels for each review status. */
export const REVIEW_STATUS_LABELS: Record<PortalReviewStatus, string> = {
  pending_upload: "Awaiting upload",
  uploaded: "Ready to review",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_replacement: "Needs replacement",
  cancelled: "Cancelled",
};

/** Status tone for the canonical StatusBadge. */
export const REVIEW_STATUS_TONE: Record<PortalReviewStatus, StatusTone> = {
  pending_upload: "neutral",
  uploaded: "info",
  under_review: "warning",
  accepted: "success",
  rejected: "danger",
  needs_replacement: "warning",
  cancelled: "neutral",
};

/** Human label for a review status, falling back to the raw key. */
export function reviewStatusLabel(status: PortalReviewStatus): string {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

/**
 * Whether an admin can record a decision on this review status. A file is
 * decidable once it has been uploaded (`uploaded`), while it is being reviewed
 * (`under_review`), or after a replacement has been re-uploaded against a prior
 * `needs_replacement` — the backend re-surfaces those as `uploaded`, but we
 * also allow `needs_replacement` so the action stays available if a fresh file
 * is present. Already-decided/empty states are not decidable.
 */
export function canDecideStatus(status: PortalReviewStatus): boolean {
  return (
    status === "uploaded" ||
    status === "under_review" ||
    status === "needs_replacement"
  );
}

/** Whether a decision requires a note/reason. Reject + needs-replacement do. */
export function reviewNoteRequired(decision: PortalReviewDecision): boolean {
  return decision === "rejected" || decision === "needs_replacement";
}

/**
 * Default for the "Notify recipient" checkbox. Reject and needs-replacement
 * benefit from a heads-up (the recipient must act again), so they default on;
 * acceptance is quieter and defaults off.
 */
export function reviewNotifyDefault(decision: PortalReviewDecision): boolean {
  return decision === "rejected" || decision === "needs_replacement";
}

/** A review item shaped like the enriched queue item (queue or case request). */
type ReviewLike = Pick<PortalReviewItem, "review_status">;

/**
 * Count items per review status. Returns a complete record (every status keyed,
 * zero where absent) so callers can read any status without guarding undefined.
 */
export function reviewStatusCounts(
  items: ReviewLike[],
): Record<PortalReviewStatus, number> {
  const counts: Record<PortalReviewStatus, number> = {
    pending_upload: 0,
    uploaded: 0,
    under_review: 0,
    accepted: 0,
    rejected: 0,
    needs_replacement: 0,
    cancelled: 0,
  };
  for (const item of items) {
    counts[item.review_status] += 1;
  }
  return counts;
}

/**
 * How many items are actively waiting for review (uploaded or under review) —
 * the number that should drive the "needs review" badge.
 */
export function reviewQueueCount(items: ReviewLike[]): number {
  return items.reduce(
    (total, item) =>
      item.review_status === "uploaded" || item.review_status === "under_review"
        ? total + 1
        : total,
    0,
  );
}

/**
 * Group review-like items by status into the canonical display order, dropping
 * empty groups. Generic so it works on both queue items and case requests.
 */
export function groupReviewItemsByStatus<T extends ReviewLike>(
  items: T[],
): Array<{ status: PortalReviewStatus; items: T[] }> {
  return REVIEW_STATUS_ORDER.map((status) => ({
    status,
    items: items.filter((item) => item.review_status === status),
  })).filter((group) => group.items.length > 0);
}

/**
 * Percentage of requirements satisfied for a case, clamped to 0–100 and rounded
 * to a whole number. A case with no requirements reads as 0% (nothing to be
 * ready for yet), never NaN.
 */
export function progressPercent(progress: PortalCaseProgress): number {
  const total = progress.total_requirements;
  if (!total || total <= 0) return 0;
  const ratio = progress.satisfied_requirements / total;
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 100);
}

// ---- Plan + limit helpers ---------------------------------------------------

/** Human-readable labels for each capacity-limited portal resource. */
export const PORTAL_LIMIT_RESOURCE_LABELS: Record<PortalLimitResource, string> =
  {
    members: "Team members",
    portal_people: "People",
    active_portal_cases: "Active cases",
    active_document_requests: "Active requests",
    active_sharing_rooms: "Active rooms",
  };

/** Friendly plan names for display. */
export const PORTAL_PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  teams_beta: "Teams (beta)",
  teams: "Teams",
  enterprise: "Enterprise",
};

/** Human label for a limit resource, falling back to the raw key. */
export function limitLabel(resource: PortalLimitResource): string {
  return PORTAL_LIMIT_RESOURCE_LABELS[resource] ?? resource;
}

/** Friendly plan label, falling back to the raw plan string. */
export function planLabel(plan: string): string {
  return PORTAL_PLAN_LABELS[plan] ?? plan;
}

/**
 * Percentage of a limit currently used, clamped to 0–100 and rounded. An
 * unlimited limit (`null`) reads as 0% (there is no bar to fill). A zero limit
 * reads as 100% if anything is used, else 0% — never NaN or Infinity.
 */
export function usagePercent(used: number, limit: number | null): number {
  if (limit === null) return 0;
  if (limit <= 0) return used > 0 ? 100 : 0;
  const ratio = used / limit;
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 100);
}

/**
 * Whether usage is at or beyond `threshold` (default 80%) of the limit.
 * Unlimited limits (`null`) are never "near" a limit. A zero limit counts as
 * near when anything is used.
 */
export function isNearLimit(
  used: number,
  limit: number | null,
  threshold = 0.8,
): boolean {
  if (limit === null) return false;
  if (limit <= 0) return used > 0;
  return used / limit >= threshold;
}

/**
 * True when `err` is the org plan-limit error a create call returns: an
 * ApiError with status 403 and `data.code === "organization_plan_limit_exceeded"`.
 */
export function isOrgLimitError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as Record<string, unknown>).code ===
      "organization_plan_limit_exceeded"
  );
}

/**
 * True when `err` is the portal-not-enabled error the portal endpoints return
 * for orgs without a Teams entitlement: an ApiError with status 403 and
 * `data.code === "portal_not_enabled"`.
 */
export function isPortalNotEnabledError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as Record<string, unknown>).code === "portal_not_enabled"
  );
}

/**
 * True when `err` is a plain 403 from a portal endpoint — typically a member
 * who is not an admin/owner trying to take an admin-only action (e.g. recording
 * a review decision). Distinct from the richer plan-limit / not-enabled 403s,
 * which carry a `data.code`; this matches a 403 that is NOT one of those.
 */
export function isPortalForbiddenError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    !isOrgLimitError(err) &&
    !isPortalNotEnabledError(err)
  );
}

// ---- Dashboard activity helpers ---------------------------------------------

/**
 * Human labels for the portal activity events surfaced on the dashboard's
 * recent-activity list. Calm, past-tense phrasing. Unknown event types fall
 * back to a title-cased version of the key via `dashboardActivityLabel`.
 */
export const DASHBOARD_ACTIVITY_LABELS: Record<string, string> = {
  portal_person_created: "Person added",
  portal_case_created: "Case created",
  portal_case_request_created: "Document requested",
  portal_review_started: "Review started",
  portal_document_accepted: "Document accepted",
  portal_document_rejected: "Document rejected",
  portal_document_needs_replacement: "Replacement requested",
  portal_recipient_notified: "Recipient notified",
  portal_case_pack_created: "Application pack created",
  portal_case_room_created: "Sharing room created",
  portal_case_status_changed: "Case status changed",
  portal_case_archived: "Case archived",
  organization_plan_changed: "Plan changed",
  organization_portal_limit_reached: "Plan limit reached",
};

/**
 * Title-case an unknown snake_case event type into a readable fallback label,
 * dropping a leading `portal_`/`organization_` prefix so it reads naturally
 * (e.g. `portal_case_reopened` → "Case reopened"). Never returns an empty
 * string for a non-empty key.
 */
export function humanizeEventType(eventType: string): string {
  const cleaned = eventType
    .replace(/^(portal|organization)_/, "")
    .replace(/_/g, " ")
    .trim();
  if (!cleaned) return eventType;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * The display label + object label for a recent-activity row. The label comes
 * from the known event map, falling back to a humanized event type; the object
 * label is the pre-formatted, safe display string from the backend (never a raw
 * token, URL, or document content).
 */
export function dashboardActivityLabel(item: DashboardActivityItem): {
  label: string;
  objectLabel: string;
} {
  return {
    label: DASHBOARD_ACTIVITY_LABELS[item.event_type] ??
      humanizeEventType(item.event_type),
    objectLabel: item.object_label,
  };
}

// ---- Bulk reminder helpers --------------------------------------------------

/** The order the reminder types appear in the type picker. */
export const REMINDER_TYPE_ORDER: ReminderType[] = [
  "missing_documents",
  "overdue_requests",
  "due_soon_cases",
  "needs_replacement",
  "rejected_documents",
  "collecting_documents",
];

/** Friendly, calm labels for each reminder type. */
export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  missing_documents: "Missing documents",
  overdue_requests: "Overdue requests",
  needs_replacement: "Needs replacement",
  rejected_documents: "Rejected documents",
  due_soon_cases: "Due soon",
  collecting_documents: "Still collecting",
};

/** A short, plain-language description of what each reminder nudges about. */
export const REMINDER_TYPE_DESCRIPTIONS: Record<ReminderType, string> = {
  missing_documents:
    "Recipients who still owe a required document on an open case.",
  overdue_requests:
    "Requests past their due date that haven't been uploaded yet.",
  needs_replacement:
    "Uploads you sent back asking the recipient to redo them.",
  rejected_documents:
    "Documents you rejected that the recipient needs to resend.",
  due_soon_cases: "Cases with a due date coming up that aren't ready yet.",
  collecting_documents:
    "Cases still in the collecting stage with outstanding requests.",
};

/** Human label for a reminder type, falling back to the raw key. */
export function reminderTypeLabel(type: ReminderType): string {
  return REMINDER_TYPE_LABELS[type] ?? type;
}

/** Why a candidate was skipped, as friendly copy. Empty reason → "". */
export function reminderSkipLabel(skipReason: string): string {
  switch (skipReason) {
    case "no_email":
      return "No email on file";
    case "recently_reminded":
      return "Reminded in the last 3 days";
    default:
      return "";
  }
}

/** The candidates from a preview that can actually be selected and sent. */
export function selectableCandidates(
  preview: ReminderPreview,
): ReminderCandidate[] {
  return preview.candidates.filter((candidate) => candidate.eligible);
}

// ---- Organization case template helpers -------------------------------------

/** Order the 10 template case types appear in the type picker. */
export const CASE_TYPE_ORDER: CaseType[] = [
  "visa",
  "scholarship",
  "admission",
  "employee_onboarding",
  "compliance",
  "client_file",
  "insurance_claim",
  "grant",
  "internship",
  "general",
];

/** Friendly labels for all 10 template case types. */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  visa: "Visa",
  scholarship: "Scholarship",
  admission: "Admission",
  employee_onboarding: "Employee onboarding",
  compliance: "Compliance",
  client_file: "Client file",
  insurance_claim: "Insurance claim",
  grant: "Grant",
  internship: "Internship",
  general: "General",
};

/** Human label for a template case type, falling back to the raw key. */
export function caseTypeLabel(type: CaseType): string {
  return CASE_TYPE_LABELS[type] ?? type;
}

/**
 * Friendly copy for a non-blocking create-from-template warning. Room/request
 * limit hits don't fail the case — they explain what was skipped so the team can
 * follow up. Unknown keys fall back to a humanized version of the key.
 */
export function templateWarningLabel(
  warning: CreateCaseFromTemplateWarning | string,
): string {
  switch (warning) {
    case "room_limit_reached":
      return "Sharing-room limit reached — room not created";
    case "request_limit_reached":
      return "Document-request limit reached — some requests not created";
    case "room_not_created":
      return "Sharing room could not be created";
    default:
      return humanizeEventType(warning);
  }
}

/**
 * Expand a template's title pattern for a given person, replacing every
 * `{person_name}` placeholder with the name (trimmed). An empty/blank name
 * leaves the placeholder visible so the preview reads as a template, not a
 * broken title. A pattern with no placeholder is returned unchanged.
 */
export function renderTemplateTitlePreview(
  pattern: string,
  personName: string,
): string {
  const name = personName.trim();
  if (!name) return pattern;
  return pattern.replace(/\{person_name\}/g, name);
}

/**
 * Copy text to the clipboard. Returns true on success. Falls back to a
 * temporary textarea + execCommand for non-secure contexts where the async
 * Clipboard API is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
