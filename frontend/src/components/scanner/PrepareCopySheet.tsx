"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_WATERMARK_LEN,
  sanitizeWatermarkText,
  WATERMARK_PRESETS,
  type WatermarkOptions,
  type WatermarkPosition,
  type WatermarkStrength,
} from "@/lib/scanner/watermark";

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "diagonal", label: "Diagonal" },
  { id: "center", label: "Center" },
  { id: "footer", label: "Footer" },
];

const STRENGTHS: { id: WatermarkStrength; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "strong", label: "Strong" },
];

/** JPEG quality tiers for the exported copy. Lower quality → smaller file. */
const SIZE_TIERS = [
  { id: "smaller", label: "Smaller file", quality: 0.5, hint: "Best for upload portals" },
  { id: "standard", label: "Standard", quality: 0.72, hint: "Balanced" },
  { id: "high", label: "High quality", quality: 0.92, hint: "Clearest, larger" },
] as const;

type SizeTierId = (typeof SIZE_TIERS)[number]["id"];

export interface PreparedCopyOptions {
  watermark: WatermarkOptions | null;
  /** JPEG quality 0..1 used when encoding pages into the PDF. */
  quality: number;
  /** Page indices to include (0-based), or null for all pages. */
  selectedIndices: number[] | null;
}

/**
 * Bottom sheet for creating a prepared *copy* of the current scan. The copy is
 * always a new file — the original scan is never modified. Each section
 * (pages / file size / watermark) only appears when its feature is enabled for
 * the viewer, so the sheet never shows an unlaunched tool.
 */
export function PrepareCopySheet({
  pageCount,
  pageExportEnabled,
  compressionEnabled,
  watermarkEnabled,
  busy,
  onClose,
  onCreate,
}: {
  pageCount: number;
  pageExportEnabled: boolean;
  compressionEnabled: boolean;
  watermarkEnabled: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (options: PreparedCopyOptions) => void;
}) {
  const showPages = pageExportEnabled && pageCount > 1;
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(Array.from({ length: pageCount }, (_, i) => i)),
  );
  const [tier, setTier] = useState<SizeTierId>("standard");
  const [withWatermark, setWithWatermark] = useState(false);
  const [preset, setPreset] = useState<string>(WATERMARK_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [position, setPosition] = useState<WatermarkPosition>("diagonal");
  const [strength, setStrength] = useState<WatermarkStrength>("medium");

  const text = sanitizeWatermarkText(custom.trim() ? custom : preset);
  const useWatermark = watermarkEnabled && withWatermark;
  const selectedCount = showPages ? selected.size : pageCount;
  const canCreate = !busy && selectedCount > 0 && (!useWatermark || text.length > 0);

  function togglePage(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleCreate() {
    if (!canCreate) return;
    const quality = SIZE_TIERS.find((t) => t.id === tier)?.quality ?? 0.72;
    onCreate({
      watermark: useWatermark ? { text, position, strength } : null,
      quality,
      selectedIndices: showPages
        ? Array.from(selected).sort((a, b) => a - b)
        : null,
    });
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Prepare a copy"
      onClick={onClose}
    >
      <div
        className="max-h-[88%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-slate-900 p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Prepare a copy</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          Creates a new PDF for sharing or submission.{" "}
          <span className="text-slate-300">Your original stays unchanged.</span>
        </p>

        <div className="space-y-4">
          {showPages && (
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-300">Pages</p>
                <span className="text-xs text-slate-500">
                  {selected.size} of {pageCount} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: pageCount }, (_, i) => (
                  <ChipButton
                    key={i}
                    label={`${i + 1}`}
                    active={selected.has(i)}
                    onClick={() => togglePage(i)}
                  />
                ))}
              </div>
            </section>
          )}

          {compressionEnabled && (
            <section>
              <p className="mb-1.5 text-xs font-medium text-slate-300">
                File size
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {SIZE_TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTier(t.id)}
                    aria-pressed={tier === t.id}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                      tier === t.id
                        ? "border-teal-400/60 bg-teal-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    )}
                  >
                    <span className="block text-xs font-medium text-slate-100">
                      {t.label}
                    </span>
                    <span className="mt-0.5 block text-[0.65rem] leading-tight text-slate-500">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[0.7rem] text-slate-500">
                Size reduction depends on the document.
              </p>
            </section>
          )}

          {watermarkEnabled && (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setWithWatermark((v) => !v)}
                aria-pressed={withWatermark}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                  withWatermark
                    ? "border-teal-400/60 bg-teal-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <span className="text-sm font-medium text-slate-100">
                  Add watermark
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border",
                    withWatermark
                      ? "border-teal-300 bg-teal-400 text-slate-950"
                      : "border-white/30 text-transparent",
                  )}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
              </button>

              {withWatermark && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-300">
                      Label
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {WATERMARK_PRESETS.map((p) => (
                        <ChipButton
                          key={p}
                          label={p}
                          active={!custom.trim() && preset === p}
                          onClick={() => {
                            setPreset(p);
                            setCustom("");
                          }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={custom}
                      maxLength={MAX_WATERMARK_LEN}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="Or type custom text"
                      className="mt-2 w-full rounded-md border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                    />
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-300">
                      Position
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {POSITIONS.map((p) => (
                        <ChipButton
                          key={p.id}
                          label={p.label}
                          active={position === p.id}
                          onClick={() => setPosition(p.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-300">
                      Strength
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {STRENGTHS.map((s) => (
                        <ChipButton
                          key={s.id}
                          label={s.label}
                          active={strength === s.id}
                          onClick={() => setStrength(s.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-500">
                    Watermarks label a copy — they don&apos;t prevent copying or
                    misuse.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            className="text-slate-300 hover:bg-white/5 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            className="bg-teal-500 text-slate-950 hover:bg-teal-400"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {showPages && selectedCount < pageCount
              ? `Create copy (${selectedCount})`
              : "Create copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
        active
          ? "border-teal-400/60 bg-teal-500/10 text-teal-200"
          : "border-white/10 text-slate-300 hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}
