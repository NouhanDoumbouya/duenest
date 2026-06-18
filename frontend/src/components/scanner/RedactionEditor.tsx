"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isMeaningfulRect,
  normalizeRect,
  type RedactionRect,
} from "@/lib/scanner/redaction";

/**
 * Full-screen editor for drawing burn-in redaction areas over scanned pages.
 * Rectangles are kept normalized (0..1) per page; the parent burns them into the
 * full-resolution canvases on export. This never touches the original — export
 * always produces a NEW copy.
 */
export function RedactionEditor({
  pages,
  busy,
  onCancel,
  onCreate,
}: {
  pages: HTMLCanvasElement[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (rectsPerPage: RedactionRect[][]) => void;
}) {
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

  const totalAreas = rects.reduce((n, p) => n + p.length, 0);
  const pageAreas = rects[page]?.length ?? 0;

  function fractionFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
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
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-white/10 p-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel redaction"
          className="rounded-md p-1 text-slate-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-semibold">Redact area</h2>
        <button
          type="button"
          onClick={undoLast}
          disabled={pageAreas === 0}
          aria-label="Undo last area"
          className="rounded-md p-1 text-slate-300 hover:bg-white/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
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
            alt={`Scanned page ${page + 1}`}
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
        className="border-t border-white/10 p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
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
              className="rounded-md p-1 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <span className="text-xs text-slate-300">
              Page {page + 1} of {pages.length}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              disabled={page === pages.length - 1}
              aria-label="Next page"
              className="rounded-md p-1 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}

        <p className="mb-3 text-center text-xs text-amber-300/90">
          Review carefully before sharing. This creates a new copy; your original
          is unchanged.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="text-slate-300 hover:bg-white/5 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onCreate(rects)}
            disabled={busy || totalAreas === 0}
            className="bg-teal-500 text-slate-950 hover:bg-teal-400"
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
