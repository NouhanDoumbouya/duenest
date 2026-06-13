// Types for emergency access packs.
// Mirrors the backend EmergencyAccessPackSerializer (/api/v1/emergency-packs/).

export type EmergencyPackStatus = "draft" | "active" | "disabled" | "expired";

export type EmergencyPackAccessMode =
  | "owner_only_preview"
  | "share_link"
  | "future_trusted_contact";

export interface EmergencyPackItem {
  id: number;
  owner: number;
  pack: number;
  linked_document: number;
  linked_file: number | null;
  document_title: string | null;
  file_name: string | null;
  notes: string;
  sort_order: number;
  created_at: string;
}

export interface EmergencyPack {
  id: number;
  owner: number;
  title: string;
  description: string;
  status: EmergencyPackStatus;
  access_mode: EmergencyPackAccessMode;
  expires_at: string | null;
  access_code_required: boolean;
  /** Relative public path, only present while the pack is shareable now. */
  share_url_path: string | null;
  last_accessed_at: string | null;
  disabled_at: string | null;
  is_expired: boolean;
  item_count: number;
  items: EmergencyPackItem[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateEmergencyPackRequest {
  title: string;
  description?: string;
  access_mode?: EmergencyPackAccessMode;
  expires_at?: string | null;
  access_code_required?: boolean;
  /** Write-only; required when access_code_required is true. */
  access_code?: string;
}

export type UpdateEmergencyPackRequest = Partial<CreateEmergencyPackRequest>;

export interface CreateEmergencyPackItemRequest {
  linked_document: number;
  linked_file?: number | null;
  notes?: string;
}
