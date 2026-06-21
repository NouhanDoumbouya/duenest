// API client for the drafts library (saved AI-drafted documents). Owner-scoped.

import { apiFetch } from "./api";
import type {
  GeneratedDocStatus,
  GeneratedDocument,
  SaveGeneratedDocumentInput,
} from "@/types/generated-documents";

/** Save a reviewed draft into the drafts library. */
export function saveGeneratedDocument(
  input: SaveGeneratedDocumentInput,
): Promise<GeneratedDocument> {
  return apiFetch<GeneratedDocument>("/generated-documents/", {
    method: "POST",
    body: input,
    auth: true,
  });
}

/** List saved drafts, optionally by status or pack. */
export function listGeneratedDocuments(params?: {
  status?: GeneratedDocStatus;
  relatedPack?: number;
}): Promise<GeneratedDocument[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.relatedPack) query.set("related_pack", String(params.relatedPack));
  const qs = query.toString();
  return apiFetch<GeneratedDocument[]>(
    `/generated-documents/${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}

export function updateGeneratedDocument(
  id: number,
  patch: Partial<SaveGeneratedDocumentInput>,
): Promise<GeneratedDocument> {
  return apiFetch<GeneratedDocument>(`/generated-documents/${id}/`, {
    method: "PATCH",
    body: patch,
    auth: true,
  });
}

export function deleteGeneratedDocument(id: number): Promise<void> {
  return apiFetch<void>(`/generated-documents/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}
