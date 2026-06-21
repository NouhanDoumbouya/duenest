"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

/**
 * Pick which pages of a PDF to extract into a new copy. Page selection is
 * 0-based internally; labels are 1-based. The parent does the actual extract +
 * upload; this dialog only collects the choice.
 */
export function ExtractPagesDialog({
  open,
  fileName,
  pageCount,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  pageCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (indices: number[]) => void;
}) {
  // Selection starts empty; the parent remounts this dialog per file (via key),
  // so state is naturally fresh each time it opens.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative my-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <h2 id="extract-title" className="font-heading text-lg font-semibold">
          Export selected pages
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose pages from <span className="font-medium">{fileName}</span>. This
          creates a new PDF — your original is unchanged.
        </p>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{selected.size} of {pageCount} selected</span>
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() =>
              setSelected((prev) =>
                prev.size === pageCount
                  ? new Set()
                  : new Set(Array.from({ length: pageCount }, (_, i) => i)),
              )
            }
          >
            {selected.size === pageCount ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={selected.has(i)}
              className={cn(
                "min-w-9 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected.has(i)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selected).sort((a, b) => a - b))}
            disabled={busy || selected.size === 0}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Export {selected.size > 0 ? `${selected.size} ` : ""}page
            {selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}
