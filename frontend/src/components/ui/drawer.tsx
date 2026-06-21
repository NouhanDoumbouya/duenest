"use client";

import { useEffect, type MouseEventHandler, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

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
  const panelRef = useFocusTrap<HTMLElement>(true);

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
