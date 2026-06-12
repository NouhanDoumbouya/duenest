"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";

import { DocumentFilesList } from "@/components/documents/document-files-list";
import { DocumentFileUploader } from "@/components/documents/document-file-uploader";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import {
  deleteDocumentFile,
  downloadDocumentFile,
  getDocumentFiles,
} from "@/lib/document-files";
import { formatDate, getDocument } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";
import type { DocumentFile } from "@/types/document-files";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid document.",
  );
  const [fileError, setFileError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DocumentFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!validId) return;
    let active = true;

    getDocument(id)
      .then((result) => active && setDoc(result))
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This document could not be found.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load document.",
          );
        }
      });

    getDocumentFiles(id)
      .then((page) => active && setFiles(page.results))
      .catch(() => active && setFiles([]));

    return () => {
      active = false;
    };
  }, [id, validId]);

  function handleUploaded(file: DocumentFile) {
    setFiles((prev) => [file, ...(prev ?? [])]);
  }

  async function handleDownload(file: DocumentFile) {
    setFileError(null);
    setDownloadingId(file.id);
    try {
      await downloadDocumentFile(file);
    } catch (err) {
      setFileError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setFileError(null);
    try {
      await deleteDocumentFile(id, pendingDelete.id);
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setFileError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the file. Please try again.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <BackLink />
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </p>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Loading document…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink />

      {/* Document header */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{doc.title}</CardTitle>
              <DocumentStatusBadge status={doc.status} />
            </div>
            {doc.category_name && (
              <CardDescription className="mt-1">
                {doc.category_name}
              </CardDescription>
            )}
          </div>
          <Link
            href={`/dashboard/documents/${doc.id}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Pencil className="size-3.5" />
            Edit
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetaItem label="Type" value={doc.document_type} />
            <MetaItem label="Issuer" value={doc.issuer} />
            <MetaItem label="Country" value={doc.country} />
            <MetaItem label="Reference" value={doc.reference_number ?? ""} />
            <MetaItem label="Issued" value={formatDate(doc.issue_date)} />
            <MetaItem label="Expires" value={formatDate(doc.expiry_date)} />
            <MetaItem label="Renewal" value={formatDate(doc.renewal_date)} />
          </div>
          {doc.notes && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="mt-0.5 text-sm whitespace-pre-line">{doc.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attached files */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attached files</CardTitle>
          <CardDescription>
            Keep scans and copies linked to this document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentFileUploader documentId={id} onUploaded={handleUploaded} />

          {fileError && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {fileError}
            </p>
          )}

          {files === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading files…</span>
            </div>
          ) : (
            <DocumentFilesList
              files={files}
              downloadingId={downloadingId}
              onDownload={handleDownload}
              onRequestDelete={setPendingDelete}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete file?"
        description={
          pendingDelete
            ? `“${pendingDelete.original_filename}” will be permanently removed. This cannot be undone.`
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

function BackLink() {
  return (
    <Link
      href="/dashboard/documents"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to documents
    </Link>
  );
}
