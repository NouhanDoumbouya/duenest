"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Combine,
  Download,
  Eye,
  FolderInput,
  EyeOff,
  Loader2,
  Minimize2,
  Plus,
  Scissors,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { useFeature } from "@/components/features/feature-flags-provider";
import { DocumentFileViewer } from "@/components/documents/document-file-viewer";
import { ExtractPagesDialog } from "@/components/documents/extract-pages-dialog";
import { CompressPdfDialog } from "@/components/documents/compress-pdf-dialog";
import { RedactionEditor } from "@/components/scanner/RedactionEditor";
import { FileThumbnail } from "@/components/documents/file-thumbnail";
import { Button, buttonVariants } from "@/components/ui/button";
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
  checkInboxDuplicate,
  createDocumentFromInboxFile,
  deleteInboxFile,
  downloadDocumentFile,
  formatFileSize,
  getFileInbox,
  getInboxFileDownloadBlob,
  uploadInboxFile,
  uploadInboxFileWithProgress,
  validateFile,
} from "@/lib/document-files";
import { getDocuments, listDocumentCategories } from "@/lib/documents";
import { mergePdfs } from "@/lib/pdf/merge";
import { extractPages, getPdfPageCount } from "@/lib/pdf/extract";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import { compressPdf } from "@/lib/pdf/compress";
import { generatePdfBlob } from "@/lib/scanner/pdf";
import { applyRedactions, type RedactionRect } from "@/lib/scanner/redaction";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentCategory, DocumentRecord } from "@/types/documents";

interface UploadProgress {
  id: string;
  name: string;
  percent: number;
  status: "uploading" | "done" | "failed";
}

// Common document types for the post-upload "what is this?" prompt.
const TYPE_SUGGESTIONS = [
  "Passport",
  "Visa",
  "ID",
  "Insurance",
  "Certificate",
  "Contract",
];

export default function FileInboxPage() {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DocumentFile | null>(null);
  // File whose "create document" form should show a gentle expiry/reminder hint,
  // set when arriving from the scanner's "Add reminder" action.
  const [reminderHintFileId, setReminderHintFileId] = useState<number | null>(
    null,
  );
  const [selectedDocument, setSelectedDocument] = useState<Record<number, string>>({});
  const [newDocTitle, setNewDocTitle] = useState<Record<number, string>>({});
  const [newDocType, setNewDocType] = useState<Record<number, string>>({});
  const [newDocNotes, setNewDocNotes] = useState<Record<number, string>>({});
  const [newDocExpiry, setNewDocExpiry] = useState<Record<number, string>>({});
  const [newDocCategory, setNewDocCategory] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  // "Export selected pages" state: the PDF being split + its loaded bytes/count.
  const [extractTarget, setExtractTarget] = useState<DocumentFile | null>(null);
  const [extractBytes, setExtractBytes] = useState<ArrayBuffer | null>(null);
  const [extractPageCount, setExtractPageCount] = useState<number | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  // PDF redaction: the file being redacted + its rasterized page canvases.
  const [redactTarget, setRedactTarget] = useState<DocumentFile | null>(null);
  const [redactPages, setRedactPages] = useState<HTMLCanvasElement[] | null>(
    null,
  );
  const [redactBusy, setRedactBusy] = useState(false);
  // "Shrink PDF" (compress) target + busy state.
  const [compressTarget, setCompressTarget] = useState<DocumentFile | null>(
    null,
  );
  const [compressBusy, setCompressBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      getFileInbox(),
      getDocuments({ ordering: "title" }),
      listDocumentCategories(),
    ])
      .then(([fileResult, documentResult, categoryResult]) => {
        if (!active) return;
        setFiles(fileResult.results);
        setDocuments(documentResult.results);
        setCategories(categoryResult);
        // Deep link from the scanner success state
        // (/dashboard/files?file=<id>[&intent=reminder]): with reminder intent
        // we focus the file's expiry field so the user can set a renewal date;
        // otherwise we open its preview. Then drop the params so a refresh or
        // back-navigation doesn't repeat the action.
        const params = new URLSearchParams(window.location.search);
        const target = params.get("file");
        if (target) {
          const match = fileResult.results.find(
            (file) => file.id === Number(target),
          );
          if (match) {
            if (params.get("intent") === "reminder") {
              setReminderHintFileId(match.id);
              requestAnimationFrame(() => {
                const field = document.getElementById(`expiry-${match.id}`);
                field?.scrollIntoView({ behavior: "smooth", block: "center" });
                (field as HTMLInputElement | null)?.focus();
              });
            } else {
              setPreviewFile(match);
            }
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
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
    // Warn (non-blocking) about accidental duplicates before uploading copies.
    const dupChecks = await Promise.all(
      list.map((file) =>
        checkInboxDuplicate(file.name).catch(() => ({ exists: false, count: 0 })),
      ),
    );
    const duplicateNames = list
      .filter((_, i) => dupChecks[i].exists)
      .map((file) => file.name);
    // Seed a progress row per file, then upload sequentially with real % events.
    const seeded: UploadProgress[] = list.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      name: file.name,
      percent: 0,
      status: "uploading",
    }));
    setUploads(seeded);
    let uploaded = 0;
    const failures: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      const rowId = seeded[i].id;
      const validationError = validateFile(file);
      if (validationError) {
        failures.push(file.name);
        setUploads((rows) =>
          rows.map((r) => (r.id === rowId ? { ...r, status: "failed" } : r)),
        );
        continue;
      }
      try {
        const result = await uploadInboxFileWithProgress(file, (percent) =>
          setUploads((rows) =>
            rows.map((r) => (r.id === rowId ? { ...r, percent } : r)),
          ),
        );
        setFiles((current) => [result, ...(current ?? [])]);
        uploaded += 1;
        setUploads((rows) =>
          rows.map((r) =>
            r.id === rowId ? { ...r, percent: 100, status: "done" } : r,
          ),
        );
      } catch {
        failures.push(file.name);
        setUploads((rows) =>
          rows.map((r) => (r.id === rowId ? { ...r, status: "failed" } : r)),
        );
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      const dupNote =
        duplicateNames.length > 0
          ? ` Note: you already had ${duplicateNames.length === 1 ? "a file" : "files"} named ${duplicateNames.slice(0, 3).join(", ")} — kept as a copy.`
          : "";
      setNotice(
        `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded to File Inbox.${dupNote}`,
      );
    }
    if (failures.length > 0) {
      const shown = failures.slice(0, 3).join(", ");
      setError(
        `Could not upload: ${shown}${failures.length > 3 ? `, and ${failures.length - 3} more` : ""}. Check the file type and size (PDF, image, or Word up to 10 MB).`,
      );
    }
    // Clear finished rows shortly after, leaving any failures visible.
    setTimeout(() => {
      setUploads((rows) => rows.filter((r) => r.status === "failed"));
    }, 2500);
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
        ...(newDocExpiry[file.id] ? { expiry_date: newDocExpiry[file.id] } : {}),
        ...(newDocCategory[file.id] ? { category: newDocCategory[file.id] } : {}),
      });
      setFiles((current) => (current ?? []).filter((item) => item.id !== file.id));
      setDocuments((current) => [result.document, ...current]);
      setNotice(null);
      setLastCreated({ id: result.document.id, title: result.document.title });
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

  async function handleMerge() {
    const pdfs = (files ?? []).filter(
      (file) => selected.has(file.id) && file.content_type === "application/pdf",
    );
    if (pdfs.length < 2) {
      setError("Select at least two PDF files to merge.");
      return;
    }
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Fetch each file's bytes through the authenticated, owner-scoped
      // download endpoint, merge client-side (bytes never leave the browser),
      // and upload the result as a new inbox file. Originals are untouched.
      const buffers = await Promise.all(
        pdfs.map(async (file) =>
          new Uint8Array(
            await (await getInboxFileDownloadBlob(file.id)).arrayBuffer(),
          ),
        ),
      );
      const mergedBytes = await mergePdfs(buffers);
      // Copy into a tight ArrayBuffer so the bytes satisfy BlobPart cleanly.
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength,
      ) as ArrayBuffer;
      const merged = new File(
        [mergedBuffer],
        `Merged-${new Date().toISOString().slice(0, 10)}.pdf`,
        { type: "application/pdf" },
      );
      const result = await uploadInboxFile(merged);
      setFiles((current) => [result, ...(current ?? [])]);
      clearSelection();
      setNotice(
        `Merged ${pdfs.length} files into a new PDF. Originals preserved.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't merge those files. Your originals are unchanged.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function openExtract(file: DocumentFile) {
    setBusyFileId(file.id);
    setError(null);
    try {
      const buffer = await (
        await getInboxFileDownloadBlob(file.id)
      ).arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setExtractBytes(buffer);
      setExtractPageCount(count);
      setExtractTarget(file);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't open that PDF.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  function closeExtract() {
    setExtractTarget(null);
    setExtractBytes(null);
    setExtractPageCount(null);
  }

  async function confirmExtract(indices: number[]) {
    if (!extractTarget || !extractBytes) return;
    setExtractBusy(true);
    setError(null);
    setNotice(null);
    try {
      const bytes = await extractPages(extractBytes, indices);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const base = extractTarget.original_filename.replace(/\.[^/.]+$/, "");
      const file = new File([buffer], `${base}-pages.pdf`, {
        type: "application/pdf",
      });
      const result = await uploadInboxFile(file);
      setFiles((current) => [result, ...(current ?? [])]);
      closeExtract();
      setNotice(
        `Exported ${indices.length} page${indices.length === 1 ? "" : "s"} as a new PDF. Original preserved.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't export those pages. Your original is unchanged.",
      );
    } finally {
      setExtractBusy(false);
    }
  }

  async function openRedact(file: DocumentFile) {
    setBusyFileId(file.id);
    setError(null);
    try {
      const buffer = await (
        await getInboxFileDownloadBlob(file.id)
      ).arrayBuffer();
      const pages = await rasterizePdf(buffer);
      if (pages.length === 0) throw new Error("That PDF has no pages.");
      setRedactPages(pages);
      setRedactTarget(file);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't open that PDF for redaction.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  function closeRedact() {
    setRedactTarget(null);
    setRedactPages(null);
  }

  async function confirmRedact(rectsPerPage: RedactionRect[][]) {
    if (!redactTarget || !redactPages) return;
    setRedactBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Burn opaque rectangles into the rasterized pages, then rebuild an
      // image-only PDF. The output has no text layer, so redacted content is
      // non-recoverable. The original file is never modified.
      const burned = redactPages.map((canvas, i) =>
        applyRedactions(canvas, rectsPerPage[i] ?? []),
      );
      const blob = await generatePdfBlob(burned, { quality: 0.85 });
      const base = redactTarget.original_filename.replace(/\.[^/.]+$/, "");
      const file = new File([blob], `${base}-redacted.pdf`, {
        type: "application/pdf",
      });
      const result = await uploadInboxFile(file);
      setFiles((current) => [result, ...(current ?? [])]);
      closeRedact();
      setNotice("Redacted copy created. Your original is unchanged.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't create the redacted copy. Your original is unchanged.",
      );
    } finally {
      setRedactBusy(false);
    }
  }

  async function confirmCompress(quality: number) {
    if (!compressTarget) return;
    const original = compressTarget;
    setCompressBusy(true);
    setError(null);
    setNotice(null);
    try {
      const buffer = await (
        await getInboxFileDownloadBlob(original.id)
      ).arrayBuffer();
      const blob = await compressPdf(buffer, quality);
      // Don't save a "compressed" copy that isn't actually smaller (text PDFs
      // can grow when rasterized) — tell the user honestly instead.
      if (blob.size >= original.file_size) {
        setCompressTarget(null);
        setNotice(
          `This PDF is already compact (${formatFileSize(original.file_size)}). No smaller copy was created.`,
        );
        return;
      }
      const base = original.original_filename.replace(/\.[^/.]+$/, "");
      const file = new File([blob], `${base}-compressed.pdf`, {
        type: "application/pdf",
      });
      const result = await uploadInboxFile(file);
      setFiles((current) => [result, ...(current ?? [])]);
      setCompressTarget(null);
      setNotice(
        `Compressed: ${formatFileSize(original.file_size)} → ${formatFileSize(blob.size)}. Original preserved.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't compress that PDF. Your original is unchanged.",
      );
    } finally {
      setCompressBusy(false);
    }
  }

  const allSelected =
    files !== null && files.length > 0 && selected.size === files.length;
  const selectedPdfCount = useMemo(
    () =>
      (files ?? []).filter(
        (file) =>
          selected.has(file.id) && file.content_type === "application/pdf",
      ).length,
    [files, selected],
  );
  const mergeEnabled = useFeature("document_merge");
  const pageExtractEnabled = useFeature("document_page_extract");
  const redactionEnabled = useFeature("document_redaction");
  const compressEnabled = useFeature("document_compress");

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

      {uploads.length > 0 && (
        <section className="space-y-2" aria-label="Upload progress">
          {uploads.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{row.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    row.status === "failed"
                      ? "text-destructive"
                      : row.status === "done"
                        ? "text-brand-success"
                        : "text-muted-foreground",
                  )}
                >
                  {row.status === "failed"
                    ? "Failed"
                    : row.status === "done"
                      ? "Uploaded"
                      : `${row.percent}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    row.status === "failed"
                      ? "bg-destructive"
                      : row.status === "done"
                        ? "bg-brand-success"
                        : "bg-primary",
                  )}
                  style={{ width: `${row.status === "failed" ? 100 : row.percent}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}

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

      {lastCreated && (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-success/30 bg-brand-success/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">Document added.</span> Add an expiry
            date so DueNest can protect you.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/dashboard/documents/${lastCreated.id}/edit`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Add expiry date
            </Link>
            <Link
              href={`/dashboard/documents/${lastCreated.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLastCreated(null)}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          </div>
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
              {mergeEnabled && selectedPdfCount >= 2 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleMerge}
                  disabled={bulkBusy}
                >
                  {bulkBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Combine className="size-4" />
                  )}
                  Merge {selectedPdfCount} PDFs
                </Button>
              )}
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
                    <FileThumbnail file={file} />
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
                    {pageExtractEnabled &&
                      file.content_type === "application/pdf" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openExtract(file)}
                          disabled={busyFileId === file.id}
                        >
                          <Scissors className="size-4" />
                          Export pages
                        </Button>
                      )}
                    {compressEnabled &&
                      file.content_type === "application/pdf" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCompressTarget(file)}
                          disabled={busyFileId === file.id}
                        >
                          <Minimize2 className="size-4" />
                          Shrink
                        </Button>
                      )}
                    {redactionEnabled &&
                      file.content_type === "application/pdf" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openRedact(file)}
                          disabled={busyFileId === file.id}
                        >
                          <EyeOff className="size-4" />
                          Redact
                        </Button>
                      )}
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
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        What is this?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {TYPE_SUGGESTIONS.map((suggestion) => {
                          const active = newDocType[file.id] === suggestion;
                          return (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() =>
                                setNewDocType((current) => ({
                                  ...current,
                                  [file.id]: suggestion,
                                }))
                              }
                              aria-pressed={active}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {suggestion}
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label
                          htmlFor={`expiry-${file.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Expiry date
                        </Label>
                        <Input
                          id={`expiry-${file.id}`}
                          type="date"
                          value={newDocExpiry[file.id] ?? ""}
                          onChange={(event) =>
                            setNewDocExpiry((current) => ({
                              ...current,
                              [file.id]: event.target.value,
                            }))
                          }
                        />
                        {reminderHintFileId === file.id && (
                          <p className="mt-1 text-xs text-primary">
                            Add an expiry date, then create the document to track
                            its renewal.
                          </p>
                        )}
                      </div>
                      <div>
                        <Label
                          htmlFor={`category-select-${file.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Category
                        </Label>
                        <select
                          id={`category-select-${file.id}`}
                          value={newDocCategory[file.id] ?? ""}
                          onChange={(event) =>
                            setNewDocCategory((current) => ({
                              ...current,
                              [file.id]: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">No category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
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

      <ExtractPagesDialog
        key={extractTarget?.id ?? "none"}
        open={extractTarget !== null && extractPageCount !== null}
        fileName={extractTarget?.original_filename ?? ""}
        pageCount={extractPageCount ?? 0}
        busy={extractBusy}
        onCancel={closeExtract}
        onConfirm={confirmExtract}
      />

      {redactTarget !== null && redactPages !== null && (
        <RedactionEditor
          pages={redactPages}
          busy={redactBusy}
          tone="surface"
          onCancel={closeRedact}
          onCreate={confirmRedact}
        />
      )}

      <CompressPdfDialog
        open={compressTarget !== null}
        fileName={compressTarget?.original_filename ?? ""}
        originalSize={compressTarget?.file_size ?? 0}
        busy={compressBusy}
        onCancel={() => setCompressTarget(null)}
        onConfirm={confirmCompress}
      />
    </PageContainer>
  );
}
