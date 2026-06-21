"use client";

import { useEffect } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/use-focus-trap";

export interface FilePreviewState {
  fileName: string;
  contentType: string;
  /** Object URL for the fetched blob, or null while loading / on error. */
  url: string | null;
  loading: boolean;
  error: string | null;
  /** Optional download handler (omitted for view-only contexts). */
  onDownload?: () => void;
  downloading?: boolean;
  /** Optional watermark text tiled over the preview to deter screenshots. */
  watermark?: string;
}

function kindOf(contentType: string): "image" | "pdf" | "other" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  return "other";
}

/**
 * In-app file preview. Renders images and PDFs inline (no new browser tab) with
 * a backdrop, Escape-to-close, and a graceful fallback for unsupported types.
 */
export function FilePreviewDialog({
  preview,
  onClose,
}: {
  preview: FilePreviewState | null;
  onClose: () => void;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(preview !== null);

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview, onClose]);

  if (!preview) return null;
  const kind = kindOf(preview.contentType);

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${preview.fileName}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium">{preview.fileName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {preview.onDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={preview.onDownload}
                disabled={preview.downloading}
              >
                {preview.downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div
          className="relative min-h-[60vh] flex-1 overflow-auto bg-muted/30 p-3"
          onContextMenu={(event) => event.preventDefault()}
        >
          {preview.watermark && !preview.loading && !preview.error && (
            <WatermarkOverlay text={preview.watermark} />
          )}
          {preview.loading ? (
            <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading preview…
            </div>
          ) : preview.error ? (
            <Fallback message={preview.error} />
          ) : preview.url && kind === "image" ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.fileName}
                className="max-h-[80vh] max-w-full rounded-lg border border-border bg-card object-contain shadow-elevated"
              />
            </div>
          ) : preview.url && kind === "pdf" ? (
            <iframe
              src={preview.url}
              title={preview.fileName}
              className="h-[78vh] w-full rounded-lg border border-border bg-card"
            />
          ) : (
            <Fallback message="Preview is not available for this file type." />
          )}
        </div>
      </div>
    </div>
  );
}

function WatermarkOverlay({ text }: { text: string }) {
  // A diagonal, tiled, low-opacity watermark layered above the preview content.
  // pointer-events-none keeps the underlying preview fully interactive.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-12 overflow-hidden opacity-[0.12]"
    >
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="-rotate-[30deg] text-xs font-semibold whitespace-nowrap text-foreground select-none"
        >
          {text}
        </span>
      ))}
    </div>
  );
}

function Fallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <FileText className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
