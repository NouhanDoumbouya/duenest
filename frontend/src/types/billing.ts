// Types for the DueNest billing layer (/api/v1/billing/* + founder/billing/*).

export type BillingInterval = "month" | "year";

export interface PlanEntitlement {
  feature_key: string;
  limit_value: number | null; // null = unlimited
  limit_period: "total" | "month" | "day";
  is_enabled: boolean;
}

export interface BillingPlan {
  key: string;
  name: string;
  description: string;
  tier: "free" | "pro" | "family" | "organization";
  is_public: boolean;
  is_recommended: boolean;
  currency: string;
  monthly_price: number | null; // minor units
  yearly_price: number | null; // minor units
  trial_days: number;
  sort_order: number;
  entitlements: PlanEntitlement[];
  metadata: Record<string, unknown>;
}

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "grace_period"
  | "beta"
  | "founder"
  | "lifetime"
  | "manual_pro"
  | "org_active"
  | "org_past_due";

export interface BillingStatus {
  plan: string;
  plan_name: string;
  tier: string;
  status: SubscriptionStatus;
  is_pro: boolean;
  is_free: boolean;
  billing_interval: BillingInterval | "lifetime" | "none";
  currency: string;
  amount: number;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  grace_period_until: string | null;
  active_promo_code: string | null;
  manual_access: { active: boolean; status: string; reason: string } | null;
  provider: string;
  test_mode: boolean;
  message: string;
}

export interface PromoValidation {
  valid: boolean;
  reason: string;
  code: string | null;
  promo_type: string | null;
  discount_label: string;
}

export interface CheckoutResponse {
  checkout_url: string;
  manual: boolean;
}

export interface InvoiceRecord {
  provider_invoice_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  hosted_invoice_url: string;
  invoice_pdf_url: string;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

// Founder/admin
export interface BillingOverview {
  free_users: number;
  pro_users: number;
  active_paid_subscriptions: number;
  trialing: number;
  past_due: number;
  canceled: number;
  mrr_estimate_minor: number;
  arr_estimate_minor: number;
  promo_redemptions: number;
  active_manual_grants: number;
  estimate_note: string;
}

export interface Subscriber {
  id: number;
  user: number;
  user_email: string;
  plan_key: string;
  status: SubscriptionStatus;
  billing_interval: string;
  currency: string;
  amount: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface PromoCodeAdmin {
  id: number;
  code: string;
  name: string;
  description: string;
  promo_type: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string;
  duration: string;
  duration_months: number | null;
  trial_extension_days: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_user: number;
  redemption_count: number;
  applies_to_plans: string[];
  applies_to_billing_intervals: string[];
  is_active: boolean;
  created_at: string;
}
