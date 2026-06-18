"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useFeature } from "@/components/features/feature-flags-provider";
import { DocumentFilesList } from "@/components/documents/document-files-list";
import { PageEditorDialog } from "@/components/documents/page-editor-dialog";
import { DocumentFileShareDialog } from "@/components/documents/document-file-share-dialog";
import { DocumentFileUploader } from "@/components/documents/document-file-uploader";
import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { DocumentTrashedFiles } from "@/components/documents/document-trashed-files";
import { SectionCard } from "@/components/ui/section-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import {
  createDocumentFileVersion,
  deleteDocumentFile,
  downloadDocumentFile,
  getDocumentFiles,
} from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";

export function FilesTab({
  documentId,
  onChanged,
}: {
  documentId: number;
  /** Called after a file is added or removed so the workspace can refresh health. */
  onChanged?: () => void;
}) {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentFile | null>(null);
  const [previewingFile, setPreviewingFile] = useState<DocumentFile | null>(null);
  const [sharingFile, setSharingFile] = useState<DocumentFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [editingPagesFile, setEditingPagesFile] = useState<DocumentFile | null>(
    null,
  );
  const versioningEnabled = useFeature("document_versioning");
  const pageEditEnabled = useFeature("document_page_edit");
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<number | null>(null);

  function handleReplace(file: DocumentFile) {
    replaceTargetId.current = file.id;
    replaceInputRef.current?.click();
  }

  async function onReplaceFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const targetId = replaceTargetId.current;
    replaceTargetId.current = null;
    if (!file || targetId === null) return;
    setFileError(null);
    setReplacingId(targetId);
    try {
      const created = await createDocumentFileVersion(
        documentId,
        targetId,
        file,
      );
      // The old file is retained as history; the new file is added.
      setFiles((prev) => [created, ...(prev ?? [])]);
      onChanged?.();
    } catch (err) {
      setFileError(
        err instanceof ApiError
          ? err.message
          : "Could not add a new version. Your existing file is unchanged.",
      );
    } finally {
      setReplacingId(null);
    }
  }

  useEffect(() => {
    let active = true;
    getDocumentFiles(documentId)
      .then((page) => active && setFiles(page.results))
      .catch(() => active && setFiles([]));
    return () => {
      active = false;
    };
  }, [documentId]);

  function handleUploaded(file: DocumentFile) {
    setFiles((prev) => [file, ...(prev ?? [])]);
    onChanged?.();
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
      await deleteDocumentFile(documentId, pendingDelete.id);
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== pendingDelete.id));
      setPendingDelete(null);
      onChanged?.();
    } catch (err) {
      setFileError(
        err instanceof ApiError
          ? err.message
          : "Could not move the file to trash. Please try again.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title="Files"
      description="Scans and copies linked to this document."
    >
      <div className="space-y-4">
        <DocumentFileUploader documentId={documentId} onUploaded={handleUploaded} />
        {/* Hidden picker for "New version" — replaces a file by uploading a new
            one as a version; the old file is kept as history. */}
        <input
          ref={replaceInputRef}
          type="file"
          className="sr-only"
          onChange={onReplaceFileSelected}
        />

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
            replacingId={replacingId}
            onPreview={setPreviewingFile}
            onDownload={handleDownload}
            onShare={setSharingFile}
            onRequestDelete={setPendingDelete}
            onReplace={versioningEnabled ? handleReplace : undefined}
            onEditPages={pageEditEnabled ? setEditingPagesFile : undefined}
          />
        )}

        <DocumentTrashedFiles
          documentId={documentId}
          onRestored={(file) => {
            setFiles((prev) => [file, ...(prev ?? [])]);
            onChanged?.();
          }}
        />
      </div>

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
          key={previewingFile.id}
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

      {editingPagesFile && (
        <PageEditorDialog
          documentId={documentId}
          file={editingPagesFile}
          onClose={() => setEditingPagesFile(null)}
          onSaved={(created) => {
            setFiles((prev) => [created, ...(prev ?? [])]);
            setEditingPagesFile(null);
            onChanged?.();
          }}
        />
      )}
    </SectionCard>
  );
}
