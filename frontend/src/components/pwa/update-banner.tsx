"use client";

import { RefreshCw, X } from "lucide-react";

/**
 * "Update available" banner. Appears when a new service worker is waiting. The
 * refresh is user-initiated (never auto-applied mid-upload/scan): clicking it
 * activates the new worker and reloads.
 */
export function UpdateBanner({
  visible,
  onUpdate,
  onDismiss,
}: {
  visible: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-md p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <RefreshCw className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">A new version is ready</p>
          <p className="truncate text-xs text-muted-foreground">
            Refresh to get the latest DueNest.
          </p>
        </div>
        <button
          type="button"
          onClick={onUpdate}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss update notice"
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
