"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckSquare,
  FileText,
  Globe2,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MapPinned,
  MessageSquare,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAccessToken, logout } from "@/lib/auth";
import { getFounderMe } from "@/lib/founder";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Overview", href: "/founder", icon: LayoutDashboard, exact: true },
  { label: "Analytics", href: "/founder/analytics", icon: BarChart3 },
  { label: "Activation", href: "/founder/activation", icon: ListChecks },
  { label: "Feature Adoption", href: "/founder/adoption", icon: Activity },
  { label: "Feature Completion", href: "/founder/features", icon: CheckSquare },
  { label: "Feedback", href: "/founder/feedback", icon: MessageSquare },
  { label: "Errors", href: "/founder/errors", icon: AlertTriangle },
  { label: "Security", href: "/founder/security", icon: ShieldCheck },
  { label: "Templates", href: "/founder/templates", icon: FileText },
  { label: "Beta Users", href: "/founder/beta", icon: UserRoundCheck },
  { label: "Launch Readiness", href: "/founder/launch", icon: Globe2 },
  { label: "Global Map", href: "/founder/map", icon: MapPinned },
];

function FounderAccessState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
          {action}
        </CardContent>
      </Card>
    </div>
  );
}

function FounderNavLink({
  item,
  active,
}: {
  item: (typeof nav)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/15"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{item.label}</span>
    </Link>
  );
}

export function FounderShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }

    let active = true;
    getFounderMe()
      .then(() => active && setAllowed(true))
      .catch(() => active && setAllowed(false));
    return () => {
      active = false;
    };
  }, [router]);

  if (allowed === null) {
    return (
      <FounderAccessState
        title="Checking founder access"
        description="Verifying your staff permissions with the backend."
      />
    );
  }

  if (!allowed) {
    return (
      <FounderAccessState
        title="Founder access required"
        description="This console is restricted to founder and staff accounts. It does not expose private document contents or files."
        action={
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Return to dashboard
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo href="/founder" />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            Founder Console
          </p>
          <nav className="space-y-1">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <FounderNavLink key={item.href} item={item} active={active} />
              );
            })}
          </nav>
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Users className="size-4" />
            User dashboard
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Logo href="/founder" />
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground"
            >
              Dashboard
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

