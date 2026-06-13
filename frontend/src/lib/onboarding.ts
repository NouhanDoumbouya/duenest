import { API_BASE_URL, ApiError, apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  AccountDataSummary,
  AccountDeletionRequest,
  DemoDataResponse,
  DocumentExportRequest,
  DocumentSetupChecklist,
  OnboardingState,
  SecuritySummary,
  UpdateOnboardingStateRequest,
} from "@/types/onboarding";

export function getOnboardingState(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/state/", { auth: true });
}

export function updateOnboardingState(
  payload: UpdateOnboardingStateRequest,
): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/state/", {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function completeOnboarding(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/complete/", {
    method: "POST",
    auth: true,
  });
}

export function dismissOnboarding(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/dismiss/", {
    method: "POST",
    auth: true,
  });
}

export function getDocumentSetupChecklist(): Promise<DocumentSetupChecklist> {
  return apiFetch<DocumentSetupChecklist>(
    "/onboarding/document-setup-checklist/",
    { auth: true },
  );
}

export function markAttentionReviewed(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/attention-reviewed/", {
    method: "POST",
    auth: true,
  });
}

export function markTrustReviewed(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/trust-reviewed/", {
    method: "POST",
    auth: true,
  });
}

export function createDocumentDemoData(): Promise<DemoDataResponse> {
  return apiFetch<DemoDataResponse>("/demo/create-document-demo-data/", {
    method: "POST",
    auth: true,
  });
}

export function clearDocumentDemoData(): Promise<DemoDataResponse> {
  return apiFetch<DemoDataResponse>("/demo/clear-document-demo-data/", {
    method: "DELETE",
    auth: true,
  });
}

export function getSecuritySummary(): Promise<SecuritySummary> {
  return apiFetch<SecuritySummary>("/trust/security-summary/", { auth: true });
}

export function getAccountDataSummary(): Promise<AccountDataSummary> {
  return apiFetch<AccountDataSummary>("/account/data-summary/", { auth: true });
}

export function requestDataExport(): Promise<DocumentExportRequest> {
  return apiFetch<DocumentExportRequest>("/account/request-data-export/", {
    method: "POST",
    auth: true,
  });
}

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

async function getDocumentExportBlob(exportId: number): Promise<Blob> {
  const headers = new Headers();
  headers.set("Accept", "*/*");

  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/document-exports/${exportId}/download/`, {
      headers,
    });
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0, null);
  }

  if (!response.ok) {
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const data: unknown = isJson ? await response.json() : null;
    throw new ApiError(
      getApiErrorMessage(data, "Could not download this export."),
      response.status,
      data,
    );
  }

  return response.blob();
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadDocumentExport(
  exportRequest: DocumentExportRequest,
): Promise<void> {
  const blob = await getDocumentExportBlob(exportRequest.id);
  const ext = exportRequest.export_type === "documents_csv" ? "csv" : "json";
  saveBlob(blob, `duenest-export-${exportRequest.id}.${ext}`);
}

export function requestAccountDeletion(
  reason?: string,
): Promise<AccountDeletionRequest> {
  return apiFetch<AccountDeletionRequest>("/account/request-account-deletion/", {
    method: "POST",
    body: { reason: reason ?? "" },
    auth: true,
  });
}

export function cancelAccountDeletion(): Promise<AccountDeletionRequest> {
  return apiFetch<AccountDeletionRequest>("/account/cancel-account-deletion/", {
    method: "POST",
    auth: true,
  });
}
