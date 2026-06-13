import { apiFetch } from "./api";
import type {
  ActivationFunnel,
  AppErrorLog,
  ChecklistTemplate,
  ChecklistTemplateItem,
  FeatureAdoption,
  FeedbackCategory,
  FeedbackItem,
  FeedbackPriority,
  FeedbackStatus,
  FounderDashboard,
  FounderMe,
  FounderUserListItem,
  FounderUserSummary,
  Paginated,
  SecurityOverview,
  SubmitFeedbackRequest,
} from "@/types/founder";

function query(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function getFounderMe(): Promise<FounderMe> {
  return apiFetch<FounderMe>("/founder/me/", { auth: true });
}

export function getFounderDashboard(): Promise<FounderDashboard> {
  return apiFetch<FounderDashboard>("/founder/dashboard/", { auth: true });
}

export function getActivationFunnel(): Promise<ActivationFunnel> {
  return apiFetch<ActivationFunnel>("/founder/activation-funnel/", {
    auth: true,
  });
}

export function getFeatureAdoption(): Promise<FeatureAdoption> {
  return apiFetch<FeatureAdoption>("/founder/feature-adoption/", {
    auth: true,
  });
}

export function submitFeedback(
  payload: SubmitFeedbackRequest,
): Promise<Pick<FeedbackItem, "id" | "title" | "created_at">> {
  return apiFetch<Pick<FeedbackItem, "id" | "title" | "created_at">>(
    "/feedback/",
    {
      method: "POST",
      body: payload,
      auth: true,
    },
  );
}

export function getFounderFeedback(params?: {
  category?: FeedbackCategory | "";
  status?: FeedbackStatus | "";
  priority?: FeedbackPriority | "";
  search?: string;
}): Promise<Paginated<FeedbackItem>> {
  return apiFetch<Paginated<FeedbackItem>>(`/founder/feedback/${query(params)}`, {
    auth: true,
  });
}

export function updateFounderFeedback(
  id: number,
  payload: Partial<
    Pick<FeedbackItem, "status" | "priority" | "founder_notes">
  >,
): Promise<FeedbackItem> {
  return apiFetch<FeedbackItem>(`/founder/feedback/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function getChecklistTemplates(params?: {
  is_active?: boolean;
}): Promise<Paginated<ChecklistTemplate>> {
  return apiFetch<Paginated<ChecklistTemplate>>(
    `/founder/templates/checklists/${query(params)}`,
    { auth: true },
  );
}

export function createChecklistTemplate(payload: {
  title: string;
  description: string;
  checklist_type: string;
  document_type?: string;
  use_case?: string;
  country?: string;
  is_system_template: boolean;
  is_active: boolean;
  sort_order: number;
  items: ChecklistTemplateItem[];
}): Promise<ChecklistTemplate> {
  return apiFetch<ChecklistTemplate>("/founder/templates/checklists/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateChecklistTemplate(
  id: number,
  payload: Partial<ChecklistTemplate>,
): Promise<ChecklistTemplate> {
  return apiFetch<ChecklistTemplate>(`/founder/templates/checklists/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deactivateChecklistTemplate(id: number): Promise<ChecklistTemplate> {
  return apiFetch<ChecklistTemplate>(`/founder/templates/checklists/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function getFounderErrors(params?: {
  severity?: string;
  source?: string;
  resolved?: boolean | "";
}): Promise<Paginated<AppErrorLog>> {
  return apiFetch<Paginated<AppErrorLog>>(`/founder/errors/${query(params)}`, {
    auth: true,
  });
}

export function updateFounderError(
  id: number,
  payload: Pick<AppErrorLog, "resolved">,
): Promise<AppErrorLog> {
  return apiFetch<AppErrorLog>(`/founder/errors/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function getSecurityOverview(): Promise<SecurityOverview> {
  return apiFetch<SecurityOverview>("/founder/security-overview/", {
    auth: true,
  });
}

export function getFounderUsers(params?: {
  search?: string;
}): Promise<Paginated<FounderUserListItem>> {
  return apiFetch<Paginated<FounderUserListItem>>(
    `/founder/users/${query(params)}`,
    { auth: true },
  );
}

export function getFounderUserSummary(id: number): Promise<FounderUserSummary> {
  return apiFetch<FounderUserSummary>(`/founder/users/${id}/summary/`, {
    auth: true,
  });
}
