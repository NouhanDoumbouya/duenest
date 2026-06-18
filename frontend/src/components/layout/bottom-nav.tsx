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

// Side destinations — two flank the raised Scan action (Vault on the left,
// Planning + More on the right).
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

const scanActive = (p: string) => p.startsWith("/dashboard/scanner");

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
 * Scanning is the primary capture action in DueNest, so it is a raised, accented
 * button in the centre — clearly the main thing, and right under the thumb. The
 * other destinations flank it, with a "More" button that opens the full
 * navigation drawer (single source of navigation; no duplicate top hamburger).
 * Hidden from `md` up, where the desktop sidebar takes over.
 */
export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const onScan = scanActive(pathname);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {LEFT_ITEMS.map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}

        {/* Raised primary action: Scan. */}
        <li className="flex flex-1 justify-center">
          <Link
            href="/dashboard/scanner"
            aria-label="Scan a document"
            aria-current={onScan ? "page" : undefined}
            className="flex min-h-14 flex-col items-center justify-end gap-1 px-1 pb-1.5 focus-visible:outline-none"
          >
            <span
              className={cn(
                "-mt-5 flex size-12 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95",
                onScan && "ring-2 ring-primary/30",
              )}
            >
              <ScanLine className="size-6 shrink-0" aria-hidden />
            </span>
            <span
              className={cn(
                "text-[0.68rem] font-medium",
                onScan ? "text-primary" : "text-muted-foreground",
              )}
            >
              Scan
            </span>
          </Link>
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
  );
}
