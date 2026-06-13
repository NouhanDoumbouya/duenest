"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError } from "@/lib/api";
import {
  formatDate,
  getTrashedDocuments,
  permanentlyDeleteDocument,
  restoreDocument,
} from "@/lib/documents";
import type { DocumentRecord } from "@/types/documents";

export default function TrashPage() {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setError(null);
    getTrashedDocuments()
      .then((page) => setDocs(page.results))
      .catch((err) => {
        setDocs([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load trash.",
        );
      });
  }

  useEffect(() => {
    let active = true;
    getTrashedDocuments()
      .then((page) => active && setDocs(page.results))
      .catch((err) => {
        if (!active) return;
        setDocs([]);
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
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading trash…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Documents you delete will appear here. Nothing has been deleted yet."
          />
        </div>
      ) : (
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(doc)}
                  disabled={restoringId === doc.id}
                >
                  <RotateCcw className="size-4" />
                  {restoringId === doc.id ? "Restoring…" : "Restore"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setPendingDelete(doc)}
                >
                  <Trash2 className="size-4" />
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
    </div>
  );
}
