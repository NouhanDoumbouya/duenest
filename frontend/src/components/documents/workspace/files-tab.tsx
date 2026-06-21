"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useFeature } from "@/components/features/feature-flags-provider";
import { DocumentFilesList } from "@/components/documents/document-files-list";
import { FileToolsButton } from "@/components/documents/file-tools-button";
import { PageEditorDialog } from "@/components/documents/page-editor-dialog";
import { PreparedCopiesSection } from "@/components/documents/prepared-copies-section";
import { listPreparedDocuments } from "@/lib/fill-sign";
import { DocumentFileUploader } from "@/components/documents/document-file-uploader";
import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { DocumentTrashedFiles } from "@/components/documents/document-trashed-files";
import { SectionCard } from "@/components/ui/section-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { fileToSelected, setSharePrefill } from "@/lib/quick-share-prefill";
import {
  createDocumentFileVersion,
  deleteDocumentFile,
  downloadDocumentFile,
  getDocumentFileDownloadBlob,
  getDocumentFiles,
  uploadInboxFile,
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
  // Bumped to refetch files + refresh the signed-copies audit after an action
  // (e.g. a Fill & Sign prepared copy) that creates a file server-side.
  const [reloadKey, setReloadKey] = useState(0);
  // Ids of files that are Fill & Sign prepared copies, to badge them in the list.
  const [preparedFileIds, setPreparedFileIds] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<DocumentFile | null>(null);
  const [previewingFile, setPreviewingFile] = useState<DocumentFile | null>(null);
  const router = useRouter();

  // Sharing is unified on the SafeSend engine: a file's "Share" action seeds
  // the share wizard with that file and opens it, instead of a separate dialog.
  function handleShare(file: DocumentFile) {
    setSharePrefill({ files: [fileToSelected(file)] });
    router.push("/dashboard/quick-share/new");
  }
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [editingPagesFile, setEditingPagesFile] = useState<DocumentFile | null>(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);
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

  // Save a tool-produced blob (compress / export pages / redact) as a new
  // version of the source file. The original file is kept as history.
  async function saveToolResultAsVersion(
    source: DocumentFile,
    blob: Blob,
    name: string,
  ) {
    const file = new File([blob], name, {
      type: blob.type || "application/octet-stream",
    });
    const created = await createDocumentFileVersion(documentId, source.id, file);
    setFiles((prev) => [created, ...(prev ?? [])]);
    onChanged?.();
  }

  // Minimal-disclosure share: save the prepared (e.g. redacted) copy to the Inbox
  // as a separate shareable file — never a new version of the original — then open
  // the share wizard with it preselected.
  async function shareToolResult(blob: Blob, name: string) {
    const file = new File([blob], name, {
      type: blob.type || "application/octet-stream",
    });
    const saved = await uploadInboxFile(file);
    setSharePrefill({ files: [fileToSelected(saved)] });
    router.push("/dashboard/quick-share/new");
  }

  useEffect(() => {
    let active = true;
    getDocumentFiles(documentId)
      .then((page) => active && setFiles(page.results))
      .catch(() => active && setFiles([]));
    listPreparedDocuments({ document: documentId })
      .then(
        (prepared) =>
          active &&
          setPreparedFileIds(new Set(prepared.map((p) => p.prepared_file.id))),
      )
      .catch(() => {
        /* the badge is optional; ignore */
      });
    return () => {
      active = false;
    };
  }, [documentId, reloadKey]);

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
    <div className="space-y-6">
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
            preparedFileIds={preparedFileIds}
            downloadingId={downloadingId}
            replacingId={replacingId}
            onPreview={setPreviewingFile}
            onDownload={handleDownload}
            onShare={handleShare}
            onRequestDelete={setPendingDelete}
            onReplace={versioningEnabled ? handleReplace : undefined}
            onEditPages={pageEditEnabled ? setEditingPagesFile : undefined}
            renderTools={(file) => (
              <FileToolsButton
                file={file}
                variant="ghost"
                loadBlob={() => getDocumentFileDownloadBlob(documentId, file.id)}
                onSave={(blob, name) =>
                  saveToolResultAsVersion(file, blob, name)
                }
                onShare={shareToolResult}
                saveLabel="Save as new version"
                onNotify={(message, kind) => setToast({ message, kind })}
                onPrepared={() => {
                  setReloadKey((k) => k + 1);
                  onChanged?.();
                }}
              />
            )}
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
            handleShare(file);
          }}
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
      </SectionCard>
      <PreparedCopiesSection documentId={documentId} reloadKey={reloadKey} />
    </div>
  );
}
