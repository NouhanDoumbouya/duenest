"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Download,
  Eye,
  FileText,
  FolderInput,
  Loader2,
  Plus,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  attachInboxFileToDocument,
  createDocumentFromInboxFile,
  deleteInboxFile,
  downloadDocumentFile,
  formatFileSize,
  getFileInbox,
  uploadInboxFile,
  validateFile,
} from "@/lib/document-files";
import { getDocuments } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";

export default function FileInboxPage() {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DocumentFile | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Record<number, string>>({});
  const [newDocTitle, setNewDocTitle] = useState<Record<number, string>>({});
  const [newDocType, setNewDocType] = useState<Record<number, string>>({});
  const [newDocNotes, setNewDocNotes] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getFileInbox(), getDocuments({ ordering: "title" })])
      .then(([fileResult, documentResult]) => {
        if (!active) return;
        setFiles(fileResult.results);
        setDocuments(documentResult.results);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load your file inbox.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalSize = useMemo(
    () => (files ?? []).reduce((sum, file) => sum + file.file_size, 0),
    [files],
  );

  async function handleUpload(fileList: FileList | null) {
    const list = fileList ? Array.from(fileList) : [];
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    let uploaded = 0;
    const failures: string[] = [];
    // Upload sequentially so failures are isolated and the list updates as each
    // file lands. (Per-file % progress would need XHR upload events — TODO.)
    for (const file of list) {
      const validationError = validateFile(file);
      if (validationError) {
        failures.push(file.name);
        continue;
      }
      try {
        const result = await uploadInboxFile(file);
        setFiles((current) => [result, ...(current ?? [])]);
        uploaded += 1;
      } catch {
        failures.push(file.name);
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      setNotice(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded to File Inbox.`);
    }
    if (failures.length > 0) {
      const shown = failures.slice(0, 3).join(", ");
      setError(
        `Could not upload: ${shown}${failures.length > 3 ? `, and ${failures.length - 3} more` : ""}. Check the file type and size (PDF, image, or Word up to 10 MB).`,
      );
    }
  }

  async function handleAttach(file: DocumentFile) {
    const documentId = Number(selectedDocument[file.id]);
    if (!documentId) {
      setError("Choose a document to attach this file to.");
      return;
    }
    setBusyFileId(file.id);
    setError(null);
    setNotice(null);
    try {
      await attachInboxFileToDocument(file.id, documentId);
      setFiles((current) => (current ?? []).filter((item) => item.id !== file.id));
      setNotice("File attached to document.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not attach file.");
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleCreateDocument(file: DocumentFile) {
    setBusyFileId(file.id);
    setError(null);
    setNotice(null);
    try {
      const result = await createDocumentFromInboxFile(file.id, {
        title: newDocTitle[file.id],
        document_type: newDocType[file.id],
        notes: newDocNotes[file.id],
      });
      setFiles((current) => (current ?? []).filter((item) => item.id !== file.id));
      setDocuments((current) => [result.document, ...current]);
      setNotice("Document created from inbox file.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create document.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleDownload(file: DocumentFile) {
    setBusyFileId(file.id);
    setError(null);
    try {
      await downloadDocumentFile(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download file.");
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleTrash(file: DocumentFile) {
    setBusyFileId(file.id);
    setError(null);
    setNotice(null);
    try {
      await deleteInboxFile(file.id);
      setFiles((current) => (current ?? []).filter((item) => item.id !== file.id));
      setNotice("File moved to trash.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not move file.");
    } finally {
      setBusyFileId(null);
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectAll() {
    setSelected(new Set((files ?? []).map((f) => f.id)));
  }

  async function handleBulkTrash() {
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    const ids = Array.from(selected);
    let done = 0;
    for (const id of ids) {
      try {
        await deleteInboxFile(id);
        done += 1;
        setFiles((current) => (current ?? []).filter((item) => item.id !== id));
      } catch {
        // Skip the failed one and keep going; report the successes.
      }
    }
    setBulkBusy(false);
    setConfirmBulk(false);
    clearSelection();
    setNotice(`${done} file${done === 1 ? "" : "s"} moved to trash.`);
    if (done < ids.length) {
      setError(`${ids.length - done} file(s) could not be moved. Try again.`);
    }
  }

  const allSelected =
    files !== null && files.length > 0 && selected.size === files.length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Files waiting to be organized"
        description="Turn uploads into complete documents — attach them to the right document or create a new one."
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleUpload(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-card p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-5" aria-hidden />
            )}
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold">
              {dragging ? "Drop files to upload" : "Drag & drop files here"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              PDF, image, or Word files up to 10 MB. You can add several at once.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring/50">
            <Upload className="size-4" aria-hidden />
            {uploading ? "Uploading…" : "Choose files"}
            <input
              type="file"
              multiple
              className="sr-only"
              accept="image/*,application/pdf,.doc,.docx"
              disabled={uploading}
              onChange={(event) => handleUpload(event.target.files)}
            />
          </label>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Inbox summary</p>
          <p className="mt-2 text-2xl font-semibold">{files?.length ?? 0}</p>
          <p className="text-sm text-muted-foreground">
            {formatFileSize(totalSize)} waiting to be organized
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {files && files.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <button
            type="button"
            onClick={allSelected ? clearSelection : selectAll}
            className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-pressed={allSelected}
          >
            {allSelected ? (
              <CheckSquare className="size-4 text-primary" aria-hidden />
            ) : (
              <Square className="size-4" aria-hidden />
            )}
            Select all
          </button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{selected.size} selected</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmBulk(true)}
                disabled={bulkBusy}
              >
                <Trash2 className="size-4" />
                Move to trash
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
                <X className="size-4" />
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <section className="grid gap-3" aria-busy="true" aria-label="Loading File Inbox">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          ))}
        </section>
      ) : files && files.length > 0 ? (
        <section className="grid gap-3">
          {files.map((file) => (
            <article
              key={file.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={() => toggleSelect(file.id)}
                      aria-label={`Select ${file.original_filename}`}
                      className="mt-2.5 size-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">
                        {file.original_filename}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatFileSize(file.file_size)} · File Inbox ·{" "}
                        {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewFile(file)}
                      disabled={!file.is_previewable}
                    >
                      <Eye className="size-4" />
                      Preview
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(file)}
                      disabled={busyFileId === file.id}
                    >
                      {busyFileId === file.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleTrash(file)}
                      disabled={busyFileId === file.id}
                    >
                      <Trash2 className="size-4" />
                      Move to trash
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor={`document-${file.id}`}>Attach to document</Label>
                    <div className="flex gap-2">
                      <select
                        id={`document-${file.id}`}
                        value={selectedDocument[file.id] ?? ""}
                        onChange={(event) =>
                          setSelectedDocument((current) => ({
                            ...current,
                            [file.id]: event.target.value,
                          }))
                        }
                        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Choose document</option>
                        {documents.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleAttach(file)}
                        disabled={busyFileId === file.id}
                      >
                        <FolderInput className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
                    <Label htmlFor={`title-${file.id}`}>Create document</Label>
                    <Input
                      id={`title-${file.id}`}
                      value={newDocTitle[file.id] ?? ""}
                      placeholder={file.original_filename.replace(/\.[^/.]+$/, "")}
                      onChange={(event) =>
                        setNewDocTitle((current) => ({
                          ...current,
                          [file.id]: event.target.value,
                        }))
                      }
                    />
                    <Input
                      value={newDocType[file.id] ?? ""}
                      placeholder="Document type"
                      onChange={(event) =>
                        setNewDocType((current) => ({
                          ...current,
                          [file.id]: event.target.value,
                        }))
                      }
                    />
                    <Textarea
                      value={newDocNotes[file.id] ?? ""}
                      placeholder="Notes"
                      rows={2}
                      onChange={(event) =>
                        setNewDocNotes((current) => ({
                          ...current,
                          [file.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      type="button"
                      onClick={() => handleCreateDocument(file)}
                      disabled={busyFileId === file.id}
                    >
                      <Plus className="size-4" />
                      Create document
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card">
          <EmptyState
            icon={Upload}
            title="No loose files. Everything is organized."
            description="Upload a file here when you're not ready to choose a document yet, and it'll wait for you."
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title="Move selected files to trash?"
        description={`${selected.size} file${selected.size === 1 ? "" : "s"} will be moved to trash. You can restore them later from Trash.`}
        confirmLabel="Move to trash"
        loading={bulkBusy}
        onConfirm={handleBulkTrash}
        onCancel={() => setConfirmBulk(false)}
      />

      <DocumentFileViewer
        file={previewFile}
        downloading={busyFileId === previewFile?.id}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
        onShare={() => undefined}
      />
    </PageContainer>
  );
}
