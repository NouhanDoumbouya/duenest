// Types for the integrations API (/api/v1/integrations/*).
//
// Import-only foundation: connect/disconnect external accounts. No tokens are
// ever returned by the backend, so none appear here.

export type AccountStatus =
  | "connected"
  | "expired"
  | "revoked"
  | "error"
  | "disconnected";

export type ProviderStatus =
  | "connected"
  | "not_connected"
  | "not_configured"
  | "unavailable";

export interface IntegrationScopeGroup {
  key: string;
  label: string;
  description: string;
  privacy_sensitive: boolean;
  status: string;
}

export interface ConnectedAccount {
  id: number;
  provider: string;
  provider_account_id: string;
  provider_email: string;
  display_name: string;
  scopes: string[];
  scope_groups: string[];
  status: AccountStatus;
  token_expires_at: string | null;
  last_refresh_at: string | null;
  last_checked_at: string | null;
  last_error_code: string;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
  disconnected_at: string | null;
  is_token_expired: boolean;
  needs_attention: boolean;
}

export interface IntegrationProvider {
  key: string;
  name: string;
  description: string;
  available: boolean;
  configured: boolean;
  status: ProviderStatus;
  scope_groups: IntegrationScopeGroup[];
  accounts: ConnectedAccount[];
}

export interface ProvidersResponse {
  providers: IntegrationProvider[];
}

export interface OAuthStartResponse {
  authorization_url: string;
  provider: string;
  scope_groups: string[];
}

// ---- Google Drive Import V1 ----

export interface DriveFile {
  provider_file_id: string;
  name: string;
  mime_type: string;
  size: number | null;
  modified_time: string;
  type_label: string;
  is_folder: boolean;
  is_google_workspace_file: boolean;
  exportable: boolean;
  export_mime_type: string;
}

export interface DriveListResponse {
  files: DriveFile[];
  next_page_token: string;
}

export interface DriveDestinations {
  fixed: { type: string; label: string }[];
  folders: { id: number; name: string }[];
  packs: { id: number; title: string }[];
  org_supported: boolean;
}

export type DriveDestination =
  | { type: "file_inbox" | "vault" }
  | { type: "folder"; folder_id: number }
  | { type: "pack"; pack_id: number };

export interface DriveFileRef {
  provider_file_id: string;
  name: string;
  mime_type: string;
  size?: number | null;
}

export interface DrivePreviewResult {
  destination: { type: string };
  importable_count: number;
  skipped_count: number;
  results: { provider_file_id: string; name: string; status: string; reason: string }[];
  warnings: string[];
}

export interface DriveImportResultRow {
  name: string;
  status: string;
  reason: string;
  document_id: number | null;
  file_id: number | null;
}

export interface DriveImportResult {
  status: string;
  imported_count: number;
  failed_count: number;
  destination: { type: string };
  results: DriveImportResultRow[];
  warnings: string[];
}
