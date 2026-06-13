// Renewal / application cost tracking (/api/v1/payments/).

export type PaymentStatus =
  | "pending"
  | "partial"
  | "paid"
  | "refunded"
  | "waived";

export interface Payment {
  id: number;
  owner: number;
  document: number | null;
  document_title: string | null;
  bundle: number | null;
  bundle_title: string | null;
  label: string;
  expected_cost: string | null;
  actual_cost: string | null;
  currency: string;
  payment_status: PaymentStatus;
  payment_date: string | null;
  proof: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentRequest {
  label: string;
  document?: number | null;
  bundle?: number | null;
  expected_cost?: string | null;
  actual_cost?: string | null;
  currency?: string;
  payment_status?: PaymentStatus;
  payment_date?: string | null;
  proof?: number | null;
  notes?: string;
}

export type UpdatePaymentRequest = Partial<CreatePaymentRequest>;
