"use client";

// Founder/admin Scheduled Jobs console (Scheduled Jobs & Background Operations
// V1). Shows every registered cron-style job, when it last ran, its health
// (healthy / stale / failing / never-run / disabled), and safe manual actions.
// Founder/staff only (gated by the founder layout). Destructive jobs offer a
// dry-run only; AI jobs are observe-only (the dashboard never triggers AI).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  ShieldAlert,
} from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import {
  dryRunFounderJob,
  getFounderJobs,
  getFounderJobsSummary,
  runFounderJob,
} from "@/lib/founder";
import type {
  ScheduledJob,
  ScheduledJobRun,
  ScheduledJobRunResult,
  ScheduledJobsSummary,
} from "@/types/founder";

const HEALTH_BADGE: Record<
  string,
  { variant: "secondary" | "destructive" | "outline"; label: string; className?: string }
> = {
  healthy: {
    variant: "secondary",
    label: "Healthy",
    className: "bg-brand-success/15 text-brand-success",
  },
  stale: { variant: "outline", label: "Stale", className: "border-brand-amber/40 text-brand-amber" },
  failing: { variant: "destructive", label: "Failing" },
  never_run: { variant: "outline", label: "Never run" },
  disabled: { variant: "secondary", label: "Disabled" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function describeResult(result: ScheduledJobRunResult): string {
  if (result.reason === "already_running") return "Skipped — already running.";
  if (result.dry_run) {
    return `Dry run: would affect ${result.attempted ?? 0} item(s).`;
  }
  const parts: string[] = [];
  if (typeof result.succeeded === "number") parts.push(`${result.succeeded} ok`);
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  return `Done${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
}

function JobCard({
  job,
  onRun,
  onDryRun,
  busy,
  message,
}: {
  job: ScheduledJob;
  onRun: (job: ScheduledJob) => void;
  onDryRun: (job: ScheduledJob) => void;
  busy: boolean;
  message?: string;
}) {
  const badge = HEALTH_BADGE[job.health] ?? HEALTH_BADGE.never_run;
  const lastRun: ScheduledJobRun | null = job.last_run;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{job.display_name}</h3>
            <Badge variant={badge.variant} className={badge.className}>
              {badge.label}
            </Badge>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {job.category}
            </span>
            {job.is_destructive && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                Destructive
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{job.description}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {job.expected_frequency}
            </span>
            <span>
              Last run: {lastRun ? `${lastRun.status} · ${formatTime(lastRun.finished_at)}` : "never"}
            </span>
            {lastRun && lastRun.attempted_count > 0 && (
              <span>
                {lastRun.success_count} ok
                {lastRun.failed_count ? `, ${lastRun.failed_count} failed` : ""}
              </span>
            )}
          </p>
          {message && (
            <p className="mt-2 text-xs font-medium text-primary" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2">
            {job.supports_dry_run && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDryRun(job)}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Dry run
              </Button>
            )}
            {job.is_manual_run_allowed && !job.is_destructive && (
              <Button size="sm" onClick={() => onRun(job)} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlayCircle className="size-4" />
                )}
                Run now
              </Button>
            )}
          </div>
          {(job.category === "email" || job.category === "notifications") &&
            job.is_manual_run_allowed && (
              <span className="text-[11px] text-muted-foreground">
                Idempotent — won&apos;t double-send
              </span>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FounderJobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[] | null>(null);
  const [summary, setSummary] = useState<ScheduledJobsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([getFounderJobs(), getFounderJobsSummary()])
      .then(([jobsResp, summaryResp]) => {
        if (active) {
          setJobs(jobsResp.jobs);
          setSummary(summaryResp);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : "Could not load scheduled jobs.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const runJob = useCallback(
    async (job: ScheduledJob) => {
      const note =
        job.category === "email" || job.category === "notifications"
          ? " It is idempotent, so it will not send duplicate emails."
          : "";
      if (!window.confirm(`Run "${job.display_name}" now?${note}`)) return;
      setBusyJob(job.job_name);
      try {
        const result = await runFounderJob(job.job_name);
        setMessages((m) => ({ ...m, [job.job_name]: describeResult(result) }));
        reload();
      } catch (err) {
        setMessages((m) => ({
          ...m,
          [job.job_name]: err instanceof ApiError ? err.message : "Run failed.",
        }));
      } finally {
        setBusyJob(null);
      }
    },
    [reload],
  );

  const dryRunJob = useCallback(async (job: ScheduledJob) => {
    setBusyJob(job.job_name);
    try {
      const result = await dryRunFounderJob(job.job_name);
      setMessages((m) => ({ ...m, [job.job_name]: describeResult(result) }));
    } catch (err) {
      setMessages((m) => ({
        ...m,
        [job.job_name]: err instanceof ApiError ? err.message : "Dry run failed.",
      }));
    } finally {
      setBusyJob(null);
    }
  }, []);

  const attention = useMemo(
    () =>
      summary
        ? summary.scheduled_jobs_failing + summary.scheduled_jobs_stale
        : 0,
    [summary],
  );

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Scheduled jobs" description="Background operations health." />
        <ErrorState description={error} onRetry={reload} />
      </div>
    );
  }

  if (!jobs || !summary) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Scheduled jobs" description="Background operations health." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Scheduled jobs"
        description="Which background jobs exist, when they last ran, and whether they're healthy. Manual runs are idempotent; destructive jobs offer dry-run only."
        actions={
          attention > 0 ? (
            <Badge variant="outline" className="border-brand-amber/40 text-brand-amber">
              <AlarmClock className="size-3" /> {attention} need attention
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-brand-success/15 text-brand-success">
              <CheckCircle2 className="size-3" /> All healthy
            </Badge>
          )
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FounderStatCard
          label="Total jobs"
          value={summary.scheduled_jobs_total}
          hint="Registered background jobs"
          icon={Clock}
          tone="default"
        />
        <FounderStatCard
          label="Failing"
          value={summary.scheduled_jobs_failing}
          hint={summary.last_failed_job ? `Last: ${summary.last_failed_job}` : "Last runs OK"}
          icon={ShieldAlert}
          tone={summary.scheduled_jobs_failing ? "danger" : "good"}
        />
        <FounderStatCard
          label="Stale"
          value={summary.scheduled_jobs_stale}
          hint="Overdue vs expected cadence"
          icon={AlarmClock}
          tone={summary.scheduled_jobs_stale ? "warn" : "good"}
        />
        <FounderStatCard
          label="Never run"
          value={summary.scheduled_jobs_never_run}
          hint="No recorded runs yet"
          icon={Clock}
          tone={summary.scheduled_jobs_never_run ? "warn" : "default"}
        />
      </section>

      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard
            key={job.job_name}
            job={job}
            onRun={runJob}
            onDryRun={dryRunJob}
            busy={busyJob === job.job_name}
            message={messages[job.job_name]}
          />
        ))}
      </div>
    </div>
  );
}
