"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import {
  formatFileSize,
  getTrashedDocumentFiles,
  permanentlyDeleteDocumentFile,
  restoreDocumentFile,
} from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";

/**
 * Trashed files for one document, with restore and permanent delete. Notifies
 * the parent when a file is restored so the active list can refresh.
 */
export function DocumentTrashedFiles({
  documentId,
  onRestored,
}: {
  documentId: number;
  onRestored?: (file: DocumentFile) => void;
}) {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    getTrashedDocumentFiles(documentId)
      .then((page) => active && setFiles(page.results))
      .catch((err) => {
        if (!active) return;
        setFiles([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load trashed files.",
        );
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  async function handleRestore(file: DocumentFile) {
    setPendingId(file.id);
    setError(null);
    try {
      const restored = await restoreDocumentFile(documentId, file.id);
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== file.id));
      onRestored?.(restored);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not restore the file.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await permanentlyDeleteDocumentFile(documentId, pendingDelete.id);
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the file.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  // Nothing trashed → render nothing (keeps the detail page calm).
  if (files !== null && files.length === 0 && !error) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Trashed files
      </p>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {files === null ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {file.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.file_size)} · In trash
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(file)}
                disabled={pendingId === file.id}
              >
                <RotateCcw className="size-3.5" />
                Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setPendingDelete(file)}
                disabled={pendingId === file.id}
              >
                <Trash2 className="size-3.5" />
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Permanently delete file?"
        description={
          pendingDelete
            ? `“${pendingDelete.original_filename}” will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete forever"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
