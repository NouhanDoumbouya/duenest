"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { DocumentCard } from "@/components/documents/document-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import { deleteDocument, getDocuments } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    getDocuments()
      .then((page) => {
        if (!active) return;
        setDocuments(page.results);
        setTotal(page.count);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load documents.",
        );
        setDocuments([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(pendingDelete.id);
      setDocuments((prev) =>
        (prev ?? []).filter((d) => d.id !== pendingDelete.id),
      );
      setTotal((n) => Math.max(0, n - 1));
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the document. Please try again.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const loading = documents === null;
  const docs = documents ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Documents
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Track your important documents, their statuses, and key dates.
          </p>
        </div>
        <Link
          href="/dashboard/documents/new"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          <Plus className="size-4" />
          Add document
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-[140px] animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Start your document vault
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                Track passports, visas, licenses, certificates, and important
                records around the dates that matter. Add your first document to
                begin.
              </p>
            </div>
            <Link
              href="/dashboard/documents/new"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              <Plus className="size-4" />
              Add your first document
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </div>
          {total > docs.length && (
            <p className="text-center text-sm text-muted-foreground">
              Showing {docs.length} of {total}. Pagination is coming soon.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
