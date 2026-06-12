"use client";

// TODO: Add middleware/server-side route protection when auth cookies are implemented.
// For now this is client-side protection: we check the access token on mount,
// redirect to /login if missing, and verify it by fetching /users/me/.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileText,
  FolderGit2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StatCard, type Stat } from "@/components/dashboard/stat-card";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAccessToken, getCurrentUser, logout } from "@/lib/auth";
import type { User } from "@/types/auth";

// A new account starts empty — these are the metrics the user will build up.
const stats: Stat[] = [
  { label: "Documents", value: 0, hint: "No documents yet", icon: FileText, tone: "blue" },
  { label: "Renewals", value: 0, hint: "Nothing tracked yet", icon: RefreshCw, tone: "teal" },
  {
    label: "Subscriptions",
    value: 0,
    hint: "Nothing tracked yet",
    icon: CreditCard,
    tone: "slate",
  },
  {
    label: "Upcoming deadlines",
    value: 0,
    hint: "None in the next 30 days",
    icon: CalendarClock,
    tone: "amber",
  },
];

const comingSoon = [
  {
    icon: FileText,
    title: "Document vault",
    description: "Store and organize documents with expiry tracking.",
  },
  {
    icon: RefreshCw,
    title: "Renewal tracker",
    description: "Track subscriptions, licenses, and recurring obligations.",
  },
  {
    icon: FolderGit2,
    title: "Application packs",
    description: "Bundle documents to reuse across applications.",
  },
  {
    icon: Sparkles,
    title: "AI document support",
    description: "Auto-extract dates and classify documents.",
  },
];

function DashboardSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/40">
      <LogoMark size="lg" className="animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No token at all → straight to login.
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }

    let active = true;
    getCurrentUser()
      .then((me) => {
        if (active) {
          setUser(me);
          setLoading(false);
        }
      })
      .catch(() => {
        // Token missing/expired/invalid → clear and bounce to login.
        if (active) {
          logout();
          router.replace("/login");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !user) {
    return <DashboardSkeleton />;
  }

  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.username;
  const greetingName = user.first_name?.trim() || user.username;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardShell user={{ name: fullName, email: user.email }}>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/* Welcome */}
        <div>
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">
            Welcome, {greetingName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            This is your DueNest workspace. Document and renewal tracking is
            rolling out next.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>

        {/* Get started + deadlines */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Empty-state primary action */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Get started</CardTitle>
              <CardDescription>
                Your workspace is ready. Document tools arrive in the next
                release.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <FileText className="size-6" />
                </span>
                <div>
                  <p className="font-medium">Add your first document</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    Soon you&apos;ll be able to store documents, set expiry
                    dates, and let DueNest watch your deadlines for you.
                  </p>
                </div>
                <Button disabled className="h-10" title="Coming soon">
                  <Plus className="size-4" />
                  Add document
                  <span className="text-xs font-normal text-primary-foreground/70">
                    (coming soon)
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming deadlines empty state */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upcoming deadlines</CardTitle>
              <CardDescription>The next dates to stay ahead of.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CalendarClock className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">
                  No deadlines yet. Once you add documents, upcoming expiries and
                  renewals will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Roadmap preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coming to DueNest</CardTitle>
            <CardDescription>
              A preview of the features rolling out to your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {comingSoon.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-lg border border-border/70 p-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-brand-teal">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Soon
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Quiet link back to product story */}
        <div className="flex items-center justify-center">
          <Link
            href="/#how"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See how DueNest works
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
