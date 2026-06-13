"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  MessageSquare,
  RefreshCw,
  Share2,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFounderDashboard } from "@/lib/founder";
import type { FounderDashboard } from "@/types/founder";

const nf = new Intl.NumberFormat();

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tracking-tight">{nf.format(value)}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function FounderOverviewPage() {
  const [data, setData] = useState<FounderDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderDashboard()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load founder dashboard.",
        );
        setData(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="h-[132px] animate-pulse" />
        ))}
      </div>
    );
  }

  const quickLinks = [
    {
      href: "/dashboard/founder/feedback",
      label: "Review feedback",
      value: data.open_feedback_items,
      icon: MessageSquare,
    },
    {
      href: "/dashboard/founder/errors",
      label: "Triage errors",
      value: data.open_error_items,
      icon: AlertTriangle,
    },
    {
      href: "/dashboard/founder/templates",
      label: "Manage templates",
      value: data.total_checklists,
      icon: FileText,
    },
    {
      href: "/dashboard/founder/security",
      label: "Check security",
      value: data.total_share_links,
      icon: Share2,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total users"
          value={data.total_users}
          hint={`${nf.format(data.new_users_7d)} joined in 7 days`}
        />
        <MetricCard
          label="Active users"
          value={data.active_users_7d}
          hint={`${nf.format(data.active_users_30d)} active in 30 days`}
        />
        <MetricCard
          label="Documents"
          value={data.total_documents}
          hint={`${nf.format(data.documents_created_7d)} created in 7 days`}
        />
        <MetricCard
          label="Files uploaded"
          value={data.total_files_uploaded}
          hint={`${nf.format(data.files_uploaded_7d)} uploaded in 7 days`}
        />
        <MetricCard
          label="Reminders"
          value={data.total_reminders}
          hint={`${nf.format(data.reminders_created_7d)} created in 7 days`}
        />
        <MetricCard
          label="Share links"
          value={data.total_share_links}
          hint={`${nf.format(data.share_links_created_7d)} created in 7 days`}
        />
        <MetricCard
          label="Needs attention"
          value={data.total_attention_needed_items}
          hint="computed from document health"
        />
        <MetricCard
          label="Feedback"
          value={data.total_feedback_items}
          hint={`${nf.format(data.open_feedback_items)} open items`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent activity summary</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_activity_summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Product events will appear here as users interact with DueNest.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recent_activity_summary.map((item) => (
                  <li
                    key={item.event_type}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Last seen {new Date(item.last_seen_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {nf.format(item.count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Founder actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {nf.format(item.value)} related records
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Privacy-safe operations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Founder metrics are aggregate-first and support views avoid
                document titles, filenames, raw OCR text, notes, access codes,
                share tokens, physical locations, and internal file paths.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/founder/activation"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            View activation funnel
            <RefreshCw className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
