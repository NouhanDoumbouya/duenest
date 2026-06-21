"use client";

import { useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-height slide-over backdrop. Owns Escape-to-close. Pair with
 * {@link DrawerPanel}, which owns focus management.
 */
export function DrawerBackdrop({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-150 motion-reduce:animate-none"
      onClick={onClose}
    >
      {children}
    </div>
  );
}

/**
 * The slide-over panel (role="dialog"). On open it moves focus inside, traps
 * Tab within the panel, and restores focus to the triggering element on close.
 */
export function DrawerPanel({
  children,
  className,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick?: MouseEventHandler<HTMLElement>;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Capture focus before moving it in, so we can restore it on close. This
    // effect runs before the backdrop's, while the trigger is still focused.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables[0] ?? panel).focus();

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={cn(
        "h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-floating outline-none animate-in slide-in-from-right-4 duration-200 ease-out motion-reduce:animate-none",
        className,
      )}
      onClick={onClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {children}
    </aside>
  );
}
