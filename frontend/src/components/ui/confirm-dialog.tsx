"use client";

import { useEffect, useId } from "react";

import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/use-focus-trap";

/**
 * A small, dependency-free confirmation modal for destructive actions.
 *
 * Accessible essentials: role="dialog" + aria-modal, labelled + described by its
 * title/body, Escape to cancel, backdrop click to cancel, and full focus
 * management (focus moved in on open, Tab trapped, restored to the trigger on
 * close) via useFocusTrap.
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
  const titleId = useId();
  const descId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);

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
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10 outline-none"
      >
        <h2 id={titleId} className="font-heading text-lg font-semibold">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
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
