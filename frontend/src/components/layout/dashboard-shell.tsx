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
import { Bell, CheckCheck, LogOut, Search, X } from "lucide-react";

import { BottomNav } from "@/components/layout/bottom-nav";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
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

export interface ShellUser {
  name: string;
  email: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || name.slice(0, 2).toUpperCase();
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
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.62rem] font-semibold leading-4 text-destructive-foreground ring-2 ring-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-floating">
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
  const [paletteOpen, setPaletteOpen] = useState(false);

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
      {/* Skip link: first focusable element, lets keyboard users jump past the
          sidebar/topbar straight to the page content. Hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-elevated focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        Skip to content
      </a>
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Logo href="/dashboard" />
        </div>

        <Suspense fallback={null}>
          <SidebarNav hasFounderAccess={hasFounderAccess} />
        </Suspense>

        <UserFooter user={user} onLogout={handleLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur md:flex">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.68rem] font-sans">
              ⌘K
            </kbd>
          </button>
          <NotificationBell />
        </header>

        {/* Mobile top bar. Navigation lives in the bottom nav (and its "More"
            drawer), so the top bar stays slim with just brand + utilities. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:hidden">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search className="size-4" />
            </Button>
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

              <Suspense fallback={null}>
                <SidebarNav
                  hasFounderAccess={hasFounderAccess}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </Suspense>

              <UserFooter user={user} onLogout={handleLogout} />
            </aside>
          </div>
        )}

        {/* Extra bottom padding on mobile leaves room for the fixed bottom nav. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 pt-4 pb-24 outline-none sm:px-6 sm:pt-6 md:pb-6 lg:px-10 lg:pt-10 lg:pb-10"
        >
          {children}
        </main>

        <BottomNav onOpenMore={() => setMobileNavOpen(true)} />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
