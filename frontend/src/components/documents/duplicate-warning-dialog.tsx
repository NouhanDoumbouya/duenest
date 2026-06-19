"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/document-files";
import type { DuplicateCheckResult } from "@/lib/document-files";

const TITLE: Record<string, string> = {
  exact: "Same file already exists",
  possible: "Possible duplicate found",
  name: "A file with this name exists",
  none: "Possible duplicate found",
};

/**
 * Calm, non-destructive duplicate warning shown before adding a file that looks
 * like one the user already has. Nothing is changed unless the user chooses to —
 * and the only choices here are to keep both or not add it (no auto-delete, no
 * replace). "Add as new version" arrives with the versioning feature.
 */
export function DuplicateWarningDialog({
  open,
  fileName,
  fileSize,
  result,
  onKeepBoth,
  onSkip,
}: {
  open: boolean;
  fileName: string;
  fileSize: number;
  result: DuplicateCheckResult | null;
  onKeepBoth: () => void;
  onSkip: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onSkip();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onSkip]);

  if (!open || !result) return null;
  const match = result.matches[0];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={onSkip}
      />
      <div className="relative my-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <h2 id="dup-title" className="font-heading text-lg font-semibold">
          {TITLE[result.level] ?? TITLE.none}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re about to add{" "}
          <span className="font-medium text-foreground">{fileName}</span> (
          {formatFileSize(fileSize)}).
        </p>

        {match && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Existing file
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {match.original_filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(match.file_size)}
            </p>
            {match.reasons.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {match.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          You&apos;re in control — nothing was changed yet.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onSkip}>
            Don&apos;t add
          </Button>
          <Button onClick={onKeepBoth}>Keep both</Button>
        </div>
      </div>
    </div>
  );
}
