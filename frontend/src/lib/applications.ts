// Application Tracker API client — deterministic, owner-scoped (no AI).

import { apiFetch } from "./api";
import type {
  ApplicationListResponse,
  ApplicationStatus,
  ApplicationSummary,
  ApplicationType,
  CreateApplicationRequest,
  DeadlineState,
  TrackedApplication,
  UpdateApplicationRequest,
} from "@/types/applications";

export interface ApplicationListParams {
  status?: string;
  type?: string;
  archived?: boolean;
}

export function getApplications(
  params?: ApplicationListParams,
): Promise<ApplicationListResponse> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.type) search.set("type", params.type);
  if (params?.archived) search.set("archived", "true");
  const qs = search.toString();
  return apiFetch<ApplicationListResponse>(
    `/applications/${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}

export function getApplication(id: number): Promise<TrackedApplication> {
  return apiFetch<TrackedApplication>(`/applications/${id}/`, { auth: true });
}

export function getApplicationSummary(): Promise<ApplicationSummary> {
  return apiFetch<ApplicationSummary>(`/applications/summary/`, { auth: true });
}

export function createApplication(
  payload: CreateApplicationRequest,
): Promise<TrackedApplication> {
  return apiFetch<TrackedApplication>(`/applications/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateApplication(
  id: number,
  payload: UpdateApplicationRequest,
): Promise<TrackedApplication> {
  return apiFetch<TrackedApplication>(`/applications/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

/** Archive (soft-delete) an application. */
export function archiveApplication(id: number): Promise<void> {
  return apiFetch<void>(`/applications/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  scholarship: "Scholarship",
  university: "University",
  visa: "Visa",
  job: "Job",
  internship: "Internship",
  grant: "Grant",
  permit: "Permit",
  renewal: "Renewal",
  other: "Other",
};

/** StatusBadge tone for an application status. */
export function applicationStatusTone(
  status: ApplicationStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "ready_to_submit":
    case "accepted":
      return "success";
    case "submitted":
    case "under_review":
    case "interview":
      return "info";
    case "documents_missing":
    case "renewal_needed":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

/** StatusBadge tone for a deadline state. */
export function deadlineStateTone(
  state: DeadlineState,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (state) {
    case "overdue":
      return "danger";
    case "urgent":
      return "warning";
    case "soon":
      return "info";
    case "completed":
      return "success";
    default:
      return "neutral";
  }
}

export function deadlineStateLabel(
  state: DeadlineState,
  days: number | null,
): string {
  switch (state) {
    case "no_deadline":
      return "No deadline";
    case "overdue":
      return days != null ? `Overdue by ${Math.abs(days)}d` : "Overdue";
    case "urgent":
    case "soon":
    case "upcoming":
      return days != null ? `In ${days}d` : "Upcoming";
    case "completed":
      return "Completed";
    default:
      return "—";
  }
}
