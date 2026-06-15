import { apiFetch } from "./api";
import type {
  ActivationFunnel,
  AppErrorLog,
  BetaInviteStatus,
  BetaPersona,
  BetaUserProfile,
  ChecklistTemplate,
  ChecklistTemplateItem,
  CountryActivityResponse,
  FeatureFlag,
  FeatureFlagVisibility,
  FeatureCompletionItem,
  FeatureCompletionResponse,
  FeatureAdoption,
  FeedbackCategory,
  FeedbackItem,
  FeedbackPriority,
  FeedbackStatus,
  FounderAnalytics,
  FounderDashboard,
  FounderInviteCode,
  FounderRange,
  FounderMe,
  FounderPriority,
  FounderAuditLog,
  FounderUserListItem,
  FounderUserSummary,
  FounderWaitlistEntry,
  LaunchChecklistItem,
  LaunchReadinessResponse,
  Paginated,
  PrivateBetaMetrics,
  SecurityOverview,
  SubmitFeedbackRequest,
} from "@/types/founder";
import type { WaitlistPersona, WaitlistStatus } from "@/types/private-beta";

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

export function getFounderDashboard(params?: {
  range?: FounderRange;
}): Promise<FounderDashboard> {
  return apiFetch<FounderDashboard>(`/founder/dashboard/${query(params)}`, {
    auth: true,
  });
}

export function getFounderAnalytics(params?: {
  range?: FounderRange;
}): Promise<FounderAnalytics> {
  return apiFetch<FounderAnalytics>(`/founder/analytics/${query(params)}`, {
    auth: true,
  });
}

export function getPrivateBetaMetrics(): Promise<PrivateBetaMetrics> {
  return apiFetch<PrivateBetaMetrics>("/founder/private-beta/", {
    auth: true,
  });
}

export function getFounderWaitlist(params?: {
  search?: string;
  status?: WaitlistStatus | "";
  persona?: WaitlistPersona | "";
  country?: string;
}): Promise<Paginated<FounderWaitlistEntry>> {
  return apiFetch<Paginated<FounderWaitlistEntry>>(
    `/founder/waitlist/${query(params)}`,
    { auth: true },
  );
}

export function updateFounderWaitlistEntry(
  id: number,
  payload: Partial<Pick<FounderWaitlistEntry, "status" | "founder_notes" | "persona">>,
): Promise<FounderWaitlistEntry> {
  return apiFetch<FounderWaitlistEntry>(`/founder/waitlist/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function createInviteForWaitlistEntry(
  id: number,
  payload: {
    label?: string;
    custom_code?: string;
    max_uses?: number;
    expires_at?: string | null;
    notes?: string;
    persona_target?: WaitlistPersona | "";
  } = {},
): Promise<FounderInviteCode> {
  return apiFetch<FounderInviteCode>(
    `/founder/waitlist/${id}/create-invite/`,
    {
      method: "POST",
      body: payload,
      auth: true,
    },
  );
}

export function getFounderInvites(params?: {
  search?: string;
  is_active?: boolean | "";
  persona_target?: WaitlistPersona | "";
}): Promise<Paginated<FounderInviteCode>> {
  return apiFetch<Paginated<FounderInviteCode>>(
    `/founder/invites/${query(params)}`,
    { auth: true },
  );
}

export function createFounderInvite(payload: {
  label: string;
  custom_code?: string;
  max_uses: number;
  expires_at?: string | null;
  is_active?: boolean;
  persona_target?: WaitlistPersona | "";
  notes?: string;
  waitlist_entry_id?: number;
}): Promise<FounderInviteCode> {
  return apiFetch<FounderInviteCode>("/founder/invites/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateFounderInvite(
  id: number,
  payload: Partial<
    Pick<
      FounderInviteCode,
      "label" | "max_uses" | "expires_at" | "is_active" | "persona_target" | "notes"
    >
  >,
): Promise<FounderInviteCode> {
  return apiFetch<FounderInviteCode>(`/founder/invites/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function disableFounderInvite(id: number): Promise<FounderInviteCode> {
  return apiFetch<FounderInviteCode>(`/founder/invites/${id}/disable/`, {
    method: "POST",
    auth: true,
  });
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

export function getFeatureCompletion(params?: {
  status?: string;
  module?: string;
}): Promise<FeatureCompletionResponse> {
  return apiFetch<FeatureCompletionResponse>(
    `/founder/feature-completion/${query(params)}`,
    { auth: true },
  );
}

export function updateFeatureCompletion(
  id: number,
  payload: Partial<
    Pick<
      FeatureCompletionItem,
      | "backend_done"
      | "frontend_done"
      | "tests_done"
      | "docs_done"
      | "polished"
      | "status"
      | "priority"
      | "notes"
    >
  >,
): Promise<FeatureCompletionItem> {
  return apiFetch<FeatureCompletionItem>(`/founder/feature-completion/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function createFeatureCompletion(payload: {
  key?: string;
  feature_name: string;
  module: string;
  backend_done?: boolean;
  frontend_done?: boolean;
  tests_done?: boolean;
  docs_done?: boolean;
  polished?: boolean;
  status?: string;
  priority?: FounderPriority;
  notes?: string;
  sort_order?: number;
}): Promise<FeatureCompletionItem> {
  return apiFetch<FeatureCompletionItem>("/founder/feature-completion/", {
    method: "POST",
    body: payload,
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
    Pick<FeedbackItem, "status" | "priority" | "founder_notes" | "founder_response">
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

export function getFounderAuditLogs(): Promise<Paginated<FounderAuditLog>> {
  return apiFetch<Paginated<FounderAuditLog>>("/founder/audit-logs/", {
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

export function getBetaUsers(params?: {
  search?: string;
  invite_status?: BetaInviteStatus | "";
  persona?: BetaPersona | "";
}): Promise<Paginated<BetaUserProfile>> {
  return apiFetch<Paginated<BetaUserProfile>>(
    `/founder/beta-users/${query(params)}`,
    { auth: true },
  );
}

export function updateBetaUser(
  id: number,
  payload: Partial<
    Pick<
      BetaUserProfile,
      "invite_status" | "persona" | "tags" | "notes" | "last_contacted_at"
    >
  >,
): Promise<BetaUserProfile> {
  return apiFetch<BetaUserProfile>(`/founder/beta-users/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function getLaunchReadiness(): Promise<LaunchReadinessResponse> {
  return apiFetch<LaunchReadinessResponse>("/founder/launch-readiness/", {
    auth: true,
  });
}

export function updateLaunchReadinessItem(
  id: number,
  payload: Partial<
    Pick<LaunchChecklistItem, "is_complete" | "priority" | "notes">
  >,
): Promise<LaunchChecklistItem> {
  return apiFetch<LaunchChecklistItem>(`/founder/launch-readiness/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function getCountryActivity(params?: {
  range?: FounderRange;
}): Promise<CountryActivityResponse> {
  return apiFetch<CountryActivityResponse>(
    `/founder/country-activity/${query(params)}`,
    { auth: true },
  );
}

export const FOUNDER_PRIORITY_LABELS: Record<FounderPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// --- Feature Control Center (Feature Flags Lite) ---

export function getFounderFeatureFlags(): Promise<FeatureFlag[]> {
  return apiFetch<FeatureFlag[]>("/founder/feature-flags/", { auth: true });
}

export function updateFounderFeatureFlag(
  key: string,
  payload: {
    visibility?: FeatureFlagVisibility;
    maintenance_message?: string;
  },
): Promise<FeatureFlag> {
  return apiFetch<FeatureFlag>(`/founder/feature-flags/${key}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}
