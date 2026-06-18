"use client";

import {
  Download,
  Eye,
  FileStack,
  FileText,
  FileUp,
  Loader2,
  Share2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { fileExtension, formatFileSize } from "@/lib/document-files";
import { formatDate } from "@/lib/documents";
import type { DocumentFile } from "@/types/document-files";

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="size-5" />
      </span>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        No files attached yet. Upload a passport scan, visa copy, certificate, or
        important document file to keep it linked with this record.
      </p>
    </div>
  );
}

export function DocumentFilesList({
  files,
  downloadingId,
  replacingId,
  onPreview,
  onDownload,
  onShare,
  onRequestDelete,
  onReplace,
  onEditPages,
}: {
  files: DocumentFile[];
  downloadingId: number | null;
  replacingId?: number | null;
  onPreview: (file: DocumentFile) => void;
  onDownload: (file: DocumentFile) => void;
  onShare: (file: DocumentFile) => void;
  onRequestDelete: (file: DocumentFile) => void;
  /** When provided, shows a "New version" action that replaces this file. */
  onReplace?: (file: DocumentFile) => void;
  /** When provided, shows an "Edit pages" action for PDF files. */
  onEditPages?: (file: DocumentFile) => void;
}) {
  if (files.length === 0) return <EmptyState />;

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => {
        const ext = fileExtension(file.original_filename).replace(".", "") || "file";
        const downloading = downloadingId === file.id;
        return (
          <li
            key={file.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {file.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="uppercase">{ext}</span> ·{" "}
                  {formatFileSize(file.file_size)} · Uploaded{" "}
                  {formatDate(file.created_at)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onPreview(file)}
                aria-label={`View ${file.original_filename}`}
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">View</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDownload(file)}
                disabled={downloading}
                aria-label={`Download ${file.original_filename}`}
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                <span className="hidden sm:inline">Download</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onShare(file)}
                aria-label={`Share ${file.original_filename}`}
              >
                <Share2 className="size-3.5" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              {onReplace && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReplace(file)}
                  disabled={replacingId === file.id}
                  aria-label={`Replace ${file.original_filename} with a new version`}
                >
                  {replacingId === file.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileUp className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">New version</span>
                </Button>
              )}
              {onEditPages && file.content_type === "application/pdf" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditPages(file)}
                  aria-label={`Edit pages of ${file.original_filename}`}
                >
                  <FileStack className="size-3.5" />
                  <span className="hidden sm:inline">Edit pages</span>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onRequestDelete(file)}
                aria-label={`Delete ${file.original_filename}`}
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
