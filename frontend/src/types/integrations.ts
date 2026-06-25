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
