"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  Inbox,
  LayoutDashboard,
  Menu,
  Plus,
  ScanLine,
  Upload,
  Vault,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface BottomNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Returns true when the current path belongs to this destination. */
  match: (pathname: string) => boolean;
}

// Side destinations — two flank the raised "Add" action.
const LEFT_ITEMS: BottomNavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/dashboard",
  },
  {
    label: "Vault",
    href: "/dashboard/vault",
    icon: Vault,
    match: (p) =>
      ["/dashboard/vault", "/dashboard/documents", "/dashboard/files", "/dashboard/trash"].some(
        (base) => p === base || p.startsWith(`${base}/`),
      ),
  },
];

const RIGHT_ITEMS: BottomNavItem[] = [
  {
    label: "Planning",
    href: "/dashboard/planning",
    icon: CalendarClock,
    match: (p) =>
      ["/dashboard/planning", "/dashboard/attention", "/dashboard/reminders", "/dashboard/calendar", "/dashboard/timeline"].some(
        (base) => p === base || p.startsWith(`${base}/`),
      ),
  },
];

// Ways to get a document into DueNest. Scan is the primary, scan-forward option.
const ADD_ACTIONS: Array<{
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  primary?: boolean;
}> = [
  {
    href: "/dashboard/scanner",
    icon: ScanLine,
    title: "Scan a document",
    subtitle: "Capture with your camera",
    primary: true,
  },
  {
    href: "/dashboard/documents/new",
    icon: Upload,
    title: "Add a document",
    subtitle: "Enter details & attach a file",
  },
  {
    href: "/dashboard/files",
    icon: Inbox,
    title: "File Inbox",
    subtitle: "Organize uploaded files",
  },
];

function NavTab({ item, pathname }: { item: BottomNavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[0.68rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}

/**
 * App-like bottom navigation for mobile and installed PWA.
 *
 * Getting a document in is the primary job, so the centre is a raised "Add"
 * button that opens a quick sheet — Scan first (the hero action), then add a
 * document, then the File Inbox. Destinations flank it, with a "More" button for
 * the full navigation drawer. Hidden from `md` up (desktop sidebar takes over).
 */
export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!addOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAddOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen]);

  return (
    <>
      {/* Quick-add sheet */}
      {addOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setAddOpen(false)}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add to DueNest"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-card p-4 shadow-xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mx-auto max-w-lg">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
              <p className="px-1 pb-2 text-sm font-semibold">Add to DueNest</p>
              <div className="space-y-2">
                {ADD_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => setAddOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        action.primary
                          ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          action.primary
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{action.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {action.subtitle}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {LEFT_ITEMS.map((item) => (
            <NavTab key={item.href} item={item} pathname={pathname} />
          ))}

          {/* Raised primary action: Add (Scan / upload / inbox). */}
          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              aria-label="Add to DueNest"
              aria-expanded={addOpen}
              aria-haspopup="dialog"
              className="flex min-h-14 flex-col items-center justify-end gap-1 px-1 pb-1.5 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "-mt-5 flex size-12 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95",
                  addOpen && "rotate-45",
                )}
              >
                <Plus className="size-6 shrink-0" aria-hidden />
              </span>
              <span className="text-[0.68rem] font-medium text-muted-foreground">Add</span>
            </button>
          </li>

          {RIGHT_ITEMS.map((item) => (
            <NavTab key={item.href} item={item} pathname={pathname} />
          ))}

          <li className="flex-1">
            <button
              type="button"
              onClick={onOpenMore}
              aria-label="Open navigation menu"
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-1.5 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Menu className="size-5 shrink-0" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
