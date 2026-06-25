"use client";

// Founder/admin observability console (Reliability & Observability V1). One page
// that answers: "if a beta user says something is broken, what failed, where,
// and did it touch documents/email/uploads/AI/jobs/portal?" — all from safe,
// aggregated, server-scrubbed data. Founder/staff only (gated by the founder
// layout). Never renders document contents, tokens, private URLs, or stack traces.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  Inbox,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import {
  getFounderObservability,
  resolveFounderOperationalEvent,
} from "@/lib/founder";
import type {
  ObservabilityOverview,
  OperationalEvent,
  SystemStatusComponent,
} from "@/types/founder";

const SEVERITY_VARIANT: Record<string, "destructive" | "outline" | "secondary"> = {
  critical: "destructive",
  error: "destructive",
  warning: "outline",
  info: "secondary",
};

const COMPONENT_LABELS: Record<string, string> = {
  database: "Database",
  cache: "Cache",
  storage: "Storage",
  email: "Email",
  ai: "AI",
  feature_flags: "Feature flags",
};

/** A component is "healthy" if its ok/configured/loaded signal is true. */
function componentOk(c: SystemStatusComponent): boolean {
  return Boolean(c.ok ?? c.configured ?? c.loaded);
}

function componentDetail(key: string, c: SystemStatusComponent): string {
  if (key === "storage" && c.backend) return c.backend;
  if (key === "email" && c.provider) return c.provider;
  if (key === "ai") return c.embeddings_configured ? "embeddings on" : "embeddings off";
  if (key === "feature_flags" && typeof c.count === "number") {
    return `${c.count} flags`;
  }
  return componentOk(c) ? "OK" : "Not configured";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function OverallBadge({ overall }: { overall: string }) {
  if (overall === "ok") {
    return (
      <Badge variant="secondary" className="bg-brand-success/15 text-brand-success">
        <CheckCircle2 className="size-3" /> All systems normal
      </Badge>
    );
  }
  if (overall === "down") {
    return (
      <Badge variant="destructive">
        <ShieldAlert className="size-3" /> Down
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-brand-amber/40 text-brand-amber">
      <AlarmClock className="size-3" /> Degraded
    </Badge>
  );
}

function EventRow({
  event,
  onResolve,
  resolving,
}: {
  event: OperationalEvent;
  onResolve?: (id: number) => void;
  resolving: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={SEVERITY_VARIANT[event.severity] ?? "outline"}>
            {event.severity}
          </Badge>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {event.category}
          </span>
          <span className="text-xs font-medium">{event.source}</span>
          {event.resolved && (
            <Badge variant="secondary" className="text-brand-success">
              resolved
            </Badge>
          )}
        </div>
        <p className="mt-1 truncate text-sm">
          {event.message || event.error_code || event.status}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>{formatTime(event.created_at)}</span>
          {event.error_code && <span>code: {event.error_code}</span>}
          {event.correlation_id && (
            <span>
              ref:{" "}
              <code className="rounded bg-muted px-1">{event.correlation_id}</code>
            </span>
          )}
        </p>
      </div>
      {onResolve && !event.resolved && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(event.id)}
          disabled={resolving}
          className="shrink-0"
        >
          {resolving ? <Loader2 className="size-4 animate-spin" /> : null}
          Mark resolved
        </Button>
      )}
    </li>
  );
}

function EventList({
  title,
  events,
  emptyLabel,
  onResolve,
  resolvingId,
}: {
  title: string;
  events: OperationalEvent[];
  emptyLabel: string;
  onResolve?: (id: number) => void;
  resolvingId: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onResolve={onResolve}
                resolving={resolvingId === event.id}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function FounderObservabilityPage() {
  const [data, setData] = useState<ObservabilityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getFounderObservability()
      .then((overview) => {
        if (active) {
          setData(overview);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load observability data.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleResolve = useCallback(async (id: number) => {
    setResolvingId(id);
    try {
      await resolveFounderOperationalEvent(id);
      setReloadKey((k) => k + 1);
    } finally {
      setResolvingId(null);
    }
  }, []);

  const components = useMemo(
    () =>
      data
        ? Object.entries(data.system_status.components).filter(
            ([key]) => key in COMPONENT_LABELS,
          )
        : [],
    [data],
  );

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Observability" description="Platform reliability at a glance." />
        <ErrorState description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Observability" description="Platform reliability at a glance." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  const status = data.system_status;
  const counts = status.counts;
  const emailToday = data.email_health?.today;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Observability"
        description="What needs attention, and whether documents, email, uploads, AI, or jobs are healthy. Aggregated, privacy-safe — no document contents."
        actions={<OverallBadge overall={status.overall} />}
      />

      {/* System status components */}
      <section aria-label="System status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {components.map(([key, component]) => {
          const ok = componentOk(component);
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{COMPONENT_LABELS[key]}</p>
                <p className="text-xs text-muted-foreground">
                  {componentDetail(key, component)}
                </p>
              </div>
              <span
                className={
                  ok
                    ? "inline-flex items-center gap-1 text-xs font-medium text-brand-success"
                    : "inline-flex items-center gap-1 text-xs font-medium text-brand-amber"
                }
              >
                <span
                  className={`size-2 rounded-full ${ok ? "bg-brand-success" : "bg-brand-amber"}`}
                  aria-hidden
                />
                {ok ? "Healthy" : "Check"}
              </span>
            </div>
          );
        })}
      </section>

      {/* Headline counts */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FounderStatCard
          label="Unresolved critical"
          value={counts.unresolved_critical_events}
          hint="Operational events needing action"
          icon={ShieldAlert}
          tone={counts.unresolved_critical_events ? "danger" : "good"}
        />
        <FounderStatCard
          label="Critical (24h)"
          value={counts.critical_events_24h}
          hint="New error/critical events today"
          icon={AlarmClock}
          tone={counts.critical_events_24h ? "warn" : "default"}
        />
        <FounderStatCard
          label="Unresolved app errors"
          value={counts.unresolved_app_errors}
          hint="From the error console"
          icon={Inbox}
          tone={counts.unresolved_app_errors ? "warn" : "default"}
        />
        <FounderStatCard
          label="Emails failed today"
          value={emailToday?.emails_failed ?? 0}
          hint={`${emailToday?.emails_sent ?? 0} sent · ${emailToday?.emails_skipped ?? 0} skipped`}
          icon={Inbox}
          tone={emailToday?.emails_failed ? "danger" : "good"}
        />
      </section>

      {/* AI health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden /> AI health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            {data.ai_health.configured ? "Configured" : "Not configured"}
            {" · "}
            embeddings {data.ai_health.embeddings_configured ? "on" : "off"}
          </span>
          <span>
            <span className="font-semibold text-brand-success">
              {data.ai_health.succeeded_24h}
            </span>{" "}
            ok (24h)
          </span>
          <span>
            <span className="font-semibold text-destructive">
              {data.ai_health.errored_24h}
            </span>{" "}
            errored
          </span>
          <span>
            <span className="font-semibold text-brand-amber">
              {data.ai_health.blocked_24h}
            </span>{" "}
            blocked
          </span>
        </CardContent>
      </Card>

      {/* Needs attention + category breakdowns */}
      <EventList
        title="Recent critical issues"
        events={data.recent_critical_events}
        emptyLabel="No critical operational events. Nicely quiet."
        onResolve={handleResolve}
        resolvingId={resolvingId}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <EventList
          title="Public link issues"
          events={data.public_link_issues}
          emptyLabel="No public-link failures recorded."
          onResolve={handleResolve}
          resolvingId={resolvingId}
        />
        <EventList
          title="Upload & storage issues"
          events={data.upload_storage_issues}
          emptyLabel="No upload/storage failures recorded."
          onResolve={handleResolve}
          resolvingId={resolvingId}
        />
      </div>

      {/* Scheduled jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {status.scheduled_jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No scheduled-job runs recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {status.scheduled_jobs.map((job, i) => (
                <li
                  key={`${job.job_name}-${i}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{job.job_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.finished_at ? formatTime(job.finished_at) : "—"}
                      {job.error ? ` · ${job.error}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      job.status === "succeeded"
                        ? "secondary"
                        : job.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {job.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
