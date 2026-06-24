// Client for the AI Application Document Generator V1
// (apps.ai / application-documents). Owner-scoped, key-gated, and
// review-before-save. The generate endpoint always returns 200 with
// `{ available, reason, ... }` when the rollout flag is on; the flag being off
// surfaces as a 503 (ApiError). Nothing is exported or saved automatically.

import { apiFetch } from "./api";
import { getInboxFileDownloadBlob, saveBlob } from "./document-files";
import type {
  ExportFormat,
  ExportRequest,
  ExportResult,
  GenerateRequest,
  GenerateResult,
  GeneratedApplicationDocument,
  SaveToPackResult,
  TemplateRegistry,
  UpdateGeneratedDocumentRequest,
} from "@/types/application-documents";

/** Fetch the document types, content styles, and templates registry. */
export function getDocumentTemplates(): Promise<TemplateRegistry> {
  return apiFetch<TemplateRegistry>("/application-documents/templates/");
}

/** Generate a professional document from the user's Smart Profile + context. */
export function generateApplicationDocument(
  req: GenerateRequest,
): Promise<GenerateResult> {
  return apiFetch<GenerateResult>("/application-documents/generate/", {
    method: "POST",
    body: req,
  });
}

/** Read a single generated document (for review/refresh). */
export function getGeneratedDocument(
  id: number,
): Promise<GeneratedApplicationDocument> {
  return apiFetch<GeneratedApplicationDocument>(
    `/application-documents/${id}/`,
  );
}

/** Save edits to a reviewed document (title, content, template, status). */
export function updateGeneratedDocument(
  id: number,
  patch: UpdateGeneratedDocumentRequest,
): Promise<GeneratedApplicationDocument> {
  return apiFetch<GeneratedApplicationDocument>(
    `/application-documents/${id}/`,
    { method: "PATCH", body: patch },
  );
}

/** Export the document to a PDF/DOCX file, optionally saving it to the pack. */
export function exportGeneratedDocument(
  id: number,
  { format, template_key, save_to_pack }: ExportRequest,
): Promise<ExportResult> {
  return apiFetch<ExportResult>(`/application-documents/${id}/export/`, {
    method: "POST",
    body: { format, template_key, save_to_pack },
  });
}

/** Save the generated document into its linked application pack. */
export function saveGeneratedDocumentToPack(
  id: number,
): Promise<SaveToPackResult> {
  return apiFetch<SaveToPackResult>(
    `/application-documents/${id}/save-to-pack/`,
    { method: "POST" },
  );
}

/**
 * Download an exported file through the authenticated inbox endpoint and
 * trigger a browser save. The export returns a private `file_id` (an inbox
 * file) — never construct a raw storage URL.
 */
export async function downloadGeneratedFile(
  fileId: number,
  filename: string,
): Promise<void> {
  const blob = await getInboxFileDownloadBlob(fileId);
  saveBlob(blob, filename);
}

// ---- Label maps + helpers --------------------------------------------------

/** Friendly label for an export format. */
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  docx: "DOCX",
};

/** Friendly, actionable copy for a blocked/failed generate reason. */
export function generateReasonMessage(result: GenerateResult): string {
  if (result.message) return result.message;
  switch (result.reason) {
    case "consent_required":
      return "Turn on AI in Settings to generate documents.";
    case "ai_feature_not_in_plan":
      return "Document generation is a Pro feature.";
    case "ai_credits_exhausted":
      return "You've used all your AI credits for this period.";
    case "budget":
      return "AI is paused for now to protect usage limits. Please try again later.";
    case "not_configured":
      return "AI isn't configured yet.";
    case "not_found":
      return "We couldn't find the application context for this request.";
    default:
      return "We couldn't generate this document. Please try again.";
  }
}

/** Whether a blocked reason should route the user to the upgrade flow. */
export function isUpgradeReason(result: GenerateResult): boolean {
  return result.reason === "ai_feature_not_in_plan";
}

/** Whether a blocked reason is a usage/budget warning (amber) vs an error. */
export function isUsageReason(result: GenerateResult): boolean {
  return result.reason === "ai_credits_exhausted" || result.reason === "budget";
}

/** Credit-cost notice for a document type, e.g. "Uses 3 AI credits…". */
export function creditNotice(
  documentType: string,
  registry: TemplateRegistry,
): string {
  const meta = registry.document_types.find((d) => d.key === documentType);
  const cost = meta?.credit_cost ?? 0;
  const unit = cost === 1 ? "credit" : "credits";
  return `Uses ${cost} AI ${unit} after successful generation.`;
}
