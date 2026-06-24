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

import { apiFetch } from "./api";
import type {
  CreateCasePackBody,
  CreateCaseRequestBody,
  CreatePortalCaseBody,
  CreatePortalPersonBody,
  PortalCase,
  PortalCaseFilters,
  PortalCasePriority,
  PortalCaseProgress,
  PortalCaseStatus,
  PortalCaseType,
  PortalCasesResponse,
  PortalPeopleResponse,
  PortalPerson,
  PortalPersonStatus,
  PortalPersonType,
  PortalReviewQueueResponse,
  PortalSummary,
  UpdatePortalCaseBody,
  UpdatePortalPersonBody,
} from "@/types/portals";
import type { StatusTone } from "./status-badge";

/** Build the base path for a portal sub-resource. */
function base(orgId: number, suffix = ""): string {
  return `/organizations/${orgId}/portal/${suffix}`;
}

// ---- Summary ----------------------------------------------------------------

/** Read the portal dashboard summary counts. */
export function getPortalSummary(orgId: number): Promise<PortalSummary> {
  return apiFetch<PortalSummary>(base(orgId, "summary/"));
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

/** List uploads across all cases that are waiting for review. */
export function getPortalReviewQueue(
  orgId: number,
): Promise<PortalReviewQueueResponse> {
  return apiFetch<PortalReviewQueueResponse>(base(orgId, "review-queue/"));
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
