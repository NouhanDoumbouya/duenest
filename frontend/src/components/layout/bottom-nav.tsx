"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  LayoutDashboard,
  Menu,
  ScanLine,
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

const ITEMS: BottomNavItem[] = [
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
  {
    label: "Scan",
    href: "/dashboard/scanner",
    icon: ScanLine,
    match: (p) => p.startsWith("/dashboard/scanner"),
  },
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

/**
 * App-like bottom navigation for mobile and installed PWA. Shows the primary
 * destinations within thumb reach and a "More" button that opens the full
 * navigation drawer, so there is a single source of navigation (no duplicate
 * top hamburger). Hidden from `md` up, where the desktop sidebar takes over.
 */
export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[0.68rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
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
  );
}
