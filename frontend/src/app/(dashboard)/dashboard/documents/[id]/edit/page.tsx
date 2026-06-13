"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { DocumentForm } from "@/components/documents/document-form";
import { DocumentAppointments } from "@/components/documents/document-appointments";
import { DocumentChecklists } from "@/components/documents/document-checklists";
import { DocumentFileExtraction } from "@/components/documents/document-file-extraction";
import { DocumentFileShareDialog } from "@/components/documents/document-file-share-dialog";
import { DocumentFilesList } from "@/components/documents/document-files-list";
import { DocumentFileUploader } from "@/components/documents/document-file-uploader";
import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { DocumentPayments } from "@/components/documents/document-payments";
import { DocumentProofRecords } from "@/components/documents/document-proof-records";
import { DocumentReminderRules } from "@/components/documents/document-reminder-rules";
import { DocumentRenewalHistory } from "@/components/documents/document-renewal-history";
import { DocumentTrashedFiles } from "@/components/documents/document-trashed-files";
import { ConfidenceBreakdown } from "@/components/documents/confidence-indicator";
import { DocumentSummaryGrid } from "@/components/documents/document-summary-grid";
import { LifecycleBadge } from "@/components/documents/lifecycle-badge";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { SectionCard } from "@/components/ui/section-card";
import { PageContainer } from "@/components/ui/page-container";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import {
  deleteDocumentFile,
  downloadDocumentFile,
  getDocumentFiles,
} from "@/lib/document-files";
import { formatDate, getDocument, updateDocument } from "@/lib/documents";
import { tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { CreateDocumentRequest, DocumentRecord } from "@/types/documents";
import type { DocumentFile } from "@/types/document-files";

const LSA_STYLES: Record<string, string> = {
  passed: "bg-destructive/10 text-destructive",
  approaching: "bg-amber-100 text-amber-800",
  ok: "bg-brand-success/10 text-brand-success",
  unknown: "bg-muted text-muted-foreground",
};

function lastSafeActionMessage(doc: DocumentRecord): string {
  const days = doc.days_until_last_safe_action;
  switch (doc.last_safe_action_status) {
    case "passed":
      return days === null
        ? "The last safe action date has passed."
        : `Last safe action date passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`;
    case "approaching":
      return `Act within ${days} day${days === 1 ? "" : "s"} — the last safe action date is ${formatDate(doc.last_safe_action_date)}.`;
    case "ok":
      return `On track — act by ${formatDate(doc.last_safe_action_date)}.`;
    default:
      return "Add a renewal or expiry date to estimate a last safe action date.";
  }
}

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
    <PageContainer width="narrow">
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
          {doc && <LifecycleBadge status={doc.lifecycle_status} />}
        </div>
        {doc?.status_reason && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {doc.status_reason}
          </p>
        )}
        {doc && doc.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {doc.tags.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  tagColorClass(tag.color),
                )}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* At-a-glance summary */}
      {doc !== null && <DocumentSummaryGrid doc={doc} />}

      {/* Confidence + last safe action */}
      {doc !== null && (
        <SectionCard
          title="Document confidence"
          description="How complete and current this document is."
        >
          <ConfidenceBreakdown
            score={doc.confidence_score}
            label={doc.confidence_label}
            reasons={doc.confidence_reasons}
          />
          <div
            className={cn(
              "mt-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
              LSA_STYLES[doc.last_safe_action_status] ?? LSA_STYLES.unknown,
            )}
          >
            <span className="font-medium">Last safe action:</span>
            <span>{lastSafeActionMessage(doc)}</span>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Details"
        description="Keep the document’s information and key dates up to date."
      >
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
      </SectionCard>

      {/* Attached files — available right here, no extra navigation */}
      {doc !== null && (
        <SectionCard
          title="Attached files"
          description="Upload scans and copies to keep them linked to this document."
        >
          <div className="space-y-4">
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

            <DocumentTrashedFiles
              documentId={id}
              onRestored={(file) => setFiles((prev) => [file, ...(prev ?? [])])}
            />
          </div>
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Proof of submission"
          description="Record confirmations, receipts, and tracking numbers tied to this document."
        >
          <DocumentProofRecords documentId={id} />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Renewal history"
          description="A timeline of past renewals for this document."
        >
          <DocumentRenewalHistory documentId={id} />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Appointments"
          description="Appointments connected to this document."
        >
          <DocumentAppointments documentId={id} />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Renewal &amp; application costs"
          description="Track what renewing or applying for this document costs."
        >
          <DocumentPayments documentId={id} />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Renewal checklists"
          description="Prepare everything you need before this document’s renewal or application deadline."
        >
          <DocumentChecklists documentId={id} />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Extracted details"
          description="Read details from an attached file and review them before applying."
        >
          <DocumentFileExtraction
            documentId={id}
            files={files ?? []}
            onApplied={(updated) => setDoc(updated)}
          />
        </SectionCard>
      )}

      {doc !== null && (
        <SectionCard
          title="Reminder rules"
          description="Calculate renewal and expiry reminders for this document."
        >
          <DocumentReminderRules document={doc} />
        </SectionCard>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Move file to trash?"
        description={
          pendingDelete
            ? `“${pendingDelete.original_filename}” will be moved to trash and any share links will stop working. You can restore it from this document’s trashed files.`
            : ""
        }
        confirmLabel="Move to trash"
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
    </PageContainer>
  );
}
