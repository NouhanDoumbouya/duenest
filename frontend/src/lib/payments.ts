// Renewal / application cost API helpers (/api/v1/payments/).

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  CreatePaymentRequest,
  Payment,
  PaymentStatus,
  UpdatePaymentRequest,
} from "@/types/payments";

export function getPayments(params?: {
  document?: number;
  bundle?: number;
}): Promise<Paginated<Payment>> {
  const search = new URLSearchParams();
  if (params?.document) search.set("document", String(params.document));
  if (params?.bundle) search.set("bundle", String(params.bundle));
  const query = search.toString();
  return apiFetch<Paginated<Payment>>(
    `/payments/${query ? `?${query}` : ""}`,
    { auth: true },
  );
}

export function createPayment(
  payload: CreatePaymentRequest,
): Promise<Payment> {
  return apiFetch<Payment>("/payments/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updatePayment(
  id: number,
  payload: UpdatePaymentRequest,
): Promise<Payment> {
  return apiFetch<Payment>(`/payments/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deletePayment(id: number): Promise<void> {
  return apiFetch<void>(`/payments/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  waived: "Waived",
};

export function formatMoney(
  amount: string | null,
  currency: string,
): string | null {
  if (amount === null || amount === "") return null;
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}
