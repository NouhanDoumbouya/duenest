"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { getTrashWarningCopy } from "@/lib/vault";
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

function purgeCopy(days: number): string {
  if (days <= 0) return "Will be permanently deleted soon";
  if (days === 1) return "Permanently deletes tomorrow";
  return `Permanently deletes in ${days} days`;
}

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
  const [query, setQuery] = useState("");

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

  const q = query.trim().toLowerCase();
  const filteredDocs = useMemo(
    () => (docs ?? []).filter((d) => !q || d.title.toLowerCase().includes(q)),
    [docs, q],
  );
  const filteredFiles = useMemo(
    () =>
      (files ?? []).filter(
        (f) => !q || f.original_filename.toLowerCase().includes(q),
      ),
    [files, q],
  );
  const hasAnyItems = (docs ?? []).length > 0 || (files ?? []).length > 0;
  const noSearchMatch =
    hasAnyItems && q.length > 0 && filteredDocs.length === 0 && filteredFiles.length === 0;

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
          {getTrashWarningCopy()}
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
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search trash"
              aria-label="Search trash"
              className="pl-9"
            />
          </div>

          {noSearchMatch && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No deleted item matches this search.
            </p>
          )}

          {filteredDocs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">
                Documents ({filteredDocs.length})
              </h2>
              <ul className="space-y-3">
                {filteredDocs.map((doc) => (
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
                      {doc.days_until_permanent_deletion !== null && (
                        <p className="mt-0.5 text-xs font-medium text-brand-amber">
                          {purgeCopy(doc.days_until_permanent_deletion)}
                        </p>
                      )}
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

          {filteredFiles.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">
                File Inbox ({filteredFiles.length})
              </h2>
              <ul className="space-y-3">
                {filteredFiles.map((file) => (
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
                      {file.days_until_permanent_deletion !== null && (
                        <p className="mt-0.5 text-xs font-medium text-brand-amber">
                          {purgeCopy(file.days_until_permanent_deletion)}
                        </p>
                      )}
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
