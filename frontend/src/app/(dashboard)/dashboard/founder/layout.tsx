"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquare,
  Receipt,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getFounderMe } from "@/lib/founder";
import { cn } from "@/lib/utils";

const founderNav = [
  { label: "Overview", href: "/dashboard/founder", icon: LayoutDashboard },
  { label: "Activation", href: "/dashboard/founder/activation", icon: BarChart3 },
  { label: "Features", href: "/dashboard/founder/features", icon: Activity },
  { label: "Feedback", href: "/dashboard/founder/feedback", icon: MessageSquare },
  { label: "Templates", href: "/dashboard/founder/templates", icon: FileText },
  { label: "Billing", href: "/dashboard/founder/billing", icon: Receipt },
  { label: "Errors", href: "/dashboard/founder/errors", icon: AlertTriangle },
  { label: "Observability", href: "/dashboard/founder/observability", icon: Gauge },
  { label: "Security", href: "/dashboard/founder/security", icon: ShieldCheck },
  { label: "Users", href: "/dashboard/founder/users", icon: Users },
  { label: "Emails", href: "/dashboard/founder/emails", icon: Mail },
  { label: "Launch", href: "/dashboard/founder/launch", icon: Rocket },
];

function FounderLoader() {
  return (
    <div className="mx-auto flex min-h-[420px] w-full max-w-5xl items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <p className="font-medium">Checking founder access</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifying your staff permissions with the backend.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UnauthorizedState() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              Founder access required
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              This console is restricted to staff accounts. It intentionally
              keeps private document contents and vault data out of operational
              views.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Return to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function FounderTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-2 overflow-x-auto border-b border-border pb-3"
      aria-label="Founder Console"
    >
      {founderNav.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard/founder"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
              active
                ? "border-primary/20 bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
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

export default function FounderLayout({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getFounderMe()
      .then(() => {
        if (active) setAllowed(true);
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (allowed === null) return <FounderLoader />;
  if (!allowed) return <UnauthorizedState />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Private beta operations
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Founder Console
        </h1>
        <p className="mt-1.5 max-w-3xl text-muted-foreground">
          Operate CertaNest through aggregate metrics, feedback, templates,
          errors, security signals, and privacy-safe support metadata.
        </p>
      </div>
      <FounderTabs />
      {children}
    </div>
  );
}
