"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  DoorClosed,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Inbox,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  QrCode,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { getFounderMe } from "@/lib/founder";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When set, the item is active only on an exact path match. */
  exact?: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

// Grouped, logically-ordered navigation. Only real, working routes appear here.
const navGroups: NavGroup[] = [
  {
    heading: "Workspace",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, exact: true },
      { label: "Documents", href: "/dashboard/documents", icon: FileText },
      { label: "File Inbox", href: "/dashboard/files", icon: Inbox },
      { label: "Attention", href: "/dashboard/attention", icon: ShieldAlert },
      { label: "Reminders", href: "/dashboard/reminders", icon: BellRing },
      { label: "Subscriptions", href: "/dashboard/subscriptions", icon: RefreshCw },
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
      { label: "Timeline", href: "/dashboard/timeline", icon: CalendarClock },
      { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
    ],
  },
  {
    heading: "Packs & sharing",
    items: [
      { label: "Bundles", href: "/dashboard/bundles", icon: Package },
      { label: "Quick Share", href: "/dashboard/quick-share", icon: QrCode },
      { label: "Shared with me", href: "/dashboard/shared-with-me", icon: Inbox },
      { label: "Secure rooms", href: "/dashboard/share-rooms", icon: DoorClosed },
      { label: "Emergency access", href: "/dashboard/emergency", icon: LifeBuoy },
      { label: "Trash", href: "/dashboard/trash", icon: Trash2 },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Trust & security", href: "/dashboard/trust", icon: ShieldCheck },
      { label: "Plan & usage", href: "/dashboard/settings/plan", icon: CreditCard },
      { label: "Data & privacy", href: "/dashboard/settings/data", icon: Settings },
      { label: "Feedback", href: "/dashboard/feedback", icon: MessageSquare },
    ],
  },
];

export interface ShellUser {
  name: string;
  email: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || name.slice(0, 2).toUpperCase();
}

function isItemActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-foreground/70" />
      )}
      <Icon
        className={cn(
          "size-4 transition-colors",
          active
            ? "text-accent-foreground"
            : "text-muted-foreground/80 group-hover:text-foreground",
        )}
      />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function NavLinks({
  hasFounderAccess,
  onNavigate,
}: {
  hasFounderAccess: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {navGroups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            {group.heading}
          </p>
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isItemActive(pathname, item)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}

      {hasFounderAccess && (
        <div className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            Founder
          </p>
          <NavLink
            item={{
              label: "Founder console",
              href: "/founder",
              icon: Wrench,
            }}
            active={pathname.startsWith("/founder")}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </nav>
  );
}

function UserFooter({
  user,
  onLogout,
}: {
  user?: ShellUser;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-border p-3">
      {user && (
        <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white ring-2 ring-brand-teal/20">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground hover:text-foreground"
        onClick={onLogout}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  );
}

/**
 * App chrome for authenticated pages: a fixed white command sidebar on desktop,
 * a top bar on mobile, with the page content rendered as children on a soft canvas.
 */
export function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user?: ShellUser;
}) {
  const router = useRouter();
  const [hasFounderAccess, setHasFounderAccess] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getFounderMe()
      .then(() => {
        if (active) setHasFounderAccess(true);
      })
      .catch(() => {
        if (active) setHasFounderAccess(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo href="/dashboard" />
        </div>

        <NavLinks hasFounderAccess={hasFounderAccess} />

        <UserFooter user={user} onLogout={handleLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="size-5" />
          </Button>
          <Logo href="/dashboard" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-border bg-sidebar shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo href="/dashboard" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <NavLinks
                hasFounderAccess={hasFounderAccess}
                onNavigate={() => setMobileNavOpen(false)}
              />

              <UserFooter user={user} onLogout={handleLogout} />
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
