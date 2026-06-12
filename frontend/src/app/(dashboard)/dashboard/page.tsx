"use client";

// TODO: Add middleware/server-side route protection when auth cookies are implemented.
// For now this is client-side protection: we check the access token on mount,
// redirect to /login if missing, and verify it by fetching /users/me/.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAccessToken, getCurrentUser, logout } from "@/lib/auth";
import type { User } from "@/types/auth";

// Mock data — replaced by real API calls in a later milestone.
const stats = [
  { label: "Documents", value: 12, hint: "stored in your vault", icon: FileText },
  { label: "Renewals", value: 4, hint: "tracked this quarter", icon: RefreshCw },
  {
    label: "Subscriptions",
    value: 7,
    hint: "active subscriptions",
    icon: CreditCard,
  },
  {
    label: "Upcoming deadlines",
    value: 3,
    hint: "in the next 30 days",
    icon: CalendarClock,
  },
];

const upcomingDeadlines = [
  { name: "Passport renewal", due: "in 8 days", tone: "amber" as const },
  { name: "Car insurance", due: "in 21 days", tone: "default" as const },
  { name: "Domain registration", due: "in 28 days", tone: "default" as const },
];

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
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/40">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading your workspace…</span>
        </div>
      </div>
    );
  }

  const greetingName = user.first_name?.trim() || user.username;

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Here&apos;s a snapshot of your documents, renewals, and upcoming
            deadlines.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                  <CardDescription>{stat.label}</CardDescription>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">{stat.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Upcoming deadlines */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming deadlines</CardTitle>
            <CardDescription>
              The next dates you&apos;ll want to stay ahead of.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {upcomingDeadlines.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  <span className="font-medium">{item.name}</span>
                </div>
                <Badge
                  variant={item.tone === "amber" ? "default" : "secondary"}
                  className={
                    item.tone === "amber"
                      ? "bg-brand-amber text-brand-navy"
                      : undefined
                  }
                >
                  {item.due}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
