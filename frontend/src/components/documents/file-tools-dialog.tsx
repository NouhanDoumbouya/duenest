"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  EyeOff,
  Loader2,
  Minimize2,
  Plus,
  Scissors,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExtractPagesDialog } from "@/components/documents/extract-pages-dialog";
import { RedactionEditor } from "@/components/scanner/RedactionEditor";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { formatFileSize, saveBlob } from "@/lib/document-files";
import { getPdfPageCount } from "@/lib/pdf/extract";
import {
  isImage,
  runCompress,
  runExtract,
  runRedact,
  rasterizeForRedaction,
  toolsForFile,
  type ToolId,
} from "@/lib/files/tools";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";

// Compression tiers, mirrored from CompressPdfDialog so the two flows feel the
// same. Quality maps to JPEG quality for both PDFs (rasterized) and images.
const TIERS = [
  { id: "smaller", label: "Smaller file", quality: 0.5, hint: "Best for upload portals" },
  { id: "standard", label: "Standard", quality: 0.72, hint: "Balanced" },
  { id: "high", label: "High quality", quality: 0.9, hint: "Clearest, larger" },
] as const;

type TierId = (typeof TIERS)[number]["id"];

const TOOL_ICON: Record<ToolId, typeof Minimize2> = {
  compress: Minimize2,
  extract: Scissors,
  redact: EyeOff,
};

type Step = "pick" | "compress" | "extract" | "redact" | "result";

/** A produced file, ready to download / save / chain. */
interface WorkingFile {
  blob: Blob;
  name: string;
  contentType: string;
}

/**
 * One dialog that runs file transforms (compress / export pages / redact) and
 * ends in a result step: Download, Apply another tool (chaining), or Save to the
 * caller's destination. Surface-agnostic — the caller provides how to load the
 * original bytes and where a result is saved, so the Inbox and document detail
 * share the exact same experience. Originals are never modified.
 */
export function FileToolsDialog({
  file,
  loadBlob,
  onSave,
  saveLabel,
  onClose,
  onNotify,
}: {
  file: DocumentFile;
  /** Fetch the original file's bytes (owner-scoped). */
  loadBlob: () => Promise<Blob>;
  /** Persist a produced blob to the caller's destination (inbox / new version). */
  onSave: (blob: Blob, name: string) => Promise<void>;
  /** Verb for the save button, e.g. "Save to Inbox" or "Save as new version". */
  saveLabel: string;
  onClose: () => void;
  /** Surface a success/error message (toast or banner). */
  onNotify?: (message: string, kind: "success" | "error") => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [tier, setTier] = useState<TierId>("smaller");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The current input for the next transform: the original at first, then the
  // last result when chaining. `working` also drives the result panel.
  const [working, setWorking] = useState<WorkingFile | null>(null);
  // Size of the input that produced `working` — captured before the transform so
  // the result panel shows a correct before → after (working is the AFTER).
  const [resultBefore, setResultBefore] = useState(0);
  // Loaded lazily for extract/redact (page count / rasterized pages).
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [redactPages, setRedactPages] = useState<HTMLCanvasElement[] | null>(
    null,
  );

  const compressOn = useFeature("document_compress");
  const extractOn = useFeature("document_page_extract");
  const redactOn = useFeature("document_redaction");
  const flagEnabled: Record<string, boolean> = {
    document_compress: compressOn,
    document_page_extract: extractOn,
    document_redaction: redactOn,
  };

  // Which file the next tool acts on: the original, or the produced result when
  // chaining. Tool availability follows the current content type.
  const current = working
    ? { content_type: working.contentType, original_filename: working.name }
    : { content_type: file.content_type, original_filename: file.original_filename };
  const originalSize = working?.blob.size ?? file.file_size;
  const tools = toolsForFile(current).filter((t) => flagEnabled[t.flag]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  // Resolve the bytes the next transform should consume (original or last result).
  async function inputBlob(): Promise<Blob> {
    return working ? working.blob : await loadBlob();
  }

  async function startCompress() {
    setError(null);
    setStep("compress");
  }

  async function runCompressStep() {
    setBusy(true);
    setError(null);
    try {
      const source = await inputBlob();
      const quality = TIERS.find((t) => t.id === tier)?.quality ?? 0.5;
      const result = await runCompress(current, source, quality);
      finishWith(result.blob, result.name, result.blob.type || "application/pdf");
    } catch (err) {
      fail(err, "Couldn't compress that file. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function startExtract() {
    setError(null);
    setBusy(true);
    try {
      const source = await inputBlob();
      const count = await getPdfPageCount(await source.arrayBuffer());
      setPageCount(count);
      setStep("extract");
    } catch (err) {
      fail(err, "Couldn't open that PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmExtract(indices: number[]) {
    setBusy(true);
    setError(null);
    try {
      const source = await inputBlob();
      const result = await runExtract(current, source, indices);
      finishWith(result.blob, result.name, "application/pdf");
    } catch (err) {
      fail(err, "Couldn't export those pages. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function startRedact() {
    setError(null);
    setBusy(true);
    try {
      const source = await inputBlob();
      const pages = await rasterizeForRedaction(source);
      setRedactPages(pages);
      setStep("redact");
    } catch (err) {
      fail(err, "Couldn't open that PDF for redaction.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRedact(
    rectsPerPage: import("@/lib/scanner/redaction").RedactionRect[][],
  ) {
    if (!redactPages) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runRedact(current, redactPages, rectsPerPage);
      finishWith(result.blob, result.name, "application/pdf");
      setRedactPages(null);
    } catch (err) {
      fail(err, "Couldn't create the redacted copy. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  function finishWith(blob: Blob, name: string, contentType: string) {
    // `working` still holds the input that produced this result — capture its
    // size now so the result panel can show before → after correctly.
    setResultBefore(working?.blob.size ?? file.file_size);
    setWorking({ blob, name, contentType });
    setStep("result");
  }

  function runTool(id: ToolId) {
    if (id === "compress") void startCompress();
    else if (id === "extract") void startExtract();
    else if (id === "redact") void startRedact();
  }

  function downloadResult() {
    if (!working) return;
    saveBlob(working.blob, working.name);
  }

  async function saveResult() {
    if (!working) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(working.blob, working.name);
      onNotify?.(`Saved ${working.name}. Your original is unchanged.`, "success");
      onClose();
    } catch (err) {
      fail(err, "Couldn't save that copy. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  function applyAnother() {
    // Keep `working` as the new input so the next tool chains off this result.
    setStep("pick");
    setError(null);
  }

  // The redaction editor is its own full-screen surface.
  if (step === "redact" && redactPages) {
    return (
      <RedactionEditor
        pages={redactPages}
        busy={busy}
        tone="surface"
        onCancel={() => {
          setRedactPages(null);
          setStep("pick");
        }}
        onCreate={confirmRedact}
      />
    );
  }

  // Page picker reuses the existing extract dialog as this step.
  if (step === "extract" && pageCount !== null) {
    return (
      <ExtractPagesDialog
        open
        fileName={current.original_filename}
        pageCount={pageCount}
        busy={busy}
        onCancel={() => setStep("pick")}
        onConfirm={confirmExtract}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-tools-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="file-tools-title"
              className="font-heading text-lg font-semibold"
            >
              {step === "result" ? "Ready" : "File tools"}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {current.original_filename}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {step === "pick" && (
          <div className="mt-4 grid gap-2">
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tools are available for this file type right now.
              </p>
            ) : (
              tools.map((tool) => {
                const Icon = TOOL_ICON[tool.id];
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => runTool(tool.id)}
                    disabled={busy}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {tool.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Each tool creates a new copy — your original is unchanged.
            </p>
          </div>
        )}

        {step === "compress" && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Make a smaller copy ({formatFileSize(originalSize)}).
            </p>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  aria-pressed={tier === t.id}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    tier === t.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="block text-xs font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-[0.65rem] leading-tight text-muted-foreground">
                    {t.hint}
                  </span>
                </button>
              ))}
            </div>
            {!isImage(current) && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Best for scanned or photo-based PDFs. The copy becomes
                image-based (text won&apos;t be selectable), and text PDFs may
                not get smaller.
              </p>
            )}
            <div className="mt-6 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("pick")}
                disabled={busy}
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button onClick={runCompressStep} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Minimize2 className="size-4" />
                )}
                Compress
              </Button>
            </div>
          </div>
        )}

        {step === "result" && working && (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-brand-success/30 bg-brand-success/5 px-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
                <Check className="size-4" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{working.name}</p>
                <p className="text-muted-foreground">
                  {formatFileSize(resultBefore)} → {formatFileSize(working.blob.size)}
                </p>
              </div>
            </div>
            {working.blob.size >= resultBefore && (
              <p className="mt-2 text-xs text-muted-foreground">
                This copy isn&apos;t smaller than the original — you can still
                keep it, or discard it.
              </p>
            )}

            <div className="mt-5 grid gap-2">
              <Button onClick={saveResult} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {saveLabel}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={downloadResult} disabled={busy}>
                  <Download className="size-4" /> Download
                </Button>
                <Button variant="outline" onClick={applyAnother} disabled={busy}>
                  <Plus className="size-4" /> Another tool
                </Button>
              </div>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
