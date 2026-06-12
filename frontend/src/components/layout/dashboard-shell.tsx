"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, active: true },
  { label: "Documents", href: "#", icon: FileText, active: false },
  { label: "Renewals", href: "#", icon: RefreshCw, active: false },
  { label: "Subscriptions", href: "#", icon: CreditCard, active: false },
  { label: "Deadlines", href: "#", icon: CalendarClock, active: false },
];

/**
 * App chrome for authenticated pages: a fixed sidebar on desktop, a top bar on
 * mobile, with the page content rendered as children.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-dvh bg-muted/40">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-lg bg-brand-navy text-sm font-bold text-white"
          >
            <span className="text-brand-teal">D</span>
          </span>
          <span className="font-heading text-lg font-semibold">DueNest</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                  (item.active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <Button
            variant="ghost"
            size="lg"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <span className="font-heading text-lg font-semibold">DueNest</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
