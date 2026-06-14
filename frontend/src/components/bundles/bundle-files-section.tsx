"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileText,
  FolderOpen,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FilePreviewDialog,
  type FilePreviewState,
} from "@/components/ui/file-preview-dialog";
import { ApiError } from "@/lib/api";
import {
  downloadDocumentFile,
  formatFileSize,
  getDocumentFilePreviewBlob,
  getInboxFilePreviewBlob,
} from "@/lib/document-files";
import { formatDate } from "@/lib/documents";
import {
  exportBundleFilesZip,
  exportSelectedBundleFilesZip,
  getBundleFiles,
} from "@/lib/renewal-workspace";
import type {
  BundleFile,
  BundleFilesResponse,
  BundleMissingFileReason,
} from "@/types/renewal-workspace";

const MISSING_REASON_LABEL: Record<BundleMissingFileReason, string> = {
  no_file: "No file uploaded yet",
  file_trashed: "File is in the trash",
  document_trashed: "Document is in the trash",
};

export function BundleFilesSection({ bundleId }: { bundleId: number }) {
  const [data, setData] = useState<BundleFilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState<"all" | "selected" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<BundleFile | null>(null);
  const [previewFetch, setPreviewFetch] = useState<{
    url: string | null;
    loading: boolean;
    error: string | null;
  }>({ url: null, loading: false, error: null });
  const previewUrlRef = useRef<string | null>(null);

  function revokePreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  // Release the object URL when the component unmounts.
  useEffect(() => () => revokePreviewUrl(), []);

  useEffect(() => {
    let active = true;
    getBundleFiles(bundleId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load the files in this bundle.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bundleId, reloadKey]);

  function retry() {
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  function toggleSelected(id: number) {
    setExportDone(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runExport(mode: "all" | "selected") {
    if (!data) return;
    setExportError(null);
    setExportDone(null);
    setExporting(mode);
    try {
      if (mode === "all") {
        await exportBundleFilesZip(bundleId);
        setExportDone(
          `Prepared a ZIP of all ${data.summary.total_files} file${
            data.summary.total_files === 1 ? "" : "s"
          }.`,
        );
      } else {
        await exportSelectedBundleFilesZip(bundleId, [...selected]);
        setExportDone(
          `Prepared a ZIP of ${selected.size} selected file${
            selected.size === 1 ? "" : "s"
          }.`,
        );
      }
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "We could not prepare this ZIP. Please try again.",
      );
    } finally {
      setExporting(null);
    }
  }

  async function handlePreview(file: BundleFile) {
    setActionError(null);
    revokePreviewUrl();
    // Open the in-app preview immediately in a loading state.
    setPreviewFile(file);
    setPreviewFetch({ url: null, loading: true, error: null });
    try {
      const blob =
        file.document === null
          ? await getInboxFilePreviewBlob(file.id)
          : await getDocumentFilePreviewBlob(file.document, file.id);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewFetch({ url, loading: false, error: null });
    } catch (err) {
      setPreviewFetch({
        url: null,
        loading: false,
        error:
          err instanceof ApiError ? err.message : "Could not preview this file.",
      });
    }
  }

  function closePreview() {
    revokePreviewUrl();
    setPreviewFile(null);
    setPreviewFetch({ url: null, loading: false, error: null });
  }

  async function handleDownload(file: BundleFile) {
    setActionError(null);
    setBusyFileId(file.id);
    try {
      await downloadDocumentFile({
        document: file.document,
        document_title: file.document_title,
        assignment_status: file.document === null ? "inbox" : "attached",
        id: file.id,
        original_filename: file.original_filename,
      } as Parameters<typeof downloadDocumentFile>[0]);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  const preview: FilePreviewState | null = previewFile
    ? {
        fileName: previewFile.original_filename,
        contentType: previewFile.content_type,
        url: previewFetch.url,
        loading: previewFetch.loading,
        error: previewFetch.error,
        onDownload: () => handleDownload(previewFile),
        downloading: busyFileId === previewFile.id,
      }
    : null;

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Files</CardTitle>
          <CardDescription>
            Every file linked to this bundle through its requirements.
          </CardDescription>
        </div>
        {data && data.summary.total_files > 0 && (
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary">
              {data.summary.total_files} file
              {data.summary.total_files === 1 ? "" : "s"} ·{" "}
              {formatFileSize(data.summary.total_size)}
            </Badge>
            <Button
              size="sm"
              onClick={() => runExport("all")}
              disabled={exporting !== null}
            >
              {exporting === "all" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileArchive className="size-4" />
              )}
              {exporting === "all" ? "Preparing ZIP…" : "Download ZIP"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading files...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={retry}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            {actionError && (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            )}
            {exportError && (
              <p className="text-sm text-destructive" role="alert">
                {exportError}
              </p>
            )}
            {exportDone && (
              <p
                className="flex items-center gap-2 text-sm text-brand-success"
                role="status"
              >
                <CheckCircle2 className="size-4" />
                {exportDone}
              </p>
            )}

            {data && data.missing_files.length > 0 && (
              <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-4" />
                  {data.missing_files.length} requirement
                  {data.missing_files.length === 1 ? "" : "s"} have no usable
                  file
                </p>
                <ul className="mt-2 space-y-1 text-amber-700 dark:text-amber-200/80">
                  {data.missing_files.map((m) => (
                    <li key={m.requirement_id}>
                      {m.requirement_title} — {MISSING_REASON_LABEL[m.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!data || data.files.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <FolderOpen className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No files are linked to this bundle yet. Add files to the
                  related documents before exporting this pack.
                </p>
              </div>
            ) : (
              <>
                {selected.size > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium">
                      {selected.size} file{selected.size === 1 ? "" : "s"}{" "}
                      selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(new Set())}
                        disabled={exporting !== null}
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => runExport("selected")}
                        disabled={exporting !== null}
                      >
                        {exporting === "selected" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FileArchive className="size-4" />
                        )}
                        {exporting === "selected"
                          ? "Preparing ZIP…"
                          : "Download selected"}
                      </Button>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.files.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 rounded border-input"
                          checked={selected.has(file.id)}
                          onChange={() => toggleSelected(file.id)}
                          aria-label={`Select ${file.original_filename} for export`}
                        />
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <FileText className="size-4" />
                        </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {file.original_filename}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {file.document_title} ·{" "}
                          {formatFileSize(file.file_size)} · Added{" "}
                          {formatDate(file.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {file.is_previewable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(file)}
                          disabled={busyFileId === file.id}
                        >
                          <Eye className="size-4" />
                          Preview
                        </Button>
                      )}
                      <Button
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
                    </div>
                  </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <FilePreviewDialog preview={preview} onClose={closePreview} />
    </>
  );
}
