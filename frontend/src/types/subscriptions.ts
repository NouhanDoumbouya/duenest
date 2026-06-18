// Types for the Subscription / Recurring Renewal Tracker API. These mirror the
// backend serializers in apps/subscriptions/serializers.py. This is NOT DueNest
// billing - it tracks the user's own recurring payments and renewals.

export type SubscriptionStatus =
  | "active"
  | "trial"
  | "paused"
  | "cancelled"
  | "expired";

export type BillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type IntervalUnit = "days" | "weeks" | "months" | "years";

export type Importance = "essential" | "useful" | "optional" | "rarely_used";

export type SubscriptionUrgency =
  | "overdue"
  | "renews_today"
  | "renews_soon"
  | "upcoming"
  | "normal"
  | "cancelled"
  | "expired"
  | "paused";

export type ReviewStatus =
  | "healthy"
  | "review"
  | "cancel_candidate"
  | "urgent"
  | "trial_attention";

export interface SubscriptionCategory {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
  is_system: boolean;
  sort_order: number;
}

export interface SubscriptionState {
  urgency: SubscriptionUrgency;
  days_until_renewal: number | null;
  days_until_cancellation_deadline: number | null;
  monthly_equivalent: string | null;
  yearly_equivalent: string | null;
  cost_is_estimable: boolean;
  cancellation_deadline_soon: boolean;
  trial_ending_soon: boolean;
  // Renewal intelligence (V1.1)
  urgency_status: SubscriptionUrgency;
  days_until_next_billing: number | null;
  monthly_equivalent_amount: string | null;
  yearly_equivalent_amount: string | null;
  is_high_yearly_cost: boolean;
  is_rarely_used: boolean;
  review_status: ReviewStatus;
  review_reasons: string[];
  next_best_action: string;
}

export interface Subscription {
  id: number;
  category: number | null;
  category_detail: SubscriptionCategory | null;
  name: string;
  provider: string;
  provider_key: string;
  plan_name: string;
  account_email: string;
  website_url: string;
  status: SubscriptionStatus;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  custom_interval_count: number | null;
  custom_interval_unit: IntervalUnit | "";
  start_date: string | null;
  next_billing_date: string | null;
  cancellation_deadline: string | null;
  auto_renew: boolean;
  reminder_days_before: number;
  payment_method_label: string;
  importance: Importance;
  last_used_date: string | null;
  notes: string;
  price_change_note: string;
  pinned: boolean;
  cancel_candidate: boolean;
  last_reviewed_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  // Hidden from Life Radar / Attention until this future datetime, if set.
  attention_snoozed_until: string | null;
  state: SubscriptionState;
  created_at: string;
  updated_at: string;
}

// Fields accepted on create/update. Mirrors the writable serializer fields.
export interface SubscriptionInput {
  name: string;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string | null;
  category?: number | null;
  provider?: string;
  provider_key?: string;
  plan_name?: string;
  account_email?: string;
  website_url?: string;
  status?: SubscriptionStatus;
  custom_interval_count?: number | null;
  custom_interval_unit?: IntervalUnit | "";
  start_date?: string | null;
  cancellation_deadline?: string | null;
  auto_renew?: boolean;
  reminder_days_before?: number;
  payment_method_label?: string;
  importance?: Importance;
  last_used_date?: string | null;
  notes?: string;
  price_change_note?: string;
  pinned?: boolean;
  cancel_candidate?: boolean;
}

export interface SubscriptionPaymentRecord {
  id: number;
  subscription: number;
  amount: string;
  currency: string;
  paid_on: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface TopUpcomingRenewal {
  id: number;
  name: string;
  provider: string;
  amount: string;
  currency: string;
  next_billing_date: string;
  days_until_renewal: number;
  auto_renew: boolean;
  review_status: ReviewStatus;
}

export interface SubscriptionSummary {
  active_count: number;
  trial_count: number;
  cancelled_count: number;
  paused_count: number;
  total_count: number;
  monthly_cost_by_currency: Record<string, string>;
  yearly_cost_by_currency: Record<string, string>;
  cost_unestimable_count: number;
  renewals_this_week: number;
  renewals_this_month: number;
  auto_renewing_soon: number;
  trials_ending_soon: number;
  cancellation_deadlines_soon: number;
  high_yearly_cost_count: number;
  rarely_used_count: number;
  review_recommended_count: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_importance: Record<string, number>;
  spend_by_category: Record<string, Record<string, string>>;
  top_upcoming_renewals: TopUpcomingRenewal[];
}

export interface SubscriptionAttentionItem {
  id: number;
  name: string;
  provider: string;
  category: string | null;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  auto_renew: boolean;
  next_billing_date: string | null;
  cancellation_deadline: string | null;
  urgency: SubscriptionUrgency;
  review_status: ReviewStatus;
  next_best_action: string;
  days_until_renewal: number | null;
  reasons: string[];
}

export interface SubscriptionAttentionResponse {
  count: number;
  items: SubscriptionAttentionItem[];
}

export interface SubscriptionListParams {
  status?: SubscriptionStatus;
  category?: string | number;
  billing_cycle?: BillingCycle;
  auto_renew?: boolean;
  currency?: string;
  renews_within_days?: number;
  search?: string;
  ordering?: string;
  archived?: boolean;
  page?: number;
}
