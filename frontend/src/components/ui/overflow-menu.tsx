"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A small "⋯ More" overflow menu for collapsing secondary row actions, so lists
 * lead with one or two primary actions instead of a wall of equal-weight
 * buttons. Hand-rolled popover (Escape + click-outside) mirroring the app's
 * other popovers (NotificationBell, account menu) — items are native buttons, so
 * keyboard order works without faux menu semantics.
 *
 * Items live inside the popover; any dialog an item opens must be mounted by the
 * caller OUTSIDE this menu, or it would unmount when the menu closes.
 */
const MenuContext = createContext<{ close: () => void } | null>(null);

export function OverflowMenu({
  label = "More actions",
  align = "end",
  children,
}: {
  label?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="px-2"
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+0.35rem)] z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-floating",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <MenuContext.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function OverflowMenuItem({
  icon: Icon,
  onSelect,
  disabled,
  destructive,
  children,
}: {
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        // Close first so any dialog the action opens (mounted outside this menu)
        // isn't torn down with the popover.
        ctx?.close();
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function OverflowMenuSeparator() {
  return <div aria-hidden className="my-1 h-px bg-border" />;
}
