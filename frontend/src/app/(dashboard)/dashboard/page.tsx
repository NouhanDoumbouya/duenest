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
  ShieldAlert,
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
import { formatDate, getAttentionNeeded, getDocuments } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

interface DashboardSummary {
  total: number;
  needsAttention: number;
  expiringSoon: number;
  renewalDue: number;
  expired: number;
}

export default function DashboardPage() {
  const user = useDashboardUser();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [attention, setAttention] = useState<DocumentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocuments(),
      getDocuments({ computed_status: "expiring_soon" }),
      getDocuments({ computed_status: "renewal_due" }),
      getDocuments({ computed_status: "expired" }),
      getAttentionNeeded(),
    ])
      .then(([allDocs, expiringSoon, renewalDue, expired, attentionResult]) => {
        if (!active) return;
        setSummary({
          total: allDocs.count,
          needsAttention: attentionResult.count,
          expiringSoon: expiringSoon.count,
          renewalDue: renewalDue.count,
          expired: expired.count,
        });
        setAttention(attentionResult.items);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load your documents.",
        );
        setSummary({
          total: 0,
          needsAttention: 0,
          expiringSoon: 0,
          renewalDue: 0,
          expired: 0,
        });
        setAttention([]);
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

  const loading = summary === null || attention === null;
  const stats: Stat[] = summary
    ? [
        {
          label: "Documents",
          value: summary.total,
          hint: "in your vault",
          icon: FileText,
          tone: "blue",
        },
        {
          label: "Needs attention",
          value: summary.needsAttention,
          hint: "ranked by urgency",
          icon: ShieldAlert,
          tone: "amber",
        },
        {
          label: "Expiring soon",
          value: summary.expiringSoon,
          hint: "within 90 days",
          icon: CalendarClock,
          tone: "amber",
        },
        {
          label: "Renewal due",
          value: summary.renewalDue,
          hint: "ready to act on",
          icon: RefreshCw,
          tone: "teal",
        },
        {
          label: "Expired",
          value: summary.expired,
          hint: "past their date",
          icon: TriangleAlert,
          tone: "slate",
        },
      ]
    : [];
  const attentionItems = (attention ?? []).slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="h-[120px] animate-pulse" />
            ))
          : stats.map((stat) => (
              <Link
                key={stat.label}
                href={
                  stat.label === "Needs attention"
                    ? "/dashboard/documents?quick=needs_attention"
                    : "/dashboard/documents"
                }
                className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <StatCard stat={stat} />
              </Link>
            ))}
      </div>

      {!loading && summary?.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Your vault is ready
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                Your dashboard will come alive as you add documents, renewal
                dates, and important files. Start with your passport, a visa, or
                an insurance policy.
              </p>
            </div>
            <Link
              href="/dashboard/documents/new"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              <Plus className="size-4" />
              Add your first document
            </Link>
          </CardContent>
        </Card>
      ) : (
        !loading && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Needs attention</CardTitle>
                <CardDescription>
                  Documents that are expired, due, expiring soon, or missing
                  key tracking information.
                </CardDescription>
              </div>
              <Link
                href="/dashboard/documents?quick=needs_attention"
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {attentionItems.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-brand-success/10 text-brand-success">
                    <FileWarning className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      Nothing needs attention right now.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your tracked documents look calm and up to date.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {attentionItems.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/dashboard/documents/${doc.id}/edit`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {doc.title}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {doc.status_reason}
                              {doc.expiry_date
                                ? ` Expires ${formatDate(doc.expiry_date)}.`
                                : ""}
                            </span>
                          </span>
                        </div>
                        <DocumentStatusBadge status={doc.computed_status} />
                      </Link>
                    </li>
                  ))}
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
