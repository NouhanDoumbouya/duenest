"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  FileWarning,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { StatCard, type Stat } from "@/components/dashboard/stat-card";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  daysUntil,
  formatDate,
  getDocuments,
  isExpiringSoon,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

export default function DashboardPage() {
  const user = useDashboardUser();
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDocuments()
      .then((page) => {
        if (!active) return;
        setDocuments(page.results);
        setTotal(page.count);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load your documents.",
        );
        setDocuments([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const greetingName = user.first_name?.trim() || user.username;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const docs = documents ?? [];
  const expiringSoon = docs.filter(isExpiringSoon).length;
  const renewalDue = docs.filter((d) => d.status === "renewal_due").length;
  const expired = docs.filter((d) => d.status === "expired").length;

  const stats: Stat[] = [
    { label: "Documents", value: total, hint: "in your vault", icon: FileText, tone: "blue" },
    {
      label: "Expiring soon",
      value: expiringSoon,
      hint: "within 30 days",
      icon: CalendarClock,
      tone: "amber",
    },
    {
      label: "Renewal due",
      value: renewalDue,
      hint: "need attention",
      icon: RefreshCw,
      tone: "teal",
    },
    {
      label: "Expired",
      value: expired,
      hint: "past their date",
      icon: TriangleAlert,
      tone: "slate",
    },
  ];

  const upcoming = docs
    .filter((d) => {
      const days = daysUntil(d.expiry_date);
      return days !== null && days >= 0;
    })
    .sort((a, b) => (daysUntil(a.expiry_date) ?? 0) - (daysUntil(b.expiry_date) ?? 0))
    .slice(0, 5);

  const loading = documents === null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* Welcome */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {today}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Here&apos;s what needs your attention across documents and deadlines.
          </p>
        </div>
        <Link
          href="/dashboard/documents/new"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          <Plus className="size-4" />
          Add document
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-[116px] animate-pulse" />
            ))
          : stats.map((stat) => <StatCard key={stat.label} stat={stat} />)}
      </div>

      {!loading && total === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="size-6" />
            </span>
            <div>
              <p className="font-medium">No documents yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add your passport, visa, license, insurance, or certificates so
                DueNest can help you stay ahead of renewals.
              </p>
            </div>
            <Link
              href="/dashboard/documents/new"
              className={cn(buttonVariants({ size: "lg" }), "h-10")}
            >
              <Plus className="size-4" />
              Add your first document
            </Link>
          </CardContent>
        </Card>
      ) : (
        !loading && (
          /* Upcoming deadlines */
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Upcoming deadlines</CardTitle>
                <CardDescription>
                  The next dates you&apos;ll want to stay ahead of.
                </CardDescription>
              </div>
              <Link
                href="/dashboard/documents"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <FileWarning className="size-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    No upcoming expiry dates. You&apos;re all caught up.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {upcoming.map((doc) => {
                    const days = daysUntil(doc.expiry_date);
                    return (
                      <li key={doc.id}>
                        <Link
                          href={`/dashboard/documents/${doc.id}/edit`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {doc.title}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                Expires {formatDate(doc.expiry_date)}
                                {days !== null && ` · in ${days} day${days === 1 ? "" : "s"}`}
                              </span>
                            </span>
                          </div>
                          <DocumentStatusBadge status={doc.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      )}

      <div className="flex items-center justify-center">
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Go to all documents
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
