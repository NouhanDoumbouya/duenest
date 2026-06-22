export type ShareRequestStatus = "open" | "responded" | "closed" | "expired";

export interface ShareRequestItem {
  id: number;
  label: string;
  description: string;
  is_required: boolean;
  expected_document_type: string;
  sort_order: number;
}

export interface ShareRequestSubmission {
  id: number;
  submitted_by_email: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  notes: string;
  download_path: string;
  created_at: string;
}

export interface ShareRequest {
  id: number;
  title: string;
  message: string;
  token: string;
  respond_path: string;
  status: ShareRequestStatus;
  is_open: boolean;
  allow_external_upload: boolean;
  expires_at: string | null;
  items: ShareRequestItem[];
  submissions: ShareRequestSubmission[];
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
  allow_external_upload?: boolean;
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
  allow_external_upload: boolean;
  expires_at: string | null;
  items: PublicShareRequestItem[];
}
