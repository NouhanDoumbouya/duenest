"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Loader2,
  PenLine,
  ShieldCheck,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  getDocumentFileDownloadBlob,
  getInboxFileDownloadBlob,
} from "@/lib/document-files";
import { prepareSignedCopy } from "@/lib/fill-sign";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";
import type {
  FillSignAnnotation,
  PreparedDocument,
  SignatureMethod,
} from "@/types/fill-sign";

type Tool = "text" | "date" | "signature" | null;

interface Mark extends FillSignAnnotation {
  id: string;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Math.random().toString(36).slice(2)}`;
}

/**
 * A drawn-signature canvas. Transparent background, so the exported PNG overlays
 * cleanly onto the PDF. Pointer-based so it works on touch and mouse.
 */
function SignaturePad({
  onCommit,
  onCancel,
}: {
  onCommit: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drew = useRef(false);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#0b1220";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    drew.current = true;
  }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drew.current = false;
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Draw your signature, then place it on the page.
      </p>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
        className="w-full touch-none rounded-lg border border-border bg-card"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (!drew.current) return;
            onCommit(canvasRef.current!.toDataURL("image/png"));
          }}
        >
          Use signature
        </Button>
      </div>
    </div>
  );
}

/**
 * Fill & Sign — place text / date / a drawn signature on a PDF and prepare a
 * signed COPY (the original is preserved). Mount conditionally so state is fresh
 * each open (e.g. `{file && <FillSignDialog key={file.id} … />}`).
 */
export function FillSignDialog({
  fileId,
  documentId,
  fileName,
  onClose,
  onPrepared,
}: {
  fileId: number;
  documentId: number | null;
  fileName: string;
  onClose: () => void;
  onPrepared?: (prepared: PreparedDocument) => void;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(true);
  const [pages, setPages] = useState<string[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PreparedDocument | null>(null);

  useEffect(() => {
    let active = true;
    const blob =
      documentId == null
        ? getInboxFileDownloadBlob(fileId)
        : getDocumentFileDownloadBlob(documentId, fileId);
    blob
      .then(async (b) => {
        const buf = new Uint8Array(await b.arrayBuffer());
        const canvases = await rasterizePdf(buf, { maxWidth: 900 });
        if (active) setPages(canvases.map((c) => c.toDataURL("image/jpeg", 0.85)));
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Fill & Sign supports PDF files only. Convert image scans to PDF first.",
        );
      });
    return () => {
      active = false;
    };
  }, [fileId, documentId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  function placeMark(e: React.MouseEvent<HTMLDivElement>) {
    if (!tool) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (tool === "signature") {
      if (!signature) return;
      setMarks((m) => [
        ...m,
        { id: uid(), page: pageIndex, x, y, type: "signature", image: signature, width: 0.24, height: 0.09 },
      ]);
    } else {
      const value = tool === "date" ? new Date().toLocaleDateString() : "Text";
      setMarks((m) => [
        ...m,
        { id: uid(), page: pageIndex, x, y, type: tool, value, font_size: 14 },
      ]);
    }
    setTool(null);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const method: SignatureMethod = marks.some((m) => m.type === "signature")
        ? "drawn"
        : "none";
      // `marks` carry an extra client-only `id`; the backend ignores unknown keys.
      const prepared = await prepareSignedCopy(fileId, {
        annotations: marks,
        signer_name: signerName,
        signature_method: method,
      });
      setResult(prepared);
      onPrepared?.(prepared);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Could not prepare the signed copy. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pageMarks = marks.filter((m) => m.page === pageIndex);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Fill & Sign ${fileName}`}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative my-auto flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-floating outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-card-title">Fill &amp; Sign</h2>
            <p className="truncate text-metadata">{fileName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        {result ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-success/12 text-brand-success">
              <Check className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Signed copy prepared
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Your original file is preserved. The prepared copy was saved to your
                documents. This is not a legal certification — acceptance may depend on
                the recipient and jurisdiction.
              </p>
            </div>
            <p className="text-metadata">
              {result.prepared_file.original_filename}
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-heading text-base font-semibold">
              Can&apos;t open this file
            </p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {loadError}
            </p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : pages === null ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="sr-only" role="status">
              Loading document…
            </span>
            <span aria-hidden>Loading document…</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton active={tool === "text"} onClick={() => setTool("text")} icon={Type}>
                Add text
              </ToolButton>
              <ToolButton active={tool === "date"} onClick={() => setTool("date")} icon={CalendarDays}>
                Add date
              </ToolButton>
              <ToolButton
                active={tool === "signature"}
                onClick={() => setTool("signature")}
                icon={PenLine}
              >
                {signature ? "Place signature" : "Sign"}
              </ToolButton>
              {tool && (
                <span className="text-xs text-muted-foreground">
                  Click the page to place it.
                </span>
              )}
            </div>

            {tool === "signature" && !signature && (
              <SignaturePad
                onCommit={(data) => setSignature(data)}
                onCancel={() => setTool(null)}
              />
            )}

            <div className="overflow-auto rounded-xl border border-border bg-muted/30 p-3">
              {/* The page is a click surface; marks are positioned over it. */}
              <div
                className={cn(
                  "relative mx-auto w-fit",
                  tool && "cursor-crosshair",
                )}
                onClick={placeMark}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pages[pageIndex]}
                  alt={`Page ${pageIndex + 1}`}
                  className="block max-w-full select-none rounded-md shadow-card"
                  draggable={false}
                />
                {pageMarks.map((m) => (
                  <div
                    key={m.id}
                    className="group absolute -translate-x-px -translate-y-px"
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                  >
                    {m.type === "signature" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image}
                        alt="Signature"
                        style={{ width: `${(m.width ?? 0.24) * 100}%` }}
                        className="min-w-24"
                      />
                    ) : (
                      <input
                        value={m.value ?? ""}
                        onChange={(e) =>
                          setMarks((arr) =>
                            arr.map((x) =>
                              x.id === m.id ? { ...x, value: e.target.value } : x,
                            ),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border border-primary/40 bg-card/90 px-1 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                        size={Math.max(4, (m.value ?? "").length)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMarks((arr) => arr.filter((x) => x.id !== m.id));
                      }}
                      aria-label="Remove mark"
                      className="absolute -top-2 -right-2 hidden size-4 items-center justify-center rounded-full bg-destructive text-[0.6rem] text-white group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {pages.length > 1 && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {pageIndex + 1} of {pages.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageIndex === pages.length - 1}
                  onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                >
                  Next
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="fs-signer" className="text-metadata">
                Signer name (optional)
              </label>
              <Input
                id="fs-signer"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. Amina Diallo"
                className="max-w-xs"
              />
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-success" />
              <span>
                Prepares a signed <strong>copy</strong>. Your original is preserved. Not a
                legal certification of signature.
              </span>
            </p>

            {submitError && (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || marks.length === 0}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Prepare signed copy
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}
