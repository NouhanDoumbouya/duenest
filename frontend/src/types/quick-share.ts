// Types for Quick Share QR (sender, claim, and "Shared with me").

export type QuickShareMode =
  | "account_to_account"
  | "public_secure_qr"
  | "emergency_qr"
  | "organization_collection";

export type QuickSharePermission =
  | "view_only"
  | "download_allowed"
  | "save_copy_allowed";

export type QuickShareStatus =
  | "active"
  | "claimed"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked"
  | "consumed";

export interface QuickShareFile {
  file_id: number;
  name: string;
  source: string;
  file_size: number;
  content_type: string;
  is_previewable: boolean;
}

export type ClaimStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "blocked"
  | "expired";

export type ClaimApproval = "not_required" | "pending" | "approved" | "denied";

export interface QuickShareClaimSummary {
  id: number;
  receiver_name: string;
  receiver_initials: string;
  receiver_email: string;
  status: ClaimStatus;
  approval: ClaimApproval;
  user_agent_summary: string;
  claimed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  last_accessed_at: string | null;
}

export interface QuickShareSession {
  id: number;
  token: string;
  claim_path: string;
  fallback_code: string;
  mode: QuickShareMode;
  title: string;
  purpose: string;
  permission: QuickSharePermission;
  download_allowed: boolean;
  save_copy_allowed: boolean;
  status: QuickShareStatus;
  is_active: boolean;
  is_expired: boolean;
  is_revoked: boolean;
  expires_at: string;
  revoked_at: string | null;
  // Human-typable DueNest code for the "Receive code" flow (also aliased as
  // fallback_code for backward compatibility).
  dn_code: string;
  access_code_required: boolean;
  one_time: boolean;
  max_claims: number | null;
  claim_count: number;
  require_sender_approval: boolean;
  watermark_enabled: boolean;
  short_id: string;
  file_count: number;
  files: QuickShareFile[];
  claims: QuickShareClaimSummary[];
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  // Only present in the create response.
  access_code?: string;
}

export interface QuickShareListItem {
  id: number;
  mode: QuickShareMode;
  title: string;
  purpose: string;
  permission: QuickSharePermission;
  download_allowed: boolean;
  status: QuickShareStatus;
  is_active: boolean;
  is_expired: boolean;
  is_revoked: boolean;
  expires_at: string;
  claim_count: number;
  access_code_required: boolean;
  short_id: string;
  file_count: number;
  created_at: string;
  last_accessed_at: string | null;
}

export interface CreateQuickSharePayload {
  mode: QuickShareMode;
  title?: string;
  purpose?: string;
  permission: QuickSharePermission;
  expires_at: string;
  access_code_required: boolean;
  access_code?: string;
  one_time: boolean;
  max_claims?: number | null;
  require_sender_approval: boolean;
  watermark_enabled: boolean;
  file_ids: number[];
  // Whole bundles to share; each exposes its currently available files.
  bundle_ids?: number[];
}

export interface QuickSharePublic {
  mode: QuickShareMode;
  title: string;
  purpose: string;
  permission: QuickSharePermission;
  download_allowed: boolean;
  save_copy_allowed: boolean;
  watermark_enabled: boolean;
  watermark_text: string;
  require_sender_approval: boolean;
  access_code_required: boolean;
  short_id: string;
  expires_at: string;
  sender_name: string;
  sender_initials: string;
  file_count: number;
  files: QuickShareFile[];
  claim_status: ClaimStatus | null;
  claim_approval: ClaimApproval | null;
  claim_id: number | null;
  viewer_is_owner: boolean;
  requires_login: boolean;
}

export interface SharedWithMeItem {
  id: number;
  session_title: string;
  purpose: string;
  sender_name: string;
  sender_initials: string;
  permission: QuickSharePermission;
  download_allowed: boolean;
  save_copy_allowed: boolean;
  expires_at: string;
  token: string;
  file_count: number;
  status: ClaimStatus;
  approval: ClaimApproval;
  is_active: boolean;
  session_state:
    | "active"
    | "revoked"
    | "expired"
    | "declined"
    | "awaiting_approval"
    | "denied";
  accepted_at: string | null;
  last_accessed_at: string | null;
  files?: QuickShareFile[];
}
