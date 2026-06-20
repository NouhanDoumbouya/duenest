"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFeature } from "@/components/features/feature-flags-provider";
import { cn } from "@/lib/utils";
import { recognizeWords } from "@/lib/scanner/ocr";
import {
  isMeaningfulRect,
  normalizeRect,
  type RedactionRect,
} from "@/lib/scanner/redaction";
import {
  findRedactions,
  type RedactionPreset,
} from "@/lib/scanner/smart-redaction";

/**
 * Visual tone. `dark` matches the force-dark scanner; `surface` uses semantic
 * theme tokens so the editor fits the (light or dark) File Inbox. The drawing
 * colors (teal draft, black redaction) sit over the document image and stay the
 * same in both tones.
 */
export type RedactionTone = "dark" | "surface";

const TONES: Record<
  RedactionTone,
  {
    root: string;
    border: string;
    iconBtn: string;
    meta: string;
    warn: string;
    cancelVariant: "ghost" | "outline";
    cancelClass: string;
    primaryClass: string;
  }
> = {
  dark: {
    root: "bg-slate-950 text-slate-50",
    border: "border-white/10",
    iconBtn: "text-slate-300 hover:bg-white/10",
    meta: "text-slate-400",
    warn: "text-amber-300/90",
    cancelVariant: "ghost",
    cancelClass: "text-slate-300 hover:bg-white/5 hover:text-white",
    primaryClass: "bg-teal-500 text-slate-950 hover:bg-teal-400",
  },
  surface: {
    root: "bg-background text-foreground",
    border: "border-border",
    iconBtn: "text-muted-foreground hover:bg-muted",
    meta: "text-muted-foreground",
    warn: "text-amber-600",
    cancelVariant: "outline",
    cancelClass: "",
    primaryClass: "",
  },
};

/**
 * Full-screen editor for drawing burn-in redaction areas over rasterized pages.
 * Rectangles are kept normalized (0..1) per page; the parent burns them into the
 * full-resolution canvases on export. This never touches the original — export
 * always produces a NEW copy.
 */
export function RedactionEditor({
  pages,
  busy,
  tone = "dark",
  onCancel,
  onCreate,
}: {
  pages: HTMLCanvasElement[];
  busy: boolean;
  tone?: RedactionTone;
  onCancel: () => void;
  onCreate: (rectsPerPage: RedactionRect[][]) => void;
}) {
  const t = TONES[tone];
  const urls = useMemo(
    () => pages.map((c) => c.toDataURL("image/jpeg", 0.85)),
    [pages],
  );
  const [page, setPage] = useState(0);
  const [rects, setRects] = useState<RedactionRect[][]>(() =>
    pages.map(() => []),
  );
  const [draft, setDraft] = useState<RedactionRect | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const smartOn = useFeature("smart_redaction");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [customTerm, setCustomTerm] = useState("");

  const totalAreas = rects.reduce((n, p) => n + p.length, 0);
  const pageAreas = rects[page]?.length ?? 0;

  // Assistive: OCR the current page and pre-draw boxes over sensitive data. The
  // boxes are normal editable rects — the user reviews/adjusts before creating.
  async function runAuto(preset: RedactionPreset) {
    const canvas = pages[page];
    if (!canvas || autoBusy) return;
    setAutoBusy(true);
    setAutoStatus("Scanning this page…");
    try {
      const words = await recognizeWords(canvas);
      const found = findRedactions(
        words,
        { preset, term: customTerm },
        canvas.width,
        canvas.height,
      );
      if (found.length === 0) {
        setAutoStatus("Nothing matched — draw boxes by hand instead.");
        return;
      }
      setRects((prev) =>
        prev.map((arr, i) => (i === page ? [...arr, ...found] : arr)),
      );
      setAutoStatus(
        `Added ${found.length} area${found.length === 1 ? "" : "s"} — review them, then create.`,
      );
    } catch {
      setAutoStatus("Couldn't scan this page. Draw boxes by hand instead.");
    } finally {
      setAutoBusy(false);
    }
  }

  function fractionFromEvent(
    e: React.PointerEvent,
  ): { x: number; y: number } | null {
    const el = surfaceRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return {
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const p = fractionFromEvent(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const p = fractionFromEvent(e);
    if (!p) return;
    setDraft(normalizeRect(startRef.current.x, startRef.current.y, p.x, p.y));
  }

  function handlePointerUp() {
    if (draft && isMeaningfulRect(draft)) {
      const committed = draft;
      setRects((prev) =>
        prev.map((arr, i) => (i === page ? [...arr, committed] : arr)),
      );
    }
    startRef.current = null;
    setDraft(null);
  }

  function undoLast() {
    setRects((prev) =>
      prev.map((arr, i) => (i === page ? arr.slice(0, -1) : arr)),
    );
  }

  return (
    <div className={cn("fixed inset-0 z-[110] flex flex-col", t.root)}>
      <header
        className={cn("flex items-center justify-between border-b p-3", t.border)}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel redaction"
          className={cn(
            "rounded-md p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            t.iconBtn,
          )}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-semibold">Redact area</h2>
        <button
          type="button"
          onClick={undoLast}
          disabled={pageAreas === 0}
          aria-label="Undo last area"
          className={cn(
            "rounded-md p-1 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            t.iconBtn,
          )}
        >
          <Undo2 className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-3">
        <div
          ref={surfaceRef}
          className="relative inline-block touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[page]}
            alt={`Page ${page + 1}`}
            draggable={false}
            className="max-h-[68vh] max-w-full select-none"
          />
          {(rects[page] ?? []).map((r, i) => (
            <span
              key={i}
              className="pointer-events-none absolute bg-black"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
              }}
            />
          ))}
          {draft && (
            <span
              className="pointer-events-none absolute border-2 border-teal-300 bg-teal-400/30"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.w * 100}%`,
                height: `${draft.h * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <footer
        className={cn("border-t p-3", t.border)}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div
          className={cn(
            "mb-2 flex items-center justify-between text-xs",
            t.meta,
          )}
        >
          <span>Drag over anything you want to hide.</span>
          <span>
            {totalAreas} area{totalAreas === 1 ? "" : "s"}
          </span>
        </div>

        {pages.length > 1 && (
          <div className="mb-3 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className={cn("rounded-md p-1 disabled:opacity-40", t.iconBtn)}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <span className={cn("text-xs", t.meta)}>
              Page {page + 1} of {pages.length}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              disabled={page === pages.length - 1}
              aria-label="Next page"
              className={cn("rounded-md p-1 disabled:opacity-40", t.iconBtn)}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {smartOn && (
          <div className={cn("mb-3 rounded-lg border p-2.5", t.border)}>
            <div className="mb-2 flex items-center gap-1.5">
              <Wand2 className="size-3.5" aria-hidden="true" />
              <span className="text-xs font-medium">Auto-find &amp; hide</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "bank", label: "Bank details" },
                  { id: "contact", label: "Email & phone" },
                  { id: "all", label: "All sensitive" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => runAuto(p.id)}
                  disabled={autoBusy}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs disabled:opacity-50",
                    t.border,
                    t.iconBtn,
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={customTerm}
                onChange={(e) => setCustomTerm(e.target.value)}
                placeholder="or type a word to hide (name, amount)…"
                disabled={autoBusy}
                className={cn(
                  "min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-xs outline-none placeholder:opacity-60 focus-visible:ring-2 focus-visible:ring-ring",
                  t.border,
                )}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => runAuto("custom")}
                disabled={autoBusy || !customTerm.trim()}
                className={t.cancelClass || undefined}
              >
                Find
              </Button>
            </div>
            {(autoBusy || autoStatus) && (
              <p className={cn("mt-2 flex items-center gap-1.5 text-xs", t.meta)}>
                {autoBusy && (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                )}
                {autoBusy ? "Scanning this page…" : autoStatus}
              </p>
            )}
          </div>
        )}

        <p className={cn("mb-3 text-center text-xs", t.warn)}>
          Auto-find is a helper — it can miss things. Review carefully before
          sharing. This creates a new copy; your original is unchanged.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant={t.cancelVariant}
            onClick={onCancel}
            disabled={busy}
            className={t.cancelClass || undefined}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onCreate(rects)}
            disabled={busy || totalAreas === 0}
            className={t.primaryClass || undefined}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Create redacted copy
          </Button>
        </div>
      </footer>
    </div>
  );
}
