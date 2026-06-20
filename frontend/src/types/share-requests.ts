export type ShareRequestStatus = "open" | "responded" | "closed" | "expired";

export interface ShareRequestItem {
  id: number;
  label: string;
  description: string;
  is_required: boolean;
  expected_document_type: string;
  sort_order: number;
}

export interface ShareRequest {
  id: number;
  title: string;
  message: string;
  token: string;
  respond_path: string;
  status: ShareRequestStatus;
  is_open: boolean;
  expires_at: string | null;
  items: ShareRequestItem[];
  response_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateShareRequestItem {
  label: string;
  description?: string;
  is_required?: boolean;
  expected_document_type?: string;
}

export interface CreateShareRequestPayload {
  title: string;
  message?: string;
  expires_at?: string | null;
  items: CreateShareRequestItem[];
}

export interface PublicShareRequestItem {
  id: number;
  label: string;
  description: string;
  is_required: boolean;
  expected_document_type: string;
}

export interface PublicShareRequest {
  title: string;
  message: string;
  requester_name: string;
  status: ShareRequestStatus;
  is_open: boolean;
  expires_at: string | null;
  items: PublicShareRequestItem[];
}
