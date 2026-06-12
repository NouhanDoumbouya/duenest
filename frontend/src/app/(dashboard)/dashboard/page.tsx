import type { Metadata } from "next";
import {
  CalendarClock,
  CreditCard,
  FileText,
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

export const metadata: Metadata = {
  title: "Dashboard",
};

// TODO(auth): this route is currently open. Add protected-route handling
// (middleware redirect to /login when no valid token, plus a server-side
// session check) once token refresh + cookie storage are in place.

// Mock data — replaced by real API calls in a later milestone.
const stats = [
  {
    label: "Documents",
    value: 12,
    hint: "stored in your vault",
    icon: FileText,
  },
  {
    label: "Renewals",
    value: 4,
    hint: "tracked this quarter",
    icon: RefreshCw,
  },
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
  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Welcome back</h1>
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stat.hint}
                  </p>
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
