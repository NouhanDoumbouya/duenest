// Types for the document files API
// (GET/POST/DELETE /api/v1/documents/:document_id/files/).
// Mirrors the backend DocumentFileSerializer.

export interface DocumentFile {
  id: number;
  document: number | null;
  document_title: string;
  assignment_status: "attached" | "inbox";
  uploaded_by: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  checksum: string;
  download_url: string | null;
  preview_url: string | null;
  is_previewable: boolean;
  is_trashed: boolean;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ShareLinkPermission = "view_only" | "download_allowed";
export type ShareLinkStatus = "active" | "expired" | "revoked" | "limit_reached";
export type ShareAccessLimitType =
  | "unlimited"
  | "one_time"
  | "limited_count";

export interface DocumentFileShareLink {
  id: number;
  token: string;
  permission: ShareLinkPermission;
  download_allowed: boolean;
  status: ShareLinkStatus;
  expires_at: string;
  revoked_at: string | null;
  access_code_required: boolean;
  access_limit_type: ShareAccessLimitType;
  max_views: number | null;
  view_count: number;
  max_downloads: number | null;
  download_count: number;
  limit_reached_at: string | null;
  watermark_enabled: boolean;
  privacy_screen_enabled: boolean;
  label: string;
  recipient_email: string;
  purpose: string;
  created_at: string;
  last_accessed_at: string | null;
}

export interface CreatedDocumentFileShareLink extends DocumentFileShareLink {
  access_code?: string;
}

export interface CreateShareLinkPayload {
  permission: ShareLinkPermission;
  expires_at: string;
  access_code_required: boolean;
  access_code?: string;
  access_limit_type?: ShareAccessLimitType;
  max_views?: number | null;
  max_downloads?: number | null;
  watermark_enabled?: boolean;
  privacy_screen_enabled?: boolean;
  label?: string;
  recipient_email?: string;
  purpose?: string;
}

export type DocumentFileActivityAction =
  | "file_uploaded"
  | "file_previewed"
  | "file_downloaded"
  | "share_created"
  | "share_opened"
  | "share_previewed"
  | "share_downloaded"
  | "share_revoked"
  | "share_access_code_verified"
  | "share_access_code_failed"
  | "share_limit_reached"
  | "share_blocked_limit_reached"
  | "file_deleted";

export interface DocumentFileActivity {
  id: number;
  action: DocumentFileActivityAction;
  actor_type: "owner" | "shared_viewer" | "system";
  share_link: number | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PublicSharedFileMetadata {
  file_name: string;
  content_type: string;
  file_size: number;
  permission: ShareLinkPermission;
  expires_at: string;
  is_previewable: boolean;
  download_allowed: boolean;
  access_code_required: boolean;
  watermark_enabled: boolean;
  privacy_screen_enabled: boolean;
  watermark_text: string;
  short_id: string;
}
