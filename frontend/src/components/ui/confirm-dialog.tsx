"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * A small, dependency-free confirmation modal for destructive actions.
 *
 * Accessible essentials: role="dialog" + aria-modal, Escape to cancel, backdrop
 * click to cancel, and focus moved to the (safe) cancel button on open.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <h2 id="confirm-title" className="font-heading text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            autoFocus
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
