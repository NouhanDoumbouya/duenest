"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  Maximize2,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useFeature } from "@/components/features/feature-flags-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  fileExtension,
  formatFileSize,
  getDocumentFilePreviewBlob,
  getInboxFilePreviewBlob,
  isPreviewableDocumentFile,
} from "@/lib/document-files";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";

interface PreviewState {
  fileId: number | null;
  url: string | null;
  error: string | null;
}

function fileKind(file: DocumentFile): "pdf" | "image" | "unsupported" {
  if (!isPreviewableDocumentFile(file)) return "unsupported";
  if (file.content_type === "application/pdf") return "pdf";
  if (file.content_type.startsWith("image/")) return "image";
  return "unsupported";
}

export function DocumentFileViewer({
  file,
  downloading,
  onClose,
  onDownload,
  onShare,
}: {
  file: DocumentFile | null;
  downloading: boolean;
  onClose: () => void;
  onDownload: (file: DocumentFile) => void;
  onShare: (file: DocumentFile) => void;
}) {
  const [preview, setPreview] = useState<PreviewState>({
    fileId: null,
    url: null,
    error: null,
  });
  const advancedPreview = useFeature("advanced_document_preview");
  // Image zoom: `fit` (contain, the calm default) vs an explicit scale factor.
  // Callers key this component by file id, so zoom resets naturally per file.
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  // Mobile browsers (coarse pointer) refuse to render PDFs inside an <iframe>
  // and substitute a generic stub showing the blob id. Detect that and show a
  // friendly "open in a new tab" fallback instead. Default to embedding so SSR
  // and desktop keep the inline viewer.
  const [canEmbedPdf, setCanEmbedPdf] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCanEmbedPdf(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!file) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  useEffect(() => {
    let active = true;
    let previewUrl: string | null = null;

    if (!file || !isPreviewableDocumentFile(file)) {
      return () => undefined;
    }

    const previewPromise =
      file.document === null
        ? getInboxFilePreviewBlob(file.id)
        : getDocumentFilePreviewBlob(file.document, file.id);

    previewPromise
      .then((blob) => {
        if (!active) return;
        previewUrl = URL.createObjectURL(blob);
        setPreview({ fileId: file.id, url: previewUrl, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setPreview({
          fileId: file.id,
          url: null,
          error:
            err instanceof ApiError
              ? err.message
              : "Preview could not be loaded.",
        });
      });

    return () => {
      active = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  if (!file) return null;

  const kind = fileKind(file);
  const ext = fileExtension(file.original_filename).replace(".", "") || "file";
  const objectUrl = preview.fileId === file.id ? preview.url : null;
  const error = preview.fileId === file.id ? preview.error : null;
  const loading =
    isPreviewableDocumentFile(file) && preview.fileId !== file.id && !error;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-background/95 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.original_filename}`}
    >
      <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-semibold sm:text-base">
                {file.original_filename}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="uppercase">{ext}</span> ·{" "}
                {formatFileSize(file.file_size)}
                {file.document_title ? ` · ${file.document_title}` : " · File Inbox"}
                {file.created_at
                  ? ` · ${new Date(file.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <LockKeyhole className="size-3" />
              Account-only preview
            </span>
            {file.document !== null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onShare(file)}
              >
                <Share2 className="size-3.5" />
                Share
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => onDownload(file)}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-muted/40 p-3 sm:p-5">
          {loading ? (
            <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading secure preview...</span>
            </div>
          ) : error ? (
            <Fallback title="Preview could not be opened" message={error} />
          ) : kind === "unsupported" ? (
            <Fallback
              title="Preview is not available for this file type yet."
              message="You can still download it securely. Only PDF, JPEG, and PNG files can be opened inline right now."
              action={
                <Button
                  type="button"
                  onClick={() => onDownload(file)}
                  disabled={downloading}
                >
                  <Download className="size-4" />
                  Download file
                </Button>
              }
            />
          ) : objectUrl && kind === "image" ? (
            <div className="relative flex h-full min-h-[360px] items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl}
                alt={file.original_filename}
                className={cn(
                  "rounded-xl border border-border bg-card shadow-elevated",
                  fit && "max-h-full max-w-full object-contain",
                )}
                style={
                  fit
                    ? undefined
                    : { transform: `scale(${scale})`, transformOrigin: "center" }
                }
              />
              {advancedPreview && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card/95 px-1.5 py-1 text-xs shadow-elevated backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setFit(true);
                      setScale(1);
                    }}
                    aria-pressed={fit}
                    className={cn(
                      "rounded-full px-2 py-1 font-medium hover:bg-muted",
                      fit && "text-primary",
                    )}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => {
                      const base = fit ? 1 : scale;
                      setFit(false);
                      setScale(Math.max(0.5, +(base - 0.25).toFixed(2)));
                    }}
                    className="rounded-full p-1.5 hover:bg-muted"
                  >
                    <ZoomOut className="size-4" />
                  </button>
                  <span className="w-10 text-center tabular-nums text-muted-foreground">
                    {fit ? "Fit" : `${Math.round(scale * 100)}%`}
                  </span>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => {
                      const base = fit ? 1 : scale;
                      setFit(false);
                      setScale(Math.min(4, +(base + 0.25).toFixed(2)));
                    }}
                    className="rounded-full p-1.5 hover:bg-muted"
                  >
                    <ZoomIn className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Actual size"
                    onClick={() => {
                      setFit(false);
                      setScale(1);
                    }}
                    className="rounded-full p-1.5 hover:bg-muted"
                  >
                    <Maximize2 className="size-4" />
                  </button>
                </div>
              )}
            </div>
          ) : objectUrl && kind === "pdf" && canEmbedPdf ? (
            <iframe
              src={objectUrl}
              title={file.original_filename}
              className="h-full min-h-[70vh] w-full rounded-xl border border-border bg-card shadow-elevated"
            />
          ) : objectUrl && kind === "pdf" ? (
            <Fallback
              title="Open this PDF to read it"
              message="Your browser can't show PDFs inline on this device. Open it in a new tab, or download a copy — both stay private to your account."
              action={
                <a
                  href={objectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants())}
                >
                  <ExternalLink className="size-4" />
                  Open PDF
                </a>
              }
            />
          ) : (
            <Fallback
              title="Preview is ready"
              message="Open the file in a new browser tab if the embedded viewer does not render."
              action={
                objectUrl ? (
                  <a
                    href={objectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants())}
                  >
                    <ExternalLink className="size-4" />
                    Open preview
                  </a>
                ) : null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Fallback({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FileText className="size-6" />
        </span>
        <h3 className="mt-4 font-heading text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
