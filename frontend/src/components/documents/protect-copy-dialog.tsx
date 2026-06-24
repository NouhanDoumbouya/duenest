"use client";

// Owner-only editor for Redaction + Watermarking V1.
//
// What it does: lets the owner draw redaction rectangles on a preview of an
// OWNED file and/or set watermark text, then sends the COORDINATES (normalized
// 0..1 page fractions) + watermark config to the backend, which renders a NEW
// protected copy server-side. This component NEVER flattens or uploads the file
// itself — the real, secure redaction happens on the server.
//
// Flow: pick protection (watermark / redaction / both) → draw boxes + set
// watermark → Create (draft) → Generate (server renders) → Ready: download the
// protected copy and/or add it to a sharing room. The original is never touched.
//
// Gating: the whole feature is behind the `redaction_watermarking` flag. Mount
// this only when `useFeature("redaction_watermarking")` is true. The backend
// still 503s if the flag is off, which is surfaced as a friendly error here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  DoorOpen,
  FileWarning,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import { getSharingRooms } from "@/lib/sharing-rooms";
import {
  PROTECTED_COPY_STATUS_LABELS,
  PROTECTED_COPY_STATUS_TONE,
  addProtectedCopyToRoom,
  createProtectedCopy,
  downloadProtectedCopy,
  generateProtectedCopy,
  isMeaningfulBox,
  isPdfContentType,
  normalizeRect,
  supportedForFormat,
} from "@/lib/protected-copies";
import { cn } from "@/lib/utils";
import type { SharingRoom } from "@/types/sharing-rooms";
import type {
  CreateProtectedCopyBody,
  ProtectedCopy,
  ProtectionType,
  RedactionInput,
  WatermarkPosition,
} from "@/types/protected-copies";

/** A redaction box stored in normalized 0..1 page fractions, with its page. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OwnedFileRef {
  /** DocumentFile id the protected copy is made from. */
  id: number;
  /**
   * Best-known content type. When unknown/unreliable (e.g. the rooms flow only
   * has a file ID), the editor falls back to the fetched preview blob's MIME
   * type to decide PDF-vs-image and supported-vs-not.
   */
  contentType?: string;
  filename: string;
  /** Authenticated fetch of the original's preview bytes for the backdrop. */
  fetchPreviewBlob: () => Promise<Blob>;
}

const WATERMARK_POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "diagonal", label: "Diagonal" },
  { value: "center", label: "Center" },
  { value: "footer", label: "Footer" },
  { value: "header", label: "Header" },
];

/**
 * The protect-copy editor drawer.
 *
 * @param file               the owned file to protect
 * @param onClose            close the editor
 * @param onReady            called once with the ready copy (e.g. to refresh a list)
 * @param onAddedToRoom      called after the protected copy is added to a room
 */
export function ProtectCopyDialog({
  file,
  onClose,
  onReady,
  onAddedToRoom,
}: {
  file: OwnedFileRef;
  onClose: () => void;
  onReady?: (copy: ProtectedCopy) => void;
  onAddedToRoom?: (roomId: number, copy: ProtectedCopy) => void;
}) {
  // If the caller gives a content type we trust it; otherwise we resolve the
  // real one from the fetched preview blob below. `unsupported` is only firm
  // once we know the type (either passed in or resolved).
  const passedType = file.contentType;
  const [resolvedType, setResolvedType] = useState<string | null>(
    passedType ?? null,
  );
  const knownType = passedType ?? resolvedType;
  // `false` means "definitely unsupported"; null/true means "supported so far".
  const unsupported = knownType !== null ? !supportedForFormat(knownType) : false;

  // ---- Preview pages (data URLs to draw boxes over) ------------------------
  const [pages, setPages] = useState<string[] | null>(null);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // ---- Protection config ---------------------------------------------------
  const [protection, setProtection] = useState<ProtectionType>("redaction");
  const [title, setTitle] = useState("");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] =
    useState<WatermarkPosition>("diagonal");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  // Per-page redaction boxes (parallel to `pages`).
  const [boxes, setBoxes] = useState<Box[][]>([]);

  // ---- Lifecycle -----------------------------------------------------------
  const [copy, setCopy] = useState<ProtectedCopy | null>(null);
  const [busy, setBusy] = useState<"create" | "generate" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wantsRedaction =
    protection === "redaction" || protection === "redaction_watermark";
  const wantsWatermark =
    protection === "watermark" || protection === "redaction_watermark";

  // Load + rasterize the preview once. We fetch first, then resolve the real
  // content type from the blob when the caller didn't give a reliable one.
  useEffect(() => {
    if (passedType && !supportedForFormat(passedType)) return;
    let active = true;
    (async () => {
      try {
        const blob = await file.fetchPreviewBlob();
        if (!active) return;
        // Resolve the effective type: prefer the passed type, else the blob's.
        const effectiveType = passedType ?? blob.type ?? "";
        if (!passedType) setResolvedType(effectiveType || "application/octet-stream");
        if (!supportedForFormat(effectiveType)) {
          // Unsupported once we actually know — drop into the unsupported UI.
          return;
        }
        if (isPdfContentType(effectiveType)) {
          const buffer = await blob.arrayBuffer();
          const canvases = await rasterizePdf(buffer);
          if (!active) return;
          setPages(canvases.map((c) => c.toDataURL("image/jpeg", 0.85)));
          setPageDims(canvases.map((c) => ({ w: c.width, h: c.height })));
          setBoxes(canvases.map(() => []));
        } else {
          const url = URL.createObjectURL(blob);
          // Read intrinsic size for an aspect-correct backdrop, then keep it.
          const img = new Image();
          img.onload = () => {
            if (!active) {
              URL.revokeObjectURL(url);
              return;
            }
            setPages([url]);
            setPageDims([{ w: img.naturalWidth, h: img.naturalHeight }]);
            setBoxes([[]]);
          };
          img.onerror = () => {
            if (!active) return;
            URL.revokeObjectURL(url);
            setPreviewError("Could not load this file's preview.");
          };
          img.src = url;
        }
      } catch (err) {
        if (!active) return;
        setPreviewError(
          err instanceof ApiError
            ? err.message
            : "Could not load this file's preview.",
        );
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, passedType]);

  // Revoke any object URLs (image previews) on unmount.
  useEffect(() => {
    return () => {
      pages?.forEach((p) => {
        if (p.startsWith("blob:")) URL.revokeObjectURL(p);
      });
    };
  }, [pages]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isLocked = copy?.status === "ready" || copy?.status === "processing";

  // ---- Build the request payload from normalized boxes ---------------------
  const redactionInputs = useCallback((): RedactionInput[] => {
    const out: RedactionInput[] = [];
    boxes.forEach((pageBoxes, i) => {
      for (const b of pageBoxes) {
        if (!isMeaningfulBox(b)) continue;
        out.push({
          page_number: i + 1,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      }
    });
    return out;
  }, [boxes]);

  // ---- Validation ----------------------------------------------------------
  const validationError = useMemo(() => {
    if (wantsWatermark && watermarkText.trim().length === 0) {
      return "Add the watermark text you want stamped on the copy.";
    }
    if (wantsRedaction && redactionInputs().length === 0) {
      return "Draw at least one redaction area to hide.";
    }
    return null;
  }, [wantsWatermark, wantsRedaction, watermarkText, redactionInputs]);

  // ---- Actions -------------------------------------------------------------
  async function handleCreateAndGenerate() {
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy("create");
    try {
      const body: CreateProtectedCopyBody = {
        original_file: file.id,
        protection_type: protection,
      };
      if (title.trim()) body.title = title.trim();
      if (wantsWatermark) {
        body.watermark_text = watermarkText.trim();
        body.watermark_position = watermarkPosition;
        body.watermark_opacity = watermarkOpacity;
      }
      if (wantsRedaction) body.redactions = redactionInputs();

      const draft = await createProtectedCopy(body);
      setCopy(draft);
      setBusy("generate");
      const generated = await generateProtectedCopy(draft.id);
      setCopy(generated);
      if (generated.status === "ready") onReady?.(generated);
      if (generated.status === "failed") {
        setError(
          generated.error_message ||
            "We couldn't generate the protected copy. Adjust and try again.",
        );
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (!copy) return;
    setError(null);
    try {
      await downloadProtectedCopy(copy);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function resetToEditor() {
    // Allow another attempt after a failure without re-opening the dialog.
    setCopy(null);
    setError(null);
  }

  // ---- Unsupported format --------------------------------------------------
  if (unsupported) {
    return (
      <DrawerBackdrop onClose={onClose}>
        <DrawerPanel
          label="Create protected copy"
          onClick={(e) => e.stopPropagation()}
          className="max-w-lg"
        >
          <Header onClose={onClose} title="Create a protected copy" />
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileWarning className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">
              This file can&apos;t be protected.
            </p>
            <p className="text-sm text-muted-foreground">
              Redaction &amp; watermarking is available for PDF and image files.
            </p>
          </div>
          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </DrawerPanel>
      </DrawerBackdrop>
    );
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Create protected copy"
        onClick={(e) => e.stopPropagation()}
        className="max-w-2xl"
      >
        <Header onClose={onClose} title="Create a protected copy">
          {copy && (
            <StatusBadge
              tone={PROTECTED_COPY_STATUS_TONE[copy.status]}
              withDot={false}
            >
              {PROTECTED_COPY_STATUS_LABELS[copy.status]}
            </StatusBadge>
          )}
        </Header>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          From <span className="font-medium">{file.filename}</span>
        </p>

        {/* Ready state ------------------------------------------------------ */}
        {copy?.status === "ready" ? (
          <ReadyPanel
            copy={copy}
            busyAdd={busy === "add"}
            error={error}
            onDownload={handleDownload}
            onAddToRoom={async (roomId) => {
              setError(null);
              setBusy("add");
              try {
                const res = await addProtectedCopyToRoom(copy.id, roomId);
                onAddedToRoom?.(roomId, res.protected_copy);
                onClose();
              } catch (err) {
                setError(friendlyError(err));
              } finally {
                setBusy(null);
              }
            }}
            onDone={onClose}
          />
        ) : (
          <>
            {/* Protection picker -------------------------------------------- */}
            <fieldset className="mt-5" disabled={isLocked || busy !== null}>
              <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                What to apply
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "redaction", label: "Redact" },
                    { value: "watermark", label: "Watermark" },
                    { value: "redaction_watermark", label: "Both" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProtection(opt.value)}
                    aria-pressed={protection === opt.value}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      protection === opt.value
                        ? "border-ring bg-accent text-accent-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Watermark config --------------------------------------------- */}
            {wantsWatermark && (
              <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pc-wm-text">Watermark text</Label>
                  <Input
                    id="pc-wm-text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL — For visa application only"
                    disabled={isLocked || busy !== null}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pc-wm-pos">Position</Label>
                    <select
                      id="pc-wm-pos"
                      value={watermarkPosition}
                      onChange={(e) =>
                        setWatermarkPosition(e.target.value as WatermarkPosition)
                      }
                      disabled={isLocked || busy !== null}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      {WATERMARK_POSITIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pc-wm-opacity">
                      Opacity ({Math.round(watermarkOpacity * 100)}%)
                    </Label>
                    <input
                      id="pc-wm-opacity"
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={watermarkOpacity}
                      onChange={(e) =>
                        setWatermarkOpacity(Number(e.target.value))
                      }
                      disabled={isLocked || busy !== null}
                      className="mt-2 w-full accent-[var(--color-ring)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Redaction editor --------------------------------------------- */}
            {wantsRedaction && (
              <RedactionCanvas
                pages={pages}
                pageDims={pageDims}
                previewError={previewError}
                pageIndex={pageIndex}
                setPageIndex={setPageIndex}
                boxes={boxes}
                setBoxes={setBoxes}
                disabled={isLocked || busy !== null}
              />
            )}

            {/* Title -------------------------------------------------------- */}
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="pc-title">Copy name (optional)</Label>
              <Input
                id="pc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Shown in your protected copies list"
                disabled={isLocked || busy !== null}
              />
            </div>

            {error && (
              <div className="mt-4">
                <InlineAlert>{error}</InlineAlert>
              </div>
            )}

            {copy?.status === "failed" && (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={resetToEditor}>
                  <RotateCcw className="size-4" /> Adjust and try again
                </Button>
              </div>
            )}

            <TrustNotice icon={ShieldCheck} title="Original stays unchanged">
              Redaction creates a NEW protected copy — your original file is never
              touched. Review the copy carefully before sharing it.
            </TrustNotice>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateAndGenerate}
                disabled={busy !== null || isLocked || validationError !== null}
              >
                {busy === "create" || busy === "generate" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {busy === "generate"
                  ? "Generating…"
                  : busy === "create"
                    ? "Creating…"
                    : "Create protected copy"}
              </Button>
            </div>
          </>
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Header ----------------------------------------------------------------

function Header({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

// ---- Redaction drawing canvas ----------------------------------------------

function RedactionCanvas({
  pages,
  pageDims,
  previewError,
  pageIndex,
  setPageIndex,
  boxes,
  setBoxes,
  disabled,
}: {
  pages: string[] | null;
  pageDims: { w: number; h: number }[];
  previewError: string | null;
  pageIndex: number;
  setPageIndex: (n: number) => void;
  boxes: Box[][];
  setBoxes: React.Dispatch<React.SetStateAction<Box[][]>>;
  disabled: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  const pageBoxes = boxes[pageIndex] ?? [];

  function pxFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handleDown(e: React.PointerEvent) {
    if (disabled) return;
    const p = pxFromEvent(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function handleMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const p = pxFromEvent(e);
    if (!p) return;
    setDraft({
      x: startRef.current.x,
      y: startRef.current.y,
      width: p.x - startRef.current.x,
      height: p.y - startRef.current.y,
    });
  }

  function handleUp() {
    const el = surfaceRef.current;
    if (draft && el) {
      const rect = el.getBoundingClientRect();
      const normalized = normalizeRect(
        { x: draft.x, y: draft.y, width: draft.width, height: draft.height },
        rect.width,
        rect.height,
      );
      if (isMeaningfulBox(normalized)) {
        setBoxes((prev) =>
          prev.map((arr, i) =>
            i === pageIndex ? [...arr, normalized] : arr,
          ),
        );
      }
    }
    startRef.current = null;
    setDraft(null);
  }

  function removeBox(idx: number) {
    setBoxes((prev) =>
      prev.map((arr, i) =>
        i === pageIndex ? arr.filter((_, j) => j !== idx) : arr,
      ),
    );
  }

  function clearPage() {
    setBoxes((prev) => prev.map((arr, i) => (i === pageIndex ? [] : arr)));
  }

  const dim = pageDims[pageIndex];
  const aspect = dim && dim.w > 0 ? `${dim.w} / ${dim.h}` : undefined;

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Drag over anything you want to hide.
        </span>
        {pageBoxes.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearPage}
            disabled={disabled}
            className="h-7 px-2 text-xs"
          >
            Clear page
          </Button>
        )}
      </div>

      {previewError ? (
        <InlineAlert>{previewError}</InlineAlert>
      ) : !pages ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading
          preview…
        </div>
      ) : (
        <>
          <div className="flex justify-center overflow-auto">
            <div
              ref={surfaceRef}
              className={cn(
                "relative max-w-full touch-none select-none",
                disabled ? "cursor-default" : "cursor-crosshair",
              )}
              style={{ aspectRatio: aspect, width: dim ? "100%" : undefined }}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pages[pageIndex]}
                alt={`Page ${pageIndex + 1} preview`}
                draggable={false}
                className="pointer-events-none block max-h-[50vh] w-full select-none object-contain"
              />
              {pageBoxes.map((b, i) => (
                <div
                  key={i}
                  className="group absolute border border-foreground/70 bg-foreground/85"
                  style={{
                    left: `${b.x * 100}%`,
                    top: `${b.y * 100}%`,
                    width: `${b.width * 100}%`,
                    height: `${b.height * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeBox(i)}
                    disabled={disabled}
                    aria-label={`Remove redaction area ${i + 1}`}
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
              {draft && (
                <div
                  className="pointer-events-none absolute border-2 border-ring bg-ring/20"
                  style={{
                    left: Math.min(draft.x, draft.x + draft.width),
                    top: Math.min(draft.y, draft.y + draft.height),
                    width: Math.abs(draft.width),
                    height: Math.abs(draft.height),
                  }}
                />
              )}
            </div>
          </div>

          {pages.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                disabled={pageIndex === 0}
                aria-label="Previous page"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <span className="text-xs text-muted-foreground">
                Page {pageIndex + 1} of {pages.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPageIndex(Math.min(pages.length - 1, pageIndex + 1))
                }
                disabled={pageIndex === pages.length - 1}
                aria-label="Next page"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Ready panel: download + add to room -----------------------------------

function ReadyPanel({
  copy,
  busyAdd,
  error,
  onDownload,
  onAddToRoom,
  onDone,
}: {
  copy: ProtectedCopy;
  busyAdd: boolean;
  error: string | null;
  onDownload: () => void;
  onAddToRoom: (roomId: number) => void;
  onDone: () => void;
}) {
  const [rooms, setRooms] = useState<SharingRoom[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>("");

  useEffect(() => {
    let active = true;
    getSharingRooms("active")
      .then((res) => active && setRooms(res.rooms))
      .catch(
        (err) =>
          active &&
          setRoomsError(
            err instanceof ApiError
              ? err.message
              : "Could not load your sharing rooms.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-brand-success/30 bg-brand-success/5 px-4 py-3">
        <p className="text-sm font-medium">Your protected copy is ready.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {PROTECTION_TYPE_DESCRIPTION(copy.protection_type)} The original file
          is unchanged.
        </p>
      </div>

      {error && (
        <div className="mt-4">
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="outline" onClick={onDownload}>
          <Download className="size-4" /> Download protected copy
        </Button>
      </div>

      {/* Add to room */}
      <div className="mt-5 rounded-xl border border-border bg-muted/20 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <DoorOpen className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-medium">Add to a sharing room</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Only the protected copy is added — never the original.
        </p>
        {roomsError ? (
          <InlineAlert>{roomsError}</InlineAlert>
        ) : rooms === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading
            rooms…
          </p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have an active room yet. Create one from the Sharing
            Rooms page, then come back.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor="pc-room">Room</Label>
              <select
                id="pc-room"
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                disabled={busyAdd}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <option value="">Choose a room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => onAddToRoom(Number(selectedRoom))}
              disabled={busyAdd || selectedRoom === ""}
            >
              {busyAdd ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <DoorOpen className="size-4" />
              )}
              Add to room
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function PROTECTION_TYPE_DESCRIPTION(type: ProtectionType): string {
  switch (type) {
    case "watermark":
      return "A watermark was stamped onto every page.";
    case "redaction":
      return "The areas you marked were permanently removed.";
    case "redaction_watermark":
    default:
      return "Your redactions were burned in and a watermark was stamped on.";
  }
}

// ---- Error helper ----------------------------------------------------------

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) {
      return "Redaction & watermarking is paused right now. Try again later.";
    }
    if (err.status === 403) {
      const data = err.data as Record<string, unknown> | null;
      if (data?.code === "plan_limit_exceeded") {
        return "You've reached your plan's storage limit. Upgrade to generate more protected copies.";
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
