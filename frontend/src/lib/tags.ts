// Document tag API helpers (/api/v1/document-tags/).

import { apiFetch } from "./api";
import type { DocumentTag, Paginated } from "@/types/documents";

export function getTags(): Promise<Paginated<DocumentTag>> {
  return apiFetch<Paginated<DocumentTag>>("/document-tags/", { auth: true });
}

export function createTag(payload: {
  name: string;
  color?: string;
}): Promise<DocumentTag> {
  return apiFetch<DocumentTag>("/document-tags/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateTag(
  id: number,
  payload: { name?: string; color?: string },
): Promise<DocumentTag> {
  return apiFetch<DocumentTag>(`/document-tags/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteTag(id: number): Promise<void> {
  return apiFetch<void>(`/document-tags/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

// A small, calm palette the UI maps tag colours to.
export const TAG_COLORS = [
  "slate",
  "teal",
  "blue",
  "violet",
  "amber",
  "rose",
  "green",
] as const;

export const TAG_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  teal: "bg-teal-100 text-teal-700",
  blue: "bg-blue-100 text-blue-700",
  violet: "bg-violet-100 text-violet-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  green: "bg-green-100 text-green-700",
};

export function tagColorClass(color: string): string {
  return TAG_COLOR_CLASSES[color] ?? TAG_COLOR_CLASSES.slate;
}
