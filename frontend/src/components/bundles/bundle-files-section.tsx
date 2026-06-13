"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
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
import { ApiError } from "@/lib/api";
import {
  downloadDocumentFile,
  formatFileSize,
  getDocumentFilePreviewBlob,
} from "@/lib/document-files";
import { formatDate } from "@/lib/documents";
import { getBundleFiles } from "@/lib/renewal-workspace";
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

  async function handlePreview(file: BundleFile) {
    setActionError(null);
    setBusyFileId(file.id);
    try {
      const blob = await getDocumentFilePreviewBlob(file.document, file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Give the new tab time to load before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not preview this file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleDownload(file: BundleFile) {
    setActionError(null);
    setBusyFileId(file.id);
    try {
      await downloadDocumentFile({
        document: file.document,
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Files</CardTitle>
          <CardDescription>
            Every file linked to this bundle through its requirements.
          </CardDescription>
        </div>
        {data && data.summary.total_files > 0 && (
          <Badge variant="secondary">
            {data.summary.total_files} file
            {data.summary.total_files === 1 ? "" : "s"} ·{" "}
            {formatFileSize(data.summary.total_size)}
          </Badge>
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
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
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
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
