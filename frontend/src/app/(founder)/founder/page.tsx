"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  FileText,
  FolderKanban,
  Link2,
  MailCheck,
  MessageSquare,
  Rocket,
  ShieldCheck,
  TicketCheck,
  UploadCloud,
  Users,
} from "lucide-react";

import {
  FounderActionCenter,
  type FounderActionItem,
} from "@/components/founder/action-center";
import {
  FounderBarList,
  FounderLineChart,
  FounderPageHeader,
  FounderStatCard,
  RangePicker,
} from "@/components/founder/founder-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFounderAnalytics, getFounderDashboard } from "@/lib/founder";
import type {
  FounderAnalytics,
  FounderDashboard,
  FounderRange,
} from "@/types/founder";

const nf = new Intl.NumberFormat();

export default function FounderOverviewPage() {
  const [range, setRange] = useState<FounderRange>("30d");
  const [dashboard, setDashboard] = useState<FounderDashboard | null>(null);
  const [analytics, setAnalytics] = useState<FounderAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getFounderDashboard({ range }),
      getFounderAnalytics({ range }),
    ])
      .then(([dashboardData, analyticsData]) => {
        if (!active) return;
        setDashboard(dashboardData);
        setAnalytics(analyticsData);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load founder overview.",
        );
      });
    return () => {
      active = false;
    };
  }, [range]);

  // Turn raw signals into a prioritized "what needs attention" list.
  const actionItems = useMemo<FounderActionItem[]>(() => {
    if (!dashboard) return [];
    const items: FounderActionItem[] = [];
    if (dashboard.open_error_items > 0) {
      items.push({
        id: "errors",
        tone: "danger",
        icon: AlertTriangle,
        title: `Resolve ${nf.format(dashboard.open_error_items)} open ${dashboard.open_error_items === 1 ? "error" : "errors"}`,
        subtitle: "Unresolved failure records",
        href: "/founder/errors",
      });
    }
    if (dashboard.security_events_in_range > 0) {
      items.push({
        id: "security",
        tone: "warn",
        icon: ShieldCheck,
        title: `Review ${nf.format(dashboard.security_events_in_range)} security ${dashboard.security_events_in_range === 1 ? "event" : "events"}`,
        subtitle: "Check for unusual behavior",
        href: "/founder/security",
      });
    }
    if (dashboard.open_feedback_items > 0) {
      items.push({
        id: "feedback",
        tone: "warn",
        icon: MessageSquare,
        title: `Review ${nf.format(dashboard.open_feedback_items)} unresolved feedback ${dashboard.open_feedback_items === 1 ? "item" : "items"}`,
        subtitle: "Decide what to act on next",
        href: "/founder/feedback",
      });
    }
    if (dashboard.pending_waitlist_entries > 0) {
      items.push({
        id: "waitlist",
        tone: "warn",
        icon: MailCheck,
        title: `${nf.format(dashboard.pending_waitlist_entries)} waitlist ${dashboard.pending_waitlist_entries === 1 ? "applicant" : "applicants"} awaiting review`,
        subtitle: "Decide who to invite next",
        href: "/founder/waitlist",
      });
    }
    if (dashboard.launch_readiness_percent < 80) {
      items.push({
        id: "launch",
        tone: "warn",
        icon: Rocket,
        title: `Launch readiness is ${dashboard.launch_readiness_percent}%`,
        subtitle: "Review what blocks launch",
        href: "/founder/launch",
      });
    }
    if (dashboard.feature_completion_percent < 100) {
      items.push({
        id: "features",
        tone: "neutral",
        icon: FolderKanban,
        title: `Feature completion is ${dashboard.feature_completion_percent}%`,
        subtitle: "Track launch maturity",
        href: "/founder/features",
      });
    }
    return items;
  }, [dashboard]);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!dashboard || !analytics) {
    return (
      <div className="space-y-6">
        <FounderPageHeader
          eyebrow="Founder Console"
          title="Overview"
          description="Loading product health, activation, feedback, launch, and security signals."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, index) => (
            <Card key={index} className="h-[132px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Founder Console"
        title="Overview"
        description="A private operating view for DueNest usage, activation, feedback, errors, security, beta readiness, and launch progress."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <FounderActionCenter items={actionItems} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FounderStatCard
          icon={Users}
          label="Total users"
          value={dashboard.total_users}
          hint={`${nf.format(dashboard.new_users_in_range)} new in range`}
        />
        <FounderStatCard
          icon={Users}
          label="Active users"
          value={dashboard.active_users_in_range}
          hint={`${nf.format(dashboard.active_users_today)} active today`}
          tone="good"
        />
        <FounderStatCard
          icon={FileText}
          label="Documents"
          value={dashboard.total_documents}
          hint={`${nf.format(dashboard.documents_created_7d)} created in 7 days`}
        />
        <FounderStatCard
          icon={UploadCloud}
          label="Files uploaded"
          value={dashboard.total_files_uploaded}
          hint={`${nf.format(dashboard.files_uploaded_7d)} uploaded in 7 days`}
        />
        <FounderStatCard
          icon={BellRing}
          label="Reminders"
          value={dashboard.total_reminders}
          hint={`${nf.format(dashboard.reminders_created_7d)} created in 7 days`}
        />
        <FounderStatCard
          icon={Link2}
          label="Share links"
          value={dashboard.total_share_links}
          hint={`${nf.format(dashboard.share_links_created_7d)} created in 7 days`}
        />
        <FounderStatCard
          icon={FolderKanban}
          label="Bundles"
          value={dashboard.total_bundles}
          hint={`${nf.format(dashboard.total_emergency_packs)} emergency packs`}
        />
        <FounderStatCard
          icon={MessageSquare}
          label="Unresolved feedback"
          value={dashboard.open_feedback_items}
          hint={`${nf.format(dashboard.total_feedback_items)} total feedback items`}
          tone={dashboard.open_feedback_items > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={AlertTriangle}
          label="Open errors"
          value={dashboard.open_error_items}
          hint="Unresolved failure records"
          tone={dashboard.open_error_items > 0 ? "danger" : "good"}
        />
        <FounderStatCard
          icon={ShieldCheck}
          label="Security events"
          value={dashboard.security_events_in_range}
          hint={`${nf.format(dashboard.security_events_count)} all time`}
          tone={dashboard.security_events_in_range > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={Users}
          label="Beta users"
          value={dashboard.beta_users}
          hint={`${nf.format(dashboard.active_beta_users)} accepted or active`}
        />
        <FounderStatCard
          icon={MailCheck}
          label="Waitlist"
          value={dashboard.total_waitlist_entries}
          hint={`${nf.format(dashboard.pending_waitlist_entries)} pending review`}
          tone={dashboard.pending_waitlist_entries > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={TicketCheck}
          label="Invite codes"
          value={dashboard.active_invite_codes}
          hint={`${dashboard.invite_conversion_percent}% invite conversion`}
          tone="good"
        />
        <FounderStatCard
          icon={Rocket}
          label="Launch readiness"
          value={`${dashboard.launch_readiness_percent}%`}
          hint={`${dashboard.feature_completion_percent}% feature completion`}
          tone={dashboard.launch_readiness_percent >= 80 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FounderLineChart
          title="User growth"
          description="New accounts over the selected period."
          data={analytics.series.user_growth}
        />
        <FounderLineChart
          title="Documents created"
          description="New document records, not document contents."
          data={analytics.series.documents_created}
          color="var(--chart-2)"
        />
        <FounderLineChart
          title="Files uploaded"
          description="Upload volume only. Filenames and file contents are excluded."
          data={analytics.series.files_uploaded}
          color="var(--chart-4)"
        />
        <FounderBarList
          title="Attention Needed breakdown"
          description="Computed document risk categories across the vault."
          items={analytics.attention_breakdown}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Jump to</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["/founder/analytics", "Open analytics"],
            ["/founder/waitlist", "Review waitlist"],
            ["/founder/invites", "Manage invites"],
            ["/founder/features", "Update feature completion"],
            ["/founder/feedback", "Review feedback"],
            ["/founder/launch", "Check launch readiness"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              {label}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
