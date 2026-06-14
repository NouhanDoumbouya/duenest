"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  FolderInput,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
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
import type { DocumentFile } from "@/types/document-files";
import type { DocumentRecord } from "@/types/documents";

export default function FileInboxPage() {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DocumentFile | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Record<number, string>>({});
  const [newDocTitle, setNewDocTitle] = useState<Record<number, string>>({});
  const [newDocType, setNewDocType] = useState<Record<number, string>>({});
  const [newDocNotes, setNewDocNotes] = useState<Record<number, string>>({});

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
    const file = fileList?.[0];
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadInboxFile(file);
      setFiles((current) => [uploaded, ...(current ?? [])]);
      setNotice("File uploaded to File Inbox.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file.");
    } finally {
      setUploading(false);
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

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="File Inbox"
        description="Upload important files first, then attach them to the right document or create a new document from them."
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-base font-semibold">Direct upload</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                PDF, image, Word files up to 10 MB.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload file
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
                disabled={uploading}
                onChange={(event) => handleUpload(event.target.files)}
              />
            </label>
          </div>
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

      {loading ? (
        <div className="flex min-h-[18rem] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading File Inbox...</span>
        </div>
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
            title="No inbox files"
            description="Upload a file here when you are not ready to choose a document yet."
          />
        </div>
      )}

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
