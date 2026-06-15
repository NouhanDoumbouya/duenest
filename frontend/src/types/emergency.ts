// Types for emergency access packs.
// Mirrors the backend EmergencyAccessPackSerializer (/api/v1/emergency-packs/).

export type EmergencyPackStatus = "draft" | "active" | "disabled" | "expired";

export type EmergencyPackAccessMode =
  | "owner_only_preview"
  | "share_link"
  | "future_trusted_contact";

export type EmergencyUnlockMode =
  | "owner_approval"
  | "delayed"
  | "instant_code"
  | "disabled_until_activated";

export type EmergencyLocationPrecision = "approximate" | "precise";

export interface EmergencyLocation {
  label: string;
  lat: number | null;
  lng: number | null;
}

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
  unlock_mode: EmergencyUnlockMode;
  unlock_delay_hours: number;
  expires_at: string | null;
  access_code_required: boolean;
  access_duration_minutes: number | null;
  allow_downloads: boolean;
  location_enabled: boolean;
  location_precision: EmergencyLocationPrecision;
  last_known_location: EmergencyLocation | null;
  last_known_location_at: string | null;
  last_reviewed_at: string | null;
  /** Relative public API path, only present while the pack is shareable now. */
  share_url_path: string | null;
  /** Relative frontend viewer path (/emergency/{token}/), when shareable. */
  public_url_path: string | null;
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
  unlock_mode?: EmergencyUnlockMode;
  unlock_delay_hours?: number;
  expires_at?: string | null;
  access_code_required?: boolean;
  access_duration_minutes?: number | null;
  allow_downloads?: boolean;
  /** Write-only; required when access_code_required is true. */
  access_code?: string;
}

// ---- Trusted contacts ------------------------------------------------------

export type TrustedContactRelationship =
  | "parent"
  | "sibling"
  | "spouse"
  | "friend"
  | "guardian"
  | "roommate"
  | "colleague"
  | "other";

export type TrustedContactAccessLevel =
  | "can_request"
  | "instant_with_code"
  | "notify_only";

export type TrustedContactVerification = "unverified" | "notified" | "verified";

export interface EmergencyTrustedContact {
  id: number;
  owner: number;
  pack: number;
  name: string;
  relationship: TrustedContactRelationship;
  email: string;
  phone: string;
  note: string;
  is_primary: boolean;
  is_backup: boolean;
  access_level: TrustedContactAccessLevel;
  verification_status: TrustedContactVerification;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTrustedContactRequest {
  name: string;
  relationship?: TrustedContactRelationship;
  email?: string;
  phone?: string;
  note?: string;
  is_primary?: boolean;
  is_backup?: boolean;
  access_level?: TrustedContactAccessLevel;
}

// ---- Unlock requests (owner side) ------------------------------------------

export type EmergencyUnlockStatus =
  | "pending"
  | "countdown"
  | "unlocked"
  | "denied"
  | "revoked"
  | "expired";

export interface EmergencyUnlockRequest {
  id: number;
  requester_name: string;
  relationship: string;
  reason: string;
  contact_info: string;
  status: EmergencyUnlockStatus;
  unlock_at: string | null;
  access_expires_at: string | null;
  decided_at: string | null;
  created_at: string;
}

// ---- Activity log ----------------------------------------------------------

export interface EmergencyActivityEvent {
  id: number;
  event_type: string;
  actor_label: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type UpdateEmergencyPackRequest = Partial<CreateEmergencyPackRequest>;

export interface CreateEmergencyPackItemRequest {
  linked_document: number;
  linked_file?: number | null;
  notes?: string;
}

// ---- Public viewer (mirrors PublicEmergencyPackSerializer) -----------------

export interface PublicEmergencyItem {
  id: number;
  title: string;
  document_type: string;
  file_name: string | null;
  is_previewable: boolean;
  has_file: boolean;
  notes: string;
}

export type PublicEmergencyAccessState = "open" | "request_required";

export interface PublicEmergencyLocation {
  label: string;
  precision: EmergencyLocationPrecision;
  lat: number | null;
  lng: number | null;
  updated_at: string | null;
}

export interface PublicEmergencyPack {
  title: string;
  description: string;
  access_code_required: boolean;
  expires_at: string | null;
  unlock_mode: EmergencyUnlockMode;
  requires_unlock_request: boolean;
  allow_downloads: boolean;
  access_state: PublicEmergencyAccessState;
  items: PublicEmergencyItem[];
  location: PublicEmergencyLocation | null;
  /** Present only when polling with a request token. */
  request?: {
    status: EmergencyUnlockStatus;
    unlock_at: string | null;
  };
}

export interface CreateUnlockRequestPayload {
  requester_name: string;
  relationship?: string;
  reason?: string;
  contact_info?: string;
  access_code?: string;
}

export interface UnlockRequestResult {
  /** Present for request-gated packs (owner approval / delayed). */
  request_token?: string;
  status?: EmergencyUnlockStatus;
  unlock_at?: string | null;
  /** Present for instant/legacy packs that open immediately. */
  state?: "open";
}
