import { apiFetch } from "./api";

export type GrowthRange = "7d" | "30d" | "90d" | "all";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  change_pct: number | null;
  previous: number;
}

export interface Kpi {
  value: number | null;
  unit?: string;
  trend?: KpiTrend | null;
  available?: boolean;
  explanation?: string;
}

export interface GrowthInsight {
  key: string;
  title: string;
  body: string;
  severity: "info" | "high" | "critical";
  action_type: string;
  priority: string;
}

export interface DropOff {
  from: string;
  to: string;
  drop_pct: number;
  lost_users: number;
}

export interface GrowthOverview {
  range: GrowthRange;
  kpis: Record<string, Kpi>;
  top_channel: { name: string; signups: number } | null;
  best_campaign: { name: string; signups: number } | null;
  biggest_drop_off: DropOff | null;
  insights: GrowthInsight[];
  recommended_action: GrowthInsight | null;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  estimated?: boolean;
  conversion_from_prev?: number | null;
}

export interface GrowthFunnel {
  range: GrowthRange;
  steps: FunnelStep[];
  biggest_drop_off: DropOff | null;
  total_conversion_signup_to_activated: number | null;
}

export interface CampaignMetrics {
  visitors: number;
  signups: number;
  activated_users: number;
  conversion_rate: number | null;
  activation_rate: number | null;
  cost: number | null;
  cpa: number | null;
}

export interface Campaign {
  id: number;
  name: string;
  slug: string;
  description: string;
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  target_audience: string;
  status: "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  currency: string;
  goal: string;
  cta: string;
  landing_url: string;
  generated_url: string;
  tags: string[];
  notes: string;
  metrics: CampaignMetrics;
  links: CampaignLink[];
  created_at: string;
  updated_at: string;
}

export interface CampaignLink {
  id: number;
  campaign: number;
  label: string;
  base_url: string;
  full_url: string;
  source: string;
  medium: string;
  content: string;
  term: string;
  created_at: string;
}

export interface GrowthAction {
  id: number;
  title: string;
  description: string;
  reason: string;
  action_type: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "open" | "in_progress" | "done" | "snoozed" | "dismissed";
  related_metric: string;
  campaign: number | null;
  due_at: string | null;
  snoozed_until: string | null;
  action_url: string;
  metadata: Record<string, unknown>;
  created_automatically: boolean;
  created_at: string;
  updated_at: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

function rangeQuery(range?: GrowthRange): string {
  return range ? `?range=${encodeURIComponent(range)}` : "";
}

export function getGrowthOverview(range?: GrowthRange): Promise<GrowthOverview> {
  return apiFetch<GrowthOverview>(`/founder/growth/overview/${rangeQuery(range)}`, {
    auth: true,
  });
}

export function getGrowthFunnel(range?: GrowthRange): Promise<GrowthFunnel> {
  return apiFetch<GrowthFunnel>(`/founder/growth/funnel/${rangeQuery(range)}`, {
    auth: true,
  });
}

export function listCampaigns(range?: GrowthRange): Promise<Paginated<Campaign>> {
  return apiFetch<Paginated<Campaign>>(`/founder/growth/campaigns/${rangeQuery(range)}`, {
    auth: true,
  });
}

export function createCampaign(payload: Partial<Campaign>): Promise<Campaign> {
  return apiFetch<Campaign>("/founder/growth/campaigns/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateCampaign(id: number, payload: Partial<Campaign>): Promise<Campaign> {
  return apiFetch<Campaign>(`/founder/growth/campaigns/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export interface UtmBuilderInput {
  base_url: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
  campaign_id?: number;
  label?: string;
}

export function buildUtmLink(
  input: UtmBuilderInput,
): Promise<{ url: string; saved_link: CampaignLink | null }> {
  return apiFetch("/founder/growth/utm-builder/", {
    method: "POST",
    body: input,
    auth: true,
  });
}

export function listGrowthActions(status?: string): Promise<Paginated<GrowthAction>> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<Paginated<GrowthAction>>(`/founder/growth/actions/${q}`, { auth: true });
}

export function createGrowthAction(payload: Partial<GrowthAction>): Promise<GrowthAction> {
  return apiFetch<GrowthAction>("/founder/growth/actions/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateGrowthAction(
  id: number,
  payload: Partial<GrowthAction>,
): Promise<GrowthAction> {
  return apiFetch<GrowthAction>(`/founder/growth/actions/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export const GROWTH_RANGES: { value: GrowthRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export const UTM_SOURCE_SUGGESTIONS = [
  "facebook", "whatsapp", "linkedin", "tiktok", "instagram", "twitter",
  "reddit", "producthunt", "email", "referral", "ambassador", "campus", "community",
];

export const UTM_MEDIUM_SUGGESTIONS = [
  "social", "community", "post", "dm", "email", "video", "bio_link",
  "flyer", "qr", "referral", "partner",
];
