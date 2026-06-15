// Billing API helpers (/api/v1/billing/* and /api/v1/founder/billing/*).

import { apiFetch } from "./api";
import type {
  BillingOverview,
  BillingPlan,
  BillingStatus,
  CheckoutResponse,
  BillingInterval,
  InvoiceRecord,
  PromoCodeAdmin,
  PromoValidation,
  Subscriber,
} from "@/types/billing";

// ---- Public / user ---------------------------------------------------------

export function getPlans(): Promise<BillingPlan[]> {
  return apiFetch<BillingPlan[]>("/billing/plans/");
}

export function getBillingStatus(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/billing/status/", { auth: true });
}

export function getInvoices(): Promise<InvoiceRecord[] | { results: InvoiceRecord[] }> {
  return apiFetch("/billing/invoices/", { auth: true });
}

export function validatePromoCode(
  code: string,
  planKey?: string,
  interval?: BillingInterval,
): Promise<PromoValidation> {
  return apiFetch<PromoValidation>("/billing/promo/validate/", {
    method: "POST",
    auth: true,
    body: { code, plan_key: planKey, interval },
  });
}

export function startCheckout(
  planKey: string,
  interval: BillingInterval,
  promoCode?: string,
): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/billing/checkout/", {
    method: "POST",
    auth: true,
    body: { plan_key: planKey, interval, promo_code: promoCode ?? "" },
  });
}

export function openBillingPortal(): Promise<{ portal_url: string }> {
  return apiFetch<{ portal_url: string }>("/billing/portal/", {
    method: "POST",
    auth: true,
  });
}

export function cancelSubscription(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/billing/cancel/", { method: "POST", auth: true });
}

export function resumeSubscription(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/billing/resume/", { method: "POST", auth: true });
}

// ---- Formatting ------------------------------------------------------------

/** Format minor units (cents) into a currency string, e.g. 599 -> "$5.99". */
export function formatMoney(minor: number | null, currency = "usd"): string {
  if (minor === null || minor === undefined) return "—";
  const symbol = currency.toLowerCase() === "myr" ? "RM" : "$";
  const major = minor / 100;
  return `${symbol}${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
}

/** Annual savings percentage of yearly vs 12× monthly, or null. */
export function annualSavingsPercent(
  monthly: number | null,
  yearly: number | null,
): number | null {
  if (!monthly || !yearly) return null;
  const fullYear = monthly * 12;
  if (fullYear <= 0 || yearly >= fullYear) return null;
  return Math.round(((fullYear - yearly) / fullYear) * 100);
}

// ---- Founder / admin -------------------------------------------------------

export function getBillingOverview(): Promise<BillingOverview> {
  return apiFetch<BillingOverview>("/founder/billing/overview/", { auth: true });
}

export function getSubscribers(params?: {
  status?: string;
  plan?: string;
}): Promise<Subscriber[] | { results: Subscriber[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.plan) qs.set("plan", params.plan);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/founder/billing/subscribers/${suffix}`, { auth: true });
}

export function getAdminPromoCodes(): Promise<
  PromoCodeAdmin[] | { results: PromoCodeAdmin[] }
> {
  return apiFetch("/founder/billing/promo-codes/", { auth: true });
}

export function createPromoCode(
  payload: Partial<PromoCodeAdmin>,
): Promise<PromoCodeAdmin> {
  return apiFetch<PromoCodeAdmin>("/founder/billing/promo-codes/", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updatePromoCode(
  id: number,
  payload: Partial<PromoCodeAdmin>,
): Promise<PromoCodeAdmin> {
  return apiFetch<PromoCodeAdmin>(`/founder/billing/promo-codes/${id}/`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function grantManualAccess(payload: {
  user: number;
  plan: number;
  grant_status: string;
  reason?: string;
}): Promise<{ id: number }> {
  return apiFetch("/founder/billing/manual-access/", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function revokeManualAccess(id: number): Promise<void> {
  return apiFetch<void>(`/founder/billing/manual-access/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

/** Coerce a paginated-or-plain list response into an array. */
export function asArray<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}
