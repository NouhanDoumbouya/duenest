// Renewal history events (nested under a document).

export interface RenewalEvent {
  id: number;
  owner: number;
  document: number;
  document_title: string | null;
  renewal_date: string;
  previous_expiry_date: string | null;
  new_expiry_date: string | null;
  cost: string | null;
  currency: string;
  notes: string;
  proof: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRenewalEventRequest {
  renewal_date: string;
  previous_expiry_date?: string | null;
  new_expiry_date?: string | null;
  cost?: string | null;
  currency?: string;
  notes?: string;
  proof?: number | null;
}

export type UpdateRenewalEventRequest = Partial<CreateRenewalEventRequest>;
