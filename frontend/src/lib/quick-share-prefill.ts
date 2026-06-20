/**
 * In-memory, one-time handoff of pre-selected items from any "Share" entry point
 * (a document file, the File Inbox, a Share Room selection) into the single Quick
 * Share creation wizard.
 *
 * Quick Share is the one sharing engine, so sharing from anywhere routes the user
 * to `/dashboard/quick-share/new` with their items already chosen. Like the access
 * code handoff, this lives only in a module-level variable so it survives the
 * client-side navigation (same JS runtime) and is consumed exactly once — after a
 * full reload it is gone and the wizard simply starts empty.
 */

import type { SelectedFile } from "@/components/quick-share/file-picker";

export type SharePrefill = {
  /** Individual files to pre-select. */
  files?: SelectedFile[];
};

let pending: SharePrefill | null = null;

export function setSharePrefill(value: SharePrefill): void {
  pending = value;
}

/** Return and clear the pending prefill (one-time). */
export function takeSharePrefill(): SharePrefill | null {
  const value = pending;
  pending = null;
  return value;
}

/** Build a wizard SelectedFile from a DocumentFile-shaped record. */
export function fileToSelected(file: {
  id: number;
  original_filename: string;
  file_size: number;
  document_title?: string | null;
}): SelectedFile {
  return {
    id: file.id,
    name: file.original_filename,
    size: file.file_size,
    documentTitle: file.document_title || "File Inbox",
  };
}
