// Document Renewal Workspace API helpers: checklist templates, user
// checklists, bundles, the aggregated timeline, and the OCR-assisted
// extraction foundation. All calls go through the shared `apiFetch` so token
// and error handling stay in one place.

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  ApplyExtractionResponse,
  Bundle,
  BundleReadiness,
  BundleRequirement,
  Checklist,
  ChecklistItem,
  ChecklistTemplate,
  CreateBundleRequest,
  CreateChecklistFromTemplateRequest,
  CreateChecklistItemRequest,
  CreateChecklistRequest,
  CreateRequirementRequest,
  DocumentExtraction,
  ExtractableField,
  ExtractedFields,
  TimelineParams,
  TimelineResponse,
  UpdateBundleRequest,
  UpdateChecklistItemRequest,
  UpdateRequirementRequest,
} from "@/types/renewal-workspace";

function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// ---- Checklist templates ---------------------------------------------------

export function getChecklistTemplates(): Promise<Paginated<ChecklistTemplate>> {
  return apiFetch<Paginated<ChecklistTemplate>>(
    "/documents/checklist-templates/",
    { auth: true },
  );
}

// ---- Checklists ------------------------------------------------------------

export function getDocumentChecklists(
  documentId: number,
): Promise<Paginated<Checklist>> {
  return apiFetch<Paginated<Checklist>>(
    `/documents/${documentId}/checklists/`,
    { auth: true },
  );
}

export function createDocumentChecklist(
  documentId: number,
  payload: CreateChecklistRequest,
): Promise<Checklist> {
  return apiFetch<Checklist>(`/documents/${documentId}/checklists/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function createChecklistFromTemplate(
  documentId: number,
  payload: CreateChecklistFromTemplateRequest,
): Promise<Checklist> {
  return apiFetch<Checklist>(
    `/documents/${documentId}/checklists/from-template/`,
    { method: "POST", body: payload, auth: true },
  );
}

export function deleteDocumentChecklist(
  documentId: number,
  checklistId: number,
): Promise<void> {
  return apiFetch<void>(
    `/documents/${documentId}/checklists/${checklistId}/`,
    { method: "DELETE", auth: true },
  );
}

export function createChecklistItem(
  documentId: number,
  checklistId: number,
  payload: CreateChecklistItemRequest,
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(
    `/documents/${documentId}/checklists/${checklistId}/items/`,
    { method: "POST", body: payload, auth: true },
  );
}

export function updateChecklistItem(
  documentId: number,
  checklistId: number,
  itemId: number,
  payload: UpdateChecklistItemRequest,
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(
    `/documents/${documentId}/checklists/${checklistId}/items/${itemId}/`,
    { method: "PATCH", body: payload, auth: true },
  );
}

export function deleteChecklistItem(
  documentId: number,
  checklistId: number,
  itemId: number,
): Promise<void> {
  return apiFetch<void>(
    `/documents/${documentId}/checklists/${checklistId}/items/${itemId}/`,
    { method: "DELETE", auth: true },
  );
}

// ---- Bundles ---------------------------------------------------------------

export function getBundles(params?: {
  status?: string;
  bundle_type?: string;
}): Promise<Paginated<Bundle>> {
  return apiFetch<Paginated<Bundle>>(
    `/document-bundles/${toQueryString(params)}`,
    { auth: true },
  );
}

export function getBundle(bundleId: number): Promise<Bundle> {
  return apiFetch<Bundle>(`/document-bundles/${bundleId}/`, { auth: true });
}

export function createBundle(payload: CreateBundleRequest): Promise<Bundle> {
  return apiFetch<Bundle>("/document-bundles/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateBundle(
  bundleId: number,
  payload: UpdateBundleRequest,
): Promise<Bundle> {
  return apiFetch<Bundle>(`/document-bundles/${bundleId}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteBundle(bundleId: number): Promise<void> {
  return apiFetch<void>(`/document-bundles/${bundleId}/`, {
    method: "DELETE",
    auth: true,
  });
}

export function getBundleReadiness(
  bundleId: number,
): Promise<BundleReadiness> {
  return apiFetch<BundleReadiness>(
    `/document-bundles/${bundleId}/readiness/`,
    { auth: true },
  );
}

export function createBundleRequirement(
  bundleId: number,
  payload: CreateRequirementRequest,
): Promise<BundleRequirement> {
  return apiFetch<BundleRequirement>(
    `/document-bundles/${bundleId}/requirements/`,
    { method: "POST", body: payload, auth: true },
  );
}

export function updateBundleRequirement(
  bundleId: number,
  requirementId: number,
  payload: UpdateRequirementRequest,
): Promise<BundleRequirement> {
  return apiFetch<BundleRequirement>(
    `/document-bundles/${bundleId}/requirements/${requirementId}/`,
    { method: "PATCH", body: payload, auth: true },
  );
}

export function deleteBundleRequirement(
  bundleId: number,
  requirementId: number,
): Promise<void> {
  return apiFetch<void>(
    `/document-bundles/${bundleId}/requirements/${requirementId}/`,
    { method: "DELETE", auth: true },
  );
}

export function linkRequirementDocument(
  bundleId: number,
  requirementId: number,
  documentId: number,
): Promise<BundleRequirement> {
  return apiFetch<BundleRequirement>(
    `/document-bundles/${bundleId}/requirements/${requirementId}/link-document/`,
    { method: "POST", body: { document: documentId }, auth: true },
  );
}

export function linkRequirementFile(
  bundleId: number,
  requirementId: number,
  fileId: number,
): Promise<BundleRequirement> {
  return apiFetch<BundleRequirement>(
    `/document-bundles/${bundleId}/requirements/${requirementId}/link-file/`,
    { method: "POST", body: { file: fileId }, auth: true },
  );
}

// ---- Timeline --------------------------------------------------------------

export function getTimeline(
  params?: TimelineParams,
): Promise<TimelineResponse> {
  return apiFetch<TimelineResponse>(
    `/documents/timeline/${toQueryString(params as Record<string, unknown>)}`,
    { auth: true },
  );
}

// ---- Extraction ------------------------------------------------------------

export function getFileExtractions(
  documentId: number,
  fileId: number,
): Promise<Paginated<DocumentExtraction>> {
  return apiFetch<Paginated<DocumentExtraction>>(
    `/documents/${documentId}/files/${fileId}/extractions/`,
    { auth: true },
  );
}

export function createFileExtraction(
  documentId: number,
  fileId: number,
): Promise<DocumentExtraction> {
  return apiFetch<DocumentExtraction>(
    `/documents/${documentId}/files/${fileId}/extractions/`,
    { method: "POST", auth: true },
  );
}

export function updateExtractionFields(
  documentId: number,
  fileId: number,
  extractionId: number,
  fields: ExtractedFields,
): Promise<DocumentExtraction> {
  return apiFetch<DocumentExtraction>(
    `/documents/${documentId}/files/${fileId}/extractions/${extractionId}/`,
    { method: "PATCH", body: { extracted_fields: fields }, auth: true },
  );
}

export function applyExtraction(
  documentId: number,
  fileId: number,
  extractionId: number,
  fields: ExtractableField[],
): Promise<ApplyExtractionResponse> {
  return apiFetch<ApplyExtractionResponse>(
    `/documents/${documentId}/files/${fileId}/extractions/${extractionId}/apply/`,
    { method: "POST", body: { fields }, auth: true },
  );
}

// ---- Display helpers -------------------------------------------------------

export const BUNDLE_TYPE_LABELS: Record<string, string> = {
  renewal: "Renewal",
  application: "Application",
  travel: "Travel",
  emergency: "Emergency",
  scholarship: "Scholarship",
  insurance: "Insurance",
  custom: "Custom",
};

export const BUNDLE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  ready: "Ready",
  submitted: "Submitted",
  completed: "Completed",
  archived: "Archived",
};

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  missing: "Missing",
  attached: "Attached",
  completed: "Completed",
  skipped: "Skipped",
};

export const CHECKLIST_ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  document_expiry: "Document expiry",
  document_renewal: "Document renewal",
  reminder: "Reminder",
  checklist_item_due: "Checklist task",
  bundle_target_date: "Bundle target",
  bundle_requirement_due: "Bundle requirement",
};

export const EXTRACTABLE_FIELD_LABELS: Record<ExtractableField, string> = {
  title: "Title",
  document_type: "Document type",
  issuer: "Issuer",
  country: "Country",
  reference_number: "Reference number",
  issue_date: "Issue date",
  expiry_date: "Expiry date",
  renewal_date: "Renewal date",
};
