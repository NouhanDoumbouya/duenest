"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { DocumentForm } from "@/components/documents/document-form";
import { DocumentChecklists } from "@/components/documents/document-checklists";
import { DocumentFileExtraction } from "@/components/documents/document-file-extraction";
import { DocumentFileShareDialog } from "@/components/documents/document-file-share-dialog";
import { DocumentFilesList } from "@/components/documents/document-files-list";
import { DocumentFileUploader } from "@/components/documents/document-file-uploader";
import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { DocumentReminderRules } from "@/components/documents/document-reminder-rules";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
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
import { getDocument, updateDocument } from "@/lib/documents";
import type { CreateDocumentRequest, DocumentRecord } from "@/types/documents";
import type { DocumentFile } from "@/types/document-files";

export default function EditDocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid document.",
  );

  // Attached files
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentFile | null>(null);
  const [previewingFile, setPreviewingFile] = useState<DocumentFile | null>(null);
  const [sharingFile, setSharingFile] = useState<DocumentFile | null>(null);
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

  async function handleUpdate(payload: CreateDocumentRequest) {
    await updateDocument(id, payload);
    router.push("/dashboard/documents");
    router.refresh();
  }

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to documents
        </Link>
      </div>

      {/* Record header */}
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Document
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {doc?.title ?? "Document"}
          </h1>
          {doc && <DocumentStatusBadge status={doc.computed_status} />}
        </div>
        {doc?.status_reason && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {doc.status_reason}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
          <CardDescription>
            Keep the document’s information and key dates up to date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {loadError}
            </p>
          ) : doc === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading document…</span>
            </div>
          ) : (
            <DocumentForm
              initial={doc}
              submitLabel="Save changes"
              onSubmit={handleUpdate}
            />
          )}
        </CardContent>
      </Card>

      {/* Attached files — available right here, no extra navigation */}
      {doc !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attached files</CardTitle>
            <CardDescription>
              Upload scans and copies to keep them linked to this document.
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
                onPreview={setPreviewingFile}
                onDownload={handleDownload}
                onShare={setSharingFile}
                onRequestDelete={setPendingDelete}
              />
            )}
          </CardContent>
        </Card>
      )}

      {doc !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Renewal checklists</CardTitle>
            <CardDescription>
              Prepare everything you need before this document’s renewal or
              application deadline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentChecklists documentId={id} />
          </CardContent>
        </Card>
      )}

      {doc !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extracted details</CardTitle>
            <CardDescription>
              Read details from an attached file and review them before applying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentFileExtraction
              documentId={id}
              files={files ?? []}
              onApplied={(updated) => setDoc(updated)}
            />
          </CardContent>
        </Card>
      )}

      {doc !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reminder rules</CardTitle>
            <CardDescription>
              Calculate renewal and expiry reminders for this document.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentReminderRules document={doc} />
          </CardContent>
        </Card>
      )}

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

      {previewingFile && (
        <DocumentFileViewer
          file={previewingFile}
          downloading={downloadingId === previewingFile.id}
          onClose={() => setPreviewingFile(null)}
          onDownload={handleDownload}
          onShare={(file) => {
            setPreviewingFile(null);
            setSharingFile(file);
          }}
        />
      )}

      {sharingFile && (
        <DocumentFileShareDialog
          file={sharingFile}
          onClose={() => setSharingFile(null)}
        />
      )}
    </div>
  );
}
