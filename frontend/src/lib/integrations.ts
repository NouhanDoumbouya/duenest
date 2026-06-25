// API client for integrations (/api/v1/integrations/*).
//
// The backend is the enforcement boundary: it gates on the `integrations`
// feature flag (503 when off) and never returns tokens. These wrappers stay thin.

import { apiFetch } from "./api";
import type {
  ConnectedAccount,
  OAuthStartResponse,
  ProvidersResponse,
} from "@/types/integrations";

export function getIntegrationProviders(): Promise<ProvidersResponse> {
  return apiFetch<ProvidersResponse>("/integrations/providers/");
}

export function getIntegrationAccounts(): Promise<{ accounts: ConnectedAccount[] }> {
  return apiFetch<{ accounts: ConnectedAccount[] }>("/integrations/accounts/");
}

export function startGoogleIntegration(
  scopeGroups: string[],
  redirectPath = "/dashboard/settings/integrations",
): Promise<OAuthStartResponse> {
  return apiFetch<OAuthStartResponse>("/integrations/google/start/", {
    method: "POST",
    body: { scope_groups: scopeGroups, redirect_path: redirectPath },
  });
}

export function disconnectIntegration(id: number): Promise<ConnectedAccount> {
  return apiFetch<ConnectedAccount>(`/integrations/accounts/${id}/disconnect/`, {
    method: "POST",
  });
}

export function refreshIntegration(
  id: number,
): Promise<{ result: { status: string }; account: ConnectedAccount }> {
  return apiFetch(`/integrations/accounts/${id}/refresh/`, { method: "POST" });
}

export function checkIntegrationHealth(id: number): Promise<ConnectedAccount> {
  return apiFetch<ConnectedAccount>(`/integrations/accounts/${id}/health/`);
}

// ---- Pure presentation helpers (unit-tested) ------------------------------

export function providerStatusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "not_connected":
      return "Not connected";
    case "not_configured":
      return "Not configured";
    case "unavailable":
      return "Coming soon";
    default:
      return "Unknown";
  }
}

export function accountStatusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "error":
      return "Needs attention";
    case "disconnected":
      return "Disconnected";
    default:
      return "Unknown";
  }
}
