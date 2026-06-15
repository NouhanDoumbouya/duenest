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

// --- Remaining modules: content, segments, ambassadors, referrals, charts ---

export interface ContentItem {
  id: number;
  title: string;
  channel: string;
  content_type: string;
  target_audience: string;
  campaign: number | null;
  status: "idea" | "draft" | "scheduled" | "published" | "measuring" | "repurpose" | "archived";
  priority: "high" | "medium" | "low";
  scheduled_at: string | null;
  published_at: string | null;
  cta: string;
  utm_link: string;
  notes: string;
  tags: string[];
  result_metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SegmentSummary {
  size: number;
  activation_rate: number | null;
  avg_documents: number | null;
  error?: string;
}

export interface AudienceSegment {
  id: number;
  name: string;
  description: string;
  rules_json: Record<string, unknown>;
  is_dynamic: boolean;
  status: "active" | "archived";
  summary: SegmentSummary;
  created_at: string;
  updated_at: string;
}

export interface Ambassador {
  id: number;
  name: string;
  email: string;
  community: string;
  campus: string;
  referral_code: string;
  status: "candidate" | "invited" | "active" | "paused" | "completed" | "removed";
  notes: string;
  reward_notes: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralRow {
  referrer_id: number;
  referrer_email: string;
  signups: number;
  activated: number;
}

export interface AmbassadorLeaderRow {
  id: number;
  name: string;
  community: string;
  campus: string;
  status: string;
  referral_code: string;
  signups: number;
  activated: number;
}

export interface GrowthCharts {
  range: string;
  signups_over_time: { date: string; count: number }[];
  activated_over_time: { date: string; count: number }[];
  channel_comparison: { name: string; signups: number }[];
  action_priority_breakdown: { priority: string; count: number }[];
  activation_by_segment: { name: string; activation_rate: number | null; size: number }[];
  referral_leaderboard: ReferralRow[];
  ambassador_leaderboard: AmbassadorLeaderRow[];
}

interface Paginated2<T> {
  count: number;
  results: T[];
}

export function listContentItems(): Promise<Paginated2<ContentItem>> {
  return apiFetch("/founder/growth/content/", { auth: true });
}
export function createContentItem(payload: Partial<ContentItem>): Promise<ContentItem> {
  return apiFetch("/founder/growth/content/", { method: "POST", body: payload, auth: true });
}
export function updateContentItem(id: number, payload: Partial<ContentItem>): Promise<ContentItem> {
  return apiFetch(`/founder/growth/content/${id}/`, { method: "PATCH", body: payload, auth: true });
}

export function listSegments(): Promise<Paginated2<AudienceSegment>> {
  return apiFetch("/founder/growth/segments/", { auth: true });
}
export function createSegment(payload: Partial<AudienceSegment>): Promise<AudienceSegment> {
  return apiFetch("/founder/growth/segments/", { method: "POST", body: payload, auth: true });
}
export function getSegmentMembers(
  id: number,
): Promise<{ count: number; members: { id: number; email: string; plan: string; activated: boolean; date_joined: string }[] }> {
  return apiFetch(`/founder/growth/segments/${id}/members/`, { auth: true });
}

export function listAmbassadors(): Promise<Paginated2<Ambassador>> {
  return apiFetch("/founder/growth/ambassadors/", { auth: true });
}
export function createAmbassador(payload: Partial<Ambassador>): Promise<Ambassador> {
  return apiFetch("/founder/growth/ambassadors/", { method: "POST", body: payload, auth: true });
}

export function getReferrals(): Promise<{ referrals: ReferralRow[]; ambassadors: AmbassadorLeaderRow[] }> {
  return apiFetch("/founder/growth/referrals/", { auth: true });
}

export function getGrowthCharts(range?: GrowthRange): Promise<GrowthCharts> {
  return apiFetch(`/founder/growth/charts/${range ? `?range=${range}` : ""}`, { auth: true });
}

export function generateAutoActions(): Promise<{ created: number; actions: GrowthAction[] }> {
  return apiFetch("/founder/growth/actions/generate/", { method: "POST", auth: true });
}

export function captureAttribution(payload: Record<string, string>): Promise<{ status: string }> {
  return apiFetch("/growth/attribution/", { method: "POST", body: payload, auth: true });
}
