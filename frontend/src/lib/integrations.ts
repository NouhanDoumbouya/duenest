// API client for integrations (/api/v1/integrations/*).
//
// The backend is the enforcement boundary: it gates on the `integrations`
// feature flag (503 when off) and never returns tokens. These wrappers stay thin.

import { apiFetch } from "./api";
import type {
  ConnectedAccount,
  DriveDestination,
  DriveDestinations,
  DriveFileRef,
  DriveImportResult,
  DriveListResponse,
  DrivePreviewResult,
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

// ---- Google Drive Import V1 ----

export function getDriveFiles(
  accountId: number,
  opts: { q?: string; fileType?: string; pageToken?: string } = {},
): Promise<DriveListResponse> {
  const params = new URLSearchParams({ account_id: String(accountId) });
  if (opts.q) params.set("q", opts.q);
  if (opts.fileType) params.set("file_type", opts.fileType);
  if (opts.pageToken) params.set("page_token", opts.pageToken);
  return apiFetch<DriveListResponse>(
    `/integrations/google-drive/files/?${params.toString()}`,
  );
}

export function getDriveDestinations(): Promise<DriveDestinations> {
  return apiFetch<DriveDestinations>("/integrations/google-drive/destinations/");
}

export function previewDriveImport(
  accountId: number,
  files: DriveFileRef[],
  destination: DriveDestination,
): Promise<DrivePreviewResult> {
  return apiFetch<DrivePreviewResult>("/integrations/google-drive/import/preview/", {
    method: "POST",
    body: { account_id: accountId, files, destination },
  });
}

export function importDriveFiles(
  accountId: number,
  files: DriveFileRef[],
  destination: DriveDestination,
): Promise<DriveImportResult> {
  return apiFetch<DriveImportResult>("/integrations/google-drive/import/", {
    method: "POST",
    body: { account_id: accountId, files, destination },
  });
}

/** Friendly, user-facing reason for a skipped/failed Drive import row. */
export function driveImportReasonLabel(reason: string): string {
  switch (reason) {
    case "unsupported_type":
      return "Unsupported file type";
    case "too_large":
      return "File is too large";
    case "not_downloadable":
      return "Couldn't download from Drive";
    case "export_not_supported":
      return "This Google file can't be exported";
    case "storage_error":
      return "Not enough storage";
    case "limit_reached":
      return "Plan limit reached";
    case "scan_unavailable":
      return "Security scan unavailable — try again";
    case "invalid_file":
      return "File failed validation";
    case "provider_error":
      return "Google Drive error";
    case "":
      return "";
    default:
      return "Couldn't import";
  }
}
