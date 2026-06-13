import { apiFetch } from "./api";
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
