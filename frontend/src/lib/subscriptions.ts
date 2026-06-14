// API client for the Subscription / Recurring Renewal Tracker.
//
// Every call is authenticated; the backend scopes all data to the requesting
// user. Mirrors the endpoints in apps/subscriptions/urls.py.

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  Subscription,
  SubscriptionAttentionResponse,
  SubscriptionCategory,
  SubscriptionInput,
  SubscriptionListParams,
  SubscriptionPaymentRecord,
  SubscriptionSummary,
} from "@/types/subscriptions";

function toQueryString(params?: SubscriptionListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const BILLING_CYCLE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trial: "Trial",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const IMPORTANCE_LABELS: Record<string, string> = {
  essential: "Essential",
  useful: "Useful",
  optional: "Optional",
  rarely_used: "Rarely used",
};

// Presentation for the rule-based review status. Chip classes match the
// product's existing tone vocabulary (destructive / amber / primary / muted).
export const REVIEW_STATUS_META: Record<
  string,
  { label: string; chip: string; show: boolean }
> = {
  healthy: {
    label: "Healthy",
    chip: "border-brand-success/25 bg-brand-success/10 text-brand-success",
    show: false,
  },
  review: {
    label: "Review",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    show: true,
  },
  trial_attention: {
    label: "Trial attention",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    show: true,
  },
  cancel_candidate: {
    label: "Cancel candidate",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    show: true,
  },
  urgent: {
    label: "Urgent",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    show: true,
  },
};

export function listSubscriptions(
  params?: SubscriptionListParams,
): Promise<Paginated<Subscription>> {
  return apiFetch<Paginated<Subscription>>(
    `/subscriptions/${toQueryString(params)}`,
    { auth: true },
  );
}

export function getSubscription(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/`, { auth: true });
}

export function createSubscription(
  input: SubscriptionInput,
): Promise<Subscription> {
  return apiFetch<Subscription>("/subscriptions/", {
    method: "POST",
    body: input,
    auth: true,
  });
}

export function updateSubscription(
  id: number,
  input: Partial<SubscriptionInput>,
): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/`, {
    method: "PATCH",
    body: input,
    auth: true,
  });
}

export function deleteSubscription(id: number): Promise<void> {
  return apiFetch<void>(`/subscriptions/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function archiveSubscription(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/archive/`, {
    method: "POST",
    auth: true,
  });
}

export function restoreSubscription(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/restore/`, {
    method: "POST",
    auth: true,
  });
}

export function markSubscriptionCancelled(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/mark-cancelled/`, {
    method: "POST",
    auth: true,
  });
}

export function markSubscriptionPaid(
  id: number,
  body?: { amount?: string; paid_on?: string; notes?: string },
): Promise<{ subscription: Subscription; payment: SubscriptionPaymentRecord }> {
  return apiFetch(`/subscriptions/${id}/mark-paid/`, {
    method: "POST",
    body: body ?? {},
    auth: true,
  });
}

export function skipNextRenewal(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/skip-next-renewal/`, {
    method: "POST",
    auth: true,
  });
}

export function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  return apiFetch<SubscriptionSummary>("/subscriptions/summary/", {
    auth: true,
  });
}

export function getSubscriptionAttention(): Promise<SubscriptionAttentionResponse> {
  return apiFetch<SubscriptionAttentionResponse>("/subscriptions/attention/", {
    auth: true,
  });
}

export function listSubscriptionCategories(): Promise<SubscriptionCategory[]> {
  return apiFetch<SubscriptionCategory[]>("/subscription-categories/", {
    auth: true,
  });
}

export function listSubscriptionPayments(
  id: number,
): Promise<SubscriptionPaymentRecord[]> {
  return apiFetch<SubscriptionPaymentRecord[]>(
    `/subscriptions/${id}/payments/`,
    { auth: true },
  );
}

export function createSubscriptionPayment(
  id: number,
  body: {
    amount: string;
    paid_on: string;
    currency?: string;
    billing_period_start?: string | null;
    billing_period_end?: string | null;
    notes?: string;
  },
): Promise<SubscriptionPaymentRecord> {
  return apiFetch<SubscriptionPaymentRecord>(
    `/subscriptions/${id}/payments/`,
    { method: "POST", body, auth: true },
  );
}

export function deleteSubscriptionPayment(
  id: number,
  paymentId: number,
): Promise<void> {
  return apiFetch<void>(`/subscriptions/${id}/payments/${paymentId}/`, {
    method: "DELETE",
    auth: true,
  });
}
