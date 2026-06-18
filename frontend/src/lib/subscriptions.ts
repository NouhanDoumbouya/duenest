// API client for the Subscription / Recurring Renewal Tracker.
//
// Every call is authenticated; the backend scopes all data to the requesting
// user. Mirrors the endpoints in apps/subscriptions/urls.py.

import { API_BASE_URL, ApiError, apiFetch } from "./api";
import { getAccessToken } from "./auth";
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

/**
 * Snooze a subscription off the Life Radar / Attention surfaces for `days`
 * (default 7). Passing `days <= 0` clears the snooze. Does not change the real
 * renewal dates — only when we nudge the owner about it.
 */
export function snoozeSubscription(
  id: number,
  days = 7,
): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/snooze/`, {
    method: "POST",
    body: { days },
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

export function toggleSubscriptionPin(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/toggle-pin/`, {
    method: "POST",
    auth: true,
  });
}

export function reviewSubscription(
  id: number,
  body?: { cancel_candidate?: boolean },
): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/review/`, {
    method: "POST",
    body: body ?? {},
    auth: true,
  });
}

export function pauseSubscription(id: number): Promise<Subscription> {
  // Pausing is a status change; the backend already supports the "paused"
  // status via the standard update endpoint.
  return updateSubscription(id, { status: "paused" });
}

/**
 * Download the user's subscriptions as a CSV file. Fetches the authenticated
 * blob and triggers a browser download. Safe fields only (the backend never
 * includes card numbers, tokens, or secrets).
 */
export async function exportSubscriptionsCsv(): Promise<void> {
  const headers = new Headers({ Accept: "text/csv" });
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/subscriptions/export/`, {
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0, null);
  }
  if (!response.ok) {
    throw new ApiError("Could not export your subscriptions.", response.status, null);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "duenest-subscriptions.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
