"use client";

import { useEffect } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ToastState {
  message: string;
  kind: "success" | "error";
}

/**
 * A single, controlled floating toast pinned to the bottom of the viewport.
 * Used for feedback that would otherwise land off-screen (e.g. acting on a row
 * far down a list). The parent owns the state; pass `null` to hide.
 */
export function Toast({
  toast,
  onDismiss,
  duration = 4000,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [toast, duration, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-foreground/10",
          toast.kind === "error"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-brand-success/30 bg-card text-foreground",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {toast.kind === "error" ? (
            <TriangleAlert className="size-4" aria-hidden />
          ) : (
            <Check className="size-4 text-brand-success" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
