"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * A small, dependency-free confirmation modal for destructive actions.
 *
 * Accessible essentials: role="dialog" + aria-modal, labelled + described by its
 * title/body, Escape to cancel, backdrop click to cancel, focus moved to the
 * (safe) cancel button on open, Tab focus trapped within the dialog, and focus
 * restored to the triggering element on close.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Restore focus to whatever opened the dialog once it closes/unmounts.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => previouslyFocused?.focus?.();
  }, [open]);

  // Escape to cancel; trap Tab focus within the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
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
        className="relative my-auto w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10"
      >
        <h2 id={titleId} className="font-heading text-lg font-semibold">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
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
