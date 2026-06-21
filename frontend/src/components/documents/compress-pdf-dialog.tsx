"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { formatFileSize } from "@/lib/document-files";

const TIERS = [
  { id: "smaller", label: "Smaller file", quality: 0.5, hint: "Best for upload portals" },
  { id: "standard", label: "Standard", quality: 0.72, hint: "Balanced" },
  { id: "high", label: "High quality", quality: 0.9, hint: "Clearest, larger" },
] as const;

type TierId = (typeof TIERS)[number]["id"];

/**
 * Choose a compression level for a PDF. Honest framing: this is meant for
 * scanned / image-heavy PDFs, and the output is image-based (no selectable text).
 */
export function CompressPdfDialog({
  open,
  fileName,
  originalSize,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  originalSize: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (quality: number) => void;
}) {
  const [tier, setTier] = useState<TierId>("smaller");
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

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compress-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative my-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <h2 id="compress-title" className="font-heading text-lg font-semibold">
          Shrink PDF
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Make a smaller copy of <span className="font-medium">{fileName}</span>{" "}
          ({formatFileSize(originalSize)}). Your original is unchanged.
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

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Best for scanned or photo-based PDFs. The copy becomes image-based
          (text won&apos;t be selectable), and text PDFs may not get smaller.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm(TIERS.find((t) => t.id === tier)?.quality ?? 0.5)
            }
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Shrink PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
