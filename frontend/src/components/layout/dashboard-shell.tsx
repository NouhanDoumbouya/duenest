"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarClock,
  CheckCheck,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  RefreshCw,
  Settings,
  Share2,
  ShieldCheck,
  Vault,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { SectionTabs } from "@/components/layout/section-tabs";
import { useFeatures } from "@/components/features/feature-flags-provider";
import { FEATURE_BY_NAV_HREF } from "@/lib/features";
import { isSectionActive, type NavSection } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { getFounderMe } from "@/lib/founder";
import { logout } from "@/lib/auth";
import {
  formatNotificationTime,
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_SEVERITY_LABELS,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { NotificationRecord, NotificationSummary } from "@/types/notifications";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When set, the item is active only on an exact path match. */
  exact?: boolean;
  /**
   * When set, the item is a grouped section and stays active across all of that
   * section's child routes (e.g. "Vault" highlights on /dashboard/documents).
   */
  sectionKey?: NavSection["key"];
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

// Grouped, logically-ordered navigation. Only real, working routes appear here.
// Section items (Vault, Planning, Sharing) are conceptual homes; their child
// routes still work and are reached via the contextual sub-nav (SectionTabs).
const navGroups: NavGroup[] = [
  {
    heading: "Workspace",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, exact: true },
      { label: "Vault", href: "/dashboard/vault", icon: Vault, sectionKey: "vault" },
      {
        label: "Planning",
        href: "/dashboard/planning",
        icon: CalendarClock,
        sectionKey: "planning",
      },
      { label: "Subscriptions", href: "/dashboard/subscriptions", icon: RefreshCw },
      { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
    ],
  },
  {
    heading: "Prepare & share",
    items: [
      { label: "Bundles", href: "/dashboard/bundles", icon: Package },
      {
        label: "Sharing",
        href: "/dashboard/sharing",
        icon: Share2,
        sectionKey: "sharing",
      },
      { label: "Emergency access", href: "/dashboard/emergency", icon: LifeBuoy },
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
  if (item.sectionKey) return isSectionActive(pathname, item.sectionKey);
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
  const features = useFeatures();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {navGroups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            {group.heading}
          </p>
          {group.items
            .filter((item) => {
              const key = FEATURE_BY_NAV_HREF[item.href];
              if (!key) return true;
              const state = features[key];
              return state ? state.enabled : true;
            })
            .map((item) => (
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

function severityTone(notification: NotificationRecord): string {
  if (notification.severity === "urgent") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (notification.severity === "security") {
    return "border-brand-navy/25 bg-brand-navy/10 text-brand-navy";
  }
  if (notification.severity === "warning") {
    return "border-brand-amber/30 bg-brand-amber/10 text-brand-amber";
  }
  if (notification.severity === "success") {
    return "border-brand-success/25 bg-brand-success/10 text-brand-success";
  }
  return "border-border bg-muted text-muted-foreground";
}

function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    let active = true;
    getNotificationSummary()
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch(() => {
        if (active) setSummary({ unread_count: 0, urgent_count: 0, latest: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => refresh(), [refresh, pathname]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const unreadCount = summary?.unread_count ?? 0;
  const latest = summary?.latest ?? [];

  async function handleMarkAllRead() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      getNotificationSummary().then(setSummary).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenNotification(notification: NotificationRecord) {
    setBusy(true);
    try {
      if (notification.is_unread) {
        await markNotificationRead(notification.id);
      }
      getNotificationSummary().then(setSummary).catch(() => undefined);
      setOpen(false);
      router.push(
        notification.action_url?.startsWith("/")
          ? notification.action_url
          : "/dashboard/notifications",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.62rem] font-semibold leading-4 text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount === 0
                  ? "No unread notifications"
                  : `${unreadCount} unread`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={busy || unreadCount === 0}
            >
              <CheckCheck className="size-3.5" />
              Mark read
            </Button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {latest.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium">You’re all caught up</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  DueNest will notify you when tracked deadlines need attention.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {latest.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60"
                    onClick={() => handleOpenNotification(notification)}
                    disabled={busy}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-sm font-medium">
                        {notification.title}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium",
                          severityTone(notification),
                        )}
                      >
                        {NOTIFICATION_SEVERITY_LABELS[notification.severity]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-[0.68rem] font-medium text-muted-foreground">
                      {formatNotificationTime(notification.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3">
            <Link
              href="/dashboard/notifications"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Notification center
            </Link>
            <Link
              href="/dashboard/notifications/settings"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
          </div>
        </div>
      )}
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
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-border bg-card/80 px-6 backdrop-blur md:flex">
          <NotificationBell />
        </header>

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
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
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

        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          <Suspense fallback={null}>
            <SectionTabs />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
