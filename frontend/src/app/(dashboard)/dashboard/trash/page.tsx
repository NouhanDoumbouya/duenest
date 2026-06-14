"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  formatDate,
  getTrashedDocuments,
  permanentlyDeleteDocument,
  restoreDocument,
} from "@/lib/documents";
import {
  formatFileSize,
  getTrashedInboxFiles,
  permanentlyDeleteInboxFile,
  restoreInboxFile,
} from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";

export default function TrashPage() {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [pendingFileDelete, setPendingFileDelete] = useState<DocumentFile | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  function load() {
    setError(null);
    Promise.all([getTrashedDocuments(), getTrashedInboxFiles()])
      .then(([documentPage, filePage]) => {
        setDocs(documentPage.results);
        setFiles(filePage.results);
      })
      .catch((err) => {
        setDocs([]);
        setFiles([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load trash.",
        );
      });
  }

  useEffect(() => {
    let active = true;
    Promise.all([getTrashedDocuments(), getTrashedInboxFiles()])
      .then(([documentPage, filePage]) => {
        if (!active) return;
        setDocs(documentPage.results);
        setFiles(filePage.results);
      })
      .catch((err) => {
        if (!active) return;
        setDocs([]);
        setFiles([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load trash.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRestore(doc: DocumentRecord) {
    setActionError(null);
    setRestoringId(doc.id);
    try {
      await restoreDocument(doc.id);
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== doc.id));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not restore the document.",
      );
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreFile(file: DocumentFile) {
    setActionError(null);
    setRestoringId(file.id);
    try {
      await restoreInboxFile(file.id);
      setFiles((prev) => (prev ?? []).filter((item) => item.id !== file.id));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not restore the file.",
      );
    } finally {
      setRestoringId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await permanentlyDeleteDocument(pendingDelete.id);
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the document. Please try again.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmFileDelete() {
    if (!pendingFileDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await permanentlyDeleteInboxFile(pendingFileDelete.id);
      setFiles((prev) =>
        (prev ?? []).filter((file) => file.id !== pendingFileDelete.id),
      );
      setPendingFileDelete(null);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the file. Please try again.",
      );
      setPendingFileDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Documents
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Trash
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Deleted documents are kept here so you can recover them. Restore one to
          put it back in your vault, or permanently delete it to remove it for
          good.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}{" "}
          <button
            type="button"
            onClick={load}
            className="font-medium underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      )}

      {actionError && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {docs === null ? (
        <ul className="space-y-3" aria-busy="true" aria-label="Loading trash">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-20" />
            </li>
          ))}
        </ul>
      ) : docs.length === 0 && (files ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Documents you delete will appear here. Nothing has been deleted yet."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {docs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Documents</h2>
              <ul className="space-y-3">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doc.document_type || "Document"}
                        {doc.trashed_at && ` · Deleted ${formatDate(doc.trashed_at)}`}
                      </p>
                    </div>
                    <TrashActions
                      restoring={restoringId === doc.id}
                      onRestore={() => handleRestore(doc)}
                      onDelete={() => setPendingDelete(doc)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(files ?? []).length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">File Inbox</h2>
              <ul className="space-y-3">
                {(files ?? []).map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {file.original_filename}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                        {file.trashed_at && ` · Deleted ${formatDate(file.trashed_at)}`}
                      </p>
                    </div>
                    <TrashActions
                      restoring={restoringId === file.id}
                      onRestore={() => handleRestoreFile(file)}
                      onDelete={() => setPendingFileDelete(file)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Permanently delete document?"
        description={
          pendingDelete
            ? `“${pendingDelete.title}” and its files will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete forever"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={pendingFileDelete !== null}
        title="Permanently delete file?"
        description={
          pendingFileDelete
            ? `“${pendingFileDelete.original_filename}” will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete forever"
        loading={deleting}
        onConfirm={handleConfirmFileDelete}
        onCancel={() => setPendingFileDelete(null)}
      />
    </div>
  );
}

function TrashActions({
  restoring,
  onRestore,
  onDelete,
}: {
  restoring: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onRestore} disabled={restoring}>
        <RotateCcw className="size-4" />
        {restoring ? "Restoring…" : "Restore"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Delete forever
      </Button>
    </div>
  );
}
