// Document Renewal Workspace API helpers: checklist templates, user
// checklists, bundles, the aggregated timeline, and the OCR-assisted
// extraction foundation. All calls go through the shared `apiFetch` so token
// and error handling stay in one place.

import { API_BASE_URL, ApiError, apiFetch, readCookie } from "./api";
import { getAccessToken } from "./auth";

const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "duenest_csrftoken";
import type {
  DocumentActivityResponse,
  Paginated,
} from "@/types/documents";
import type {
  ApplyExtractionResponse,
  Bundle,
  PackTemplate,
  BundleExportRequest,
  BundleExportType,
  BundleFilesResponse,
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

export function getBundleFiles(bundleId: number): Promise<BundleFilesResponse> {
  return apiFetch<BundleFilesResponse>(
    `/document-bundles/${bundleId}/files/`,
    { auth: true },
  );
}

export function createBundle(payload: CreateBundleRequest): Promise<Bundle> {
  return apiFetch<Bundle>("/document-bundles/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

/**
 * Generic, non-official pack templates used to seed a starter checklist.
 * Gated server-side by `application_pack_templates` (503 when unavailable).
 */
export function getPackTemplates(): Promise<{ templates: PackTemplate[] }> {
  return apiFetch<{ templates: PackTemplate[] }>(
    "/document-bundles/pack-templates/",
    { auth: true },
  );
}

/**
 * Owner-only activity feed for one bundle. Gated server-side by
 * `application_pack_timeline` (503 when unavailable). Never includes file
 * contents.
 */
export function getBundleActivity(
  bundleId: number,
): Promise<DocumentActivityResponse> {
  return apiFetch<DocumentActivityResponse>(
    `/document-bundles/${bundleId}/activity/`,
    { auth: true },
  );
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

// ---- Bundle exports --------------------------------------------------------

export function getBundleExports(
  bundleId: number,
): Promise<Paginated<BundleExportRequest>> {
  return apiFetch<Paginated<BundleExportRequest>>(
    `/document-bundles/${bundleId}/exports/`,
    { auth: true },
  );
}

export function createBundleExport(
  bundleId: number,
  exportType: BundleExportType,
): Promise<BundleExportRequest> {
  return apiFetch<BundleExportRequest>(
    `/document-bundles/${bundleId}/exports/`,
    {
      method: "POST",
      body: { export_type: exportType },
      auth: true,
    },
  );
}

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

async function getBundleExportBlob(
  bundleId: number,
  exportId: number,
): Promise<Blob> {
  const headers = new Headers();
  headers.set("Accept", "*/*");

  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/document-bundles/${bundleId}/exports/${exportId}/download/`,
      { headers, credentials: "include" },
    );
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

export async function downloadBundleExport(
  bundleId: number,
  exportRequest: BundleExportRequest,
): Promise<void> {
  const blob = await getBundleExportBlob(bundleId, exportRequest.id);
  const ext =
    exportRequest.export_type === "bundle_requirements_csv" ? "csv" : "json";
  saveBlob(blob, `duenest-bundle-${bundleId}-export.${ext}`);
}

function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

/**
 * POST a JSON body to an endpoint that streams back a ZIP, then trigger a
 * browser "save". Returns nothing; throws ApiError on failure (the backend
 * returns a JSON error body in that case).
 */
async function postZipAndSave(
  path: string,
  body: Record<string, unknown> | undefined,
  fallbackName: string,
): Promise<void> {
  const headers = new Headers();
  headers.set("Accept", "*/*");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body) headers.set("Content-Type", "application/json");
  // Unsafe (POST) cookie-authenticated request: send the CSRF token.
  const csrf = readCookie(CSRF_COOKIE_NAME);
  if (csrf) headers.set("X-CSRFToken", csrf);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
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
      getApiErrorMessage(data, "We could not prepare this ZIP. Please try again."),
      response.status,
      data,
    );
  }

  const name = filenameFromDisposition(
    response.headers.get("content-disposition"),
    fallbackName,
  );
  saveBlob(await response.blob(), name);
}

export function exportBundleFilesZip(
  bundleId: number,
  name?: string,
): Promise<void> {
  return postZipAndSave(
    `/document-bundles/${bundleId}/export-files/`,
    name ? { name } : undefined,
    `duenest-bundle-${bundleId}.zip`,
  );
}

export function exportSelectedBundleFilesZip(
  bundleId: number,
  fileIds: number[],
  name?: string,
): Promise<void> {
  return postZipAndSave(
    `/document-bundles/${bundleId}/export-selected-files/`,
    name ? { file_ids: fileIds, name } : { file_ids: fileIds },
    `duenest-bundle-${bundleId}-selected.zip`,
  );
}

/**
 * Merge the pack's PDF files into a single PDF (server-side, in requirement
 * order). Non-PDF files are reported as skipped by the server. Gated by
 * application_pack_preparation (503 when unavailable). `postZipAndSave` saves
 * whatever blob the server streams, using the Content-Disposition filename.
 */
export function exportBundleMergedPdf(
  bundleId: number,
  name?: string,
  cover?: boolean,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (name) body.name = name;
  if (cover) body.cover = true;
  return postZipAndSave(
    `/document-bundles/${bundleId}/export-merged-pdf/`,
    Object.keys(body).length > 0 ? body : undefined,
    `duenest-bundle-${bundleId}.pdf`,
  );
}

export function exportSelectedDocumentFilesZip(
  fileIds: number[],
): Promise<void> {
  return postZipAndSave(
    `/documents/files/export-selected/`,
    { file_ids: fileIds },
    `duenest-files.zip`,
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
  subscription_renewal: "Subscription renewal",
  subscription_cancellation_deadline: "Cancellation deadline",
  subscription_trial_ending: "Trial ending",
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
