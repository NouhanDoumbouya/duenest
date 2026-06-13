"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Setup", href: "/dashboard/onboarding", icon: ListChecks },
  { label: "Documents", href: "/dashboard/documents", icon: FileText },
  { label: "Bundles", href: "/dashboard/bundles", icon: Package },
  { label: "Timeline", href: "/dashboard/timeline", icon: CalendarClock },
  { label: "Trust", href: "/dashboard/trust", icon: ShieldCheck },
  { label: "Data", href: "/dashboard/settings/data", icon: Settings },
  { label: "Subscriptions", href: "#", icon: CreditCard, soon: true },
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

function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      <p className="px-3 pb-2 pt-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground/70 uppercase">
        Workspace
      </p>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard"
            ? pathname === item.href
            : !item.soon && pathname.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-disabled={item.soon || undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              item.soon && "cursor-default hover:bg-transparent hover:text-muted-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-colors",
                active ? "text-accent-foreground" : "text-muted-foreground/80 group-hover:text-foreground",
              )}
            />
            <span className="flex-1">{item.label}</span>
            {item.soon && (
              <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNavLinks() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden"
      aria-label="Dashboard"
    >
      {navItems
        .filter((item) => !item.soon)
        .map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                active
                  ? "border-primary/20 bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
    </nav>
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

        <NavLinks />

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
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:hidden">
          <Logo href="/dashboard" />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </header>
        <MobileNavLinks />

        <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
