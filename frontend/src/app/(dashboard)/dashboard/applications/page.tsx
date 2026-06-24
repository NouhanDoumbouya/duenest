"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ProductMetric, SegmentedControl } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api";
import {
  APPLICATION_TYPE_LABELS,
  applicationStatusTone,
  deadlineStateLabel,
  deadlineStateTone,
  getApplications,
  getApplicationSummary,
} from "@/lib/applications";
import { cn } from "@/lib/utils";
import type {
  ApplicationSummary,
  TrackedApplication,
} from "@/types/applications";

type ApplicationFilter =
  | "all"
  | "active"
  | "urgent"
  | "ready"
  | "submitted"
  | "completed"
  | "archived";

const FILTERS: { value: ApplicationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "urgent", label: "Urgent" },
  { value: "ready", label: "Ready" },
  { value: "submitted", label: "Submitted" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

/** Client-side predicate for a given filter over the active list. */
function matchesFilter(
  app: TrackedApplication,
  filter: ApplicationFilter,
): boolean {
  switch (filter) {
    case "urgent":
      return (
        app.deadline_state === "urgent" || app.deadline_state === "overdue"
      );
    case "ready":
      return app.status === "ready_to_submit";
    case "submitted":
      return (
        app.status === "submitted" ||
        app.status === "under_review" ||
        app.status === "interview"
      );
    case "completed":
      return (
        app.status === "accepted" ||
        app.status === "rejected" ||
        app.status === "withdrawn"
      );
    default:
      // "all" and "active" both show the full active (non-archived) list.
      return true;
  }
}

function ApplicationCard({ app }: { app: TrackedApplication }) {
  const firstAction = app.next_actions[0];

  return (
    <Link
      href={`/dashboard/applications/${app.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      {app.linked_pack ? (
        <ReadinessRing score={app.linked_pack.readiness_score} />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ClipboardList className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{app.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {APPLICATION_TYPE_LABELS[app.type]}
          {app.organization_name ? ` · ${app.organization_name}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge tone={applicationStatusTone(app.status)}>
            {app.status_label}
          </StatusBadge>
          {app.deadline_state !== "no_deadline" && (
            <StatusBadge tone={deadlineStateTone(app.deadline_state)}>
              {deadlineStateLabel(app.deadline_state, app.days_until_deadline)}
            </StatusBadge>
          )}
          {app.linked_pack && app.linked_pack.missing_count > 0 && (
            <span className="text-muted-foreground">
              {app.linked_pack.readiness_score}% ·{" "}
              {app.linked_pack.missing_count} missing
            </span>
          )}
          {app.priority === "high" && (
            <StatusBadge tone="warning">High priority</StatusBadge>
          )}
        </div>
        {firstAction && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            Next: {firstAction.label}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<
    TrackedApplication[] | null
  >(null);
  const [archived, setArchived] = useState<TrackedApplication[] | null>(null);
  const [summary, setSummary] = useState<ApplicationSummary | null>(null);
  const [filter, setFilter] = useState<ApplicationFilter>("active");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getApplications()
      .then((page) => {
        setApplications(page.items);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load applications.",
        ),
      );
    getApplicationSummary()
      .then((res) => setSummary(res))
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The archived list lives at a separate endpoint; fetch it lazily the first
  // time the user opens the Archived filter.
  useEffect(() => {
    if (filter !== "archived" || archived !== null) return;
    let active = true;
    getApplications({ archived: true })
      .then((page) => active && setArchived(page.items))
      .catch(() => active && setArchived([]));
    return () => {
      active = false;
    };
  }, [filter, archived]);

  const retry = useCallback(() => {
    setError(null);
    setApplications(null);
    setSummary(null);
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "archived") return archived ?? [];
    if (applications === null) return [];
    return applications.filter((app) => matchesFilter(app, filter));
  }, [filter, applications, archived]);

  const loading =
    filter === "archived" ? archived === null : applications === null;

  return (
    <PageContainer width="default">
      <PageHeader
        title="Applications"
        description="Track scholarships, visas, jobs, university applications, and renewals."
        actions={
          <Link
            href="/dashboard/applications/new"
            className={cn(buttonVariants())}
          >
            <Plus className="size-4" />
            Create application
          </Link>
        }
      />

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductMetric
            label="Active"
            value={summary.total_active}
            hint="Not archived"
          />
          <ProductMetric
            label="Urgent"
            value={summary.urgent}
            hint="Deadline soon or overdue"
            tone={summary.urgent > 0 ? "warn" : "default"}
          />
          <ProductMetric
            label="Ready to submit"
            value={summary.ready_to_submit}
            tone={summary.ready_to_submit > 0 ? "good" : "default"}
          />
          <ProductMetric
            label="Submitted"
            value={summary.submitted}
            tone="secure"
          />
        </div>
      )}

      <SegmentedControl
        label="Filter applications"
        value={filter}
        options={FILTERS}
        onChange={setFilter}
        className="max-w-full overflow-x-auto"
      />

      {error ? (
        <ErrorState description={error} onRetry={retry} />
      ) : loading ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-busy="true"
          aria-label="Loading applications"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : applications !== null && applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <ClipboardList className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Track your first application.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create an application from a pack or start from scratch.
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link
              href="/dashboard/applications/new"
              className={cn(buttonVariants())}
            >
              <Plus className="size-4" />
              Create application
            </Link>
            <Link
              href="/dashboard/bundles/new"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Create pack first
            </Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm font-medium">
            No applications in this view.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Try a different filter to see your other applications.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
