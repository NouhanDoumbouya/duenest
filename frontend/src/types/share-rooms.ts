// Types for Secure Rooms / Shared Packs.

export type RoomPermission = "view_only" | "download_allowed";
export type RoomStatus = "active" | "expired" | "revoked" | "limit_reached";
export type RoomAccessLimitType = "unlimited" | "one_time" | "limited_count";
export type RoomItemKind = "file" | "document" | "proof" | "unknown";

export interface ShareRoomItem {
  id: number;
  kind: RoomItemKind;
  title: string;
  document: number | null;
  file: number | null;
  proof: number | null;
  sort_order: number;
  created_at: string;
}

export interface ShareRoom {
  id: number;
  title: string;
  description: string;
  token: string;
  permission: RoomPermission;
  download_allowed: boolean;
  status: RoomStatus;
  expires_at: string | null;
  revoked_at: string | null;
  access_code_required: boolean;
  watermark_enabled: boolean;
  privacy_screen_enabled: boolean;
  access_limit_type: RoomAccessLimitType;
  max_views: number | null;
  view_count: number;
  max_downloads: number | null;
  download_count: number;
  limit_reached_at: string | null;
  recipient_email: string;
  label: string;
  purpose: string;
  items: ShareRoomItem[];
  item_count: number;
  file_count: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

export interface CreatedShareRoom extends ShareRoom {
  access_code?: string;
}

export interface CreateShareRoomPayload {
  title: string;
  description?: string;
  permission?: RoomPermission;
  expires_at?: string | null;
  access_code_required?: boolean;
  access_code?: string;
  watermark_enabled?: boolean;
  privacy_screen_enabled?: boolean;
  access_limit_type?: RoomAccessLimitType;
  max_views?: number | null;
  max_downloads?: number | null;
  recipient_email?: string;
  label?: string;
  purpose?: string;
}

export interface RoomActivity {
  id: number;
  action: string;
  actor_type: "owner" | "shared_viewer" | "system";
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- Public room view ------------------------------------------------------

export interface PublicRoomFile {
  file_id: number;
  name: string;
  content_type: string;
  file_size: number;
  is_previewable: boolean;
  source: string;
}

export interface PublicRoomMetadata {
  title: string;
  description: string;
  permission: RoomPermission;
  download_allowed: boolean;
  access_code_required: boolean;
  watermark_enabled: boolean;
  privacy_screen_enabled: boolean;
  watermark_text: string;
  short_id: string;
  expires_at: string | null;
  files: PublicRoomFile[];
}
