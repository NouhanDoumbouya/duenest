"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ChevronRight,
  Clock3,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import {
  STATUS_META,
  TimelineRail,
  TimelineSkeleton,
  deriveStatus,
  eventActionLabel,
  eventHref,
  relativeLabel,
} from "@/components/timeline/timeline-list";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import {
  DrawerBackdrop,
  DrawerPanel,
  InlineAlert,
  StatusDot,
} from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate, daysUntil } from "@/lib/documents";
import { TIMELINE_EVENT_LABELS, getTimeline } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  TimelineEvent,
  TimelineEventType,
} from "@/types/renewal-workspace";

const FILTERS: { value: TimelineEventType | "all"; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "document_expiry", label: TIMELINE_EVENT_LABELS.document_expiry },
  { value: "document_renewal", label: TIMELINE_EVENT_LABELS.document_renewal },
  { value: "reminder", label: TIMELINE_EVENT_LABELS.reminder },
  {
    value: "checklist_item_due",
    label: TIMELINE_EVENT_LABELS.checklist_item_due,
  },
  {
    value: "bundle_target_date",
    label: TIMELINE_EVENT_LABELS.bundle_target_date,
  },
  {
    value: "bundle_requirement_due",
    label: TIMELINE_EVENT_LABELS.bundle_requirement_due,
  },
];

const DAY_MS = 86_400_000;

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    let active = true;
    getTimeline(filter === "all" ? undefined : { event_type: filter })
      .then((res) => {
        if (!active) return;
        setEvents(res.items);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setEvents([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load the timeline.",
        );
      });
    return () => {
      active = false;
    };
  }, [filter]);

  const metrics = useMemo(() => {
    if (!events) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today.getTime() + 7 * DAY_MS);
    const monthEnd = new Date(today.getTime() + 30 * DAY_MS);

    let overdue = 0;
    let thisWeek = 0;
    let next30 = 0;
    let next: TimelineEvent | undefined;

    for (const event of events) {
      const d = new Date(event.date);
      d.setHours(0, 0, 0, 0);
      if (d < today) {
        overdue += 1;
        continue;
      }
      if (!next) next = event;
      if (d <= weekEnd) thisWeek += 1;
      if (d > today && d <= monthEnd) next30 += 1;
    }
    return { overdue, thisWeek, next30, total: events.length, next };
  }, [events]);

  const focus = useMemo(() => {
    if (!events || events.length === 0) return undefined;
    const urgent = events.find((event) => {
      const status = deriveStatus(event);
      return status === "overdue" || status === "critical";
    });
    return urgent ?? metrics?.next ?? events[0];
  }, [events, metrics]);

  return (
    <PageContainer width="full" className="space-y-6">
      <header className="rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Renewal workspace
              </p>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
                <ShieldCheck className="size-3" />
                Owner-scoped
              </span>
            </div>
            <h1 className="mt-3 text-page-title">Timeline</h1>
            <p className="mt-2 text-page-subtitle">
              Follow every upcoming expiry, renewal, reminder, and deadline as a
              single guided journey through time — newest dates first.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/dashboard/calendar"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <CalendarClock className="size-4" />
              Calendar view
            </Link>
            <Link
              href="/dashboard/documents"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Plus className="size-4" />
              Add document
            </Link>
          </div>
        </div>
      </header>

      {error && <InlineAlert>{error}</InlineAlert>}

      {metrics ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <TimelineMetric
            icon={ShieldAlert}
            label="Overdue"
            value={metrics.overdue}
            hint={metrics.overdue > 0 ? "Review past dates" : "No overdue dates"}
            tone={metrics.overdue > 0 ? "danger" : "good"}
            prominent={metrics.overdue > 0}
          />
          <TimelineMetric
            icon={Clock3}
            label="This week"
            value={metrics.thisWeek}
            hint={metrics.thisWeek > 0 ? "Plan the next few days" : "Calm week ahead"}
            tone={metrics.thisWeek > 0 ? "warn" : "secure"}
          />
          <TimelineMetric
            icon={CalendarClock}
            label="Next 30 days"
            value={metrics.next30}
            hint="Prepare ahead"
            tone="secure"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-3 shadow-card">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.value === filter) return;
                  setEvents(null);
                  setFilter(option.value);
                }}
                aria-pressed={filter === option.value}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  filter === option.value
                    ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {events === null ? (
            <TimelineSkeleton />
          ) : (
            <TimelineRail events={events} onSelect={setSelected} />
          )}
        </main>

        <TimelinePlanningRail
          metrics={metrics}
          focus={focus}
          loading={events === null}
          onOpenFocus={() => focus && setSelected(focus)}
        />
      </div>

      {selected && (
        <TimelineEventDrawer
          event={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </PageContainer>
  );
}

function TimelineMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  prominent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone: "default" | "good" | "warn" | "danger" | "secure";
  prominent?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/[0.045]"
      : tone === "warn"
        ? "border-brand-amber/30 bg-brand-amber/[0.045]"
        : tone === "good"
          ? "border-brand-success/25 bg-brand-success/[0.045]"
          : tone === "secure"
            ? "border-primary/20 bg-primary/[0.035]"
            : "border-border bg-card";
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-card",
        toneClass,
        prominent && "ring-1 ring-destructive/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <span className="text-2xl font-semibold leading-none">{value}</span>
            <span className="text-sm font-medium text-muted-foreground">
              · {hint}
            </span>
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card/70 text-foreground shadow-xs">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function TimelinePlanningRail({
  metrics,
  focus,
  loading,
  onOpenFocus,
}: {
  metrics: {
    overdue: number;
    thisWeek: number;
    next30: number;
    total: number;
    next?: TimelineEvent;
  } | null;
  focus?: TimelineEvent;
  loading: boolean;
  onOpenFocus: () => void;
}) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planning summary</CardTitle>
          <CardDescription>
            Your upcoming dates at a glance, in this view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics ? (
            <div className="grid grid-cols-2 gap-2">
              <SummaryStat label="Total" value={metrics.total} />
              <SummaryStat
                label="Overdue"
                value={metrics.overdue}
                tone={metrics.overdue > 0 ? "danger" : "good"}
              />
              <SummaryStat
                label="This week"
                value={metrics.thisWeek}
                tone={metrics.thisWeek > 0 ? "warn" : "secure"}
              />
              <SummaryStat label="Next 30 days" value={metrics.next30} tone="secure" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          )}

          {loading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : focus ? (
            <button
              type="button"
              onClick={onOpenFocus}
              className="w-full rounded-xl border border-primary/20 bg-primary/[0.035] p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                Next recommended review
              </p>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold">
                {focus.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {STATUS_META[deriveStatus(focus)].label} · {relativeLabel(focus.date)}
              </p>
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
              Nothing needs planning in this view yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Private to you</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The timeline only aggregates your own documents, reminders,
                checklists, and bundles — nothing is shared.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusDot tone="secure" label="Owner-scoped" />
            <StatusDot tone="good" label="Read-only view" />
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn" | "danger" | "secure";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warn" && "text-brand-amber",
          tone === "good" && "text-brand-success",
          tone === "secure" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function eventWhy(event: TimelineEvent): string {
  const days = daysUntil(event.date);
  if (days !== null && days < 0) {
    return "This date has already passed, so it should be reviewed before it becomes a missed renewal or expired document.";
  }
  switch (event.event_type) {
    case "document_expiry":
      return "An expiring document can affect travel, identity, insurance, or other important life-admin tasks.";
    case "document_renewal":
      return "Renewal dates give you a head start so a document never lapses before you act.";
    case "reminder":
      return "You asked DueNest to surface this reminder so the next step is not forgotten.";
    case "checklist_item_due":
      return "This checklist task has a due date and may block readiness if it slips.";
    case "bundle_target_date":
      return "This is the target date for an application or renewal pack you are preparing.";
    case "bundle_requirement_due":
      return "A requirement inside one of your bundles is due and may hold up the whole pack.";
    default:
      return "This date is on your timeline so you can plan the next action before it becomes urgent.";
  }
}

function recommendedAction(event: TimelineEvent): string {
  const days = daysUntil(event.date);
  if (days !== null && days < 0)
    return "Open the linked item and renew, update, or resolve it.";
  if (event.related_bundle)
    return "Open the pack and check any missing requirements.";
  if (event.related_document)
    return "Open the document to confirm the date and renewal status.";
  if (event.event_type === "reminder")
    return "Open reminders and confirm the next step.";
  return "Review this item and decide the next action.";
}

function TimelineEventDrawer({
  event,
  onClose,
}: {
  event: TimelineEvent;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const status = deriveStatus(event);
  const statusMeta = STATUS_META[status];
  const typeLabel = TIMELINE_EVENT_LABELS[event.event_type] ?? "Event";
  const href = eventHref(event);

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label={event.title} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {typeLabel}
            </p>
            <h2 className="mt-1 font-heading text-xl font-semibold leading-tight">
              {event.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className={statusMeta.chip}>
            {statusMeta.label}
          </Badge>
          <Badge variant="outline" className={cn("tabular-nums", statusMeta.chip)}>
            {relativeLabel(event.date)}
          </Badge>
        </div>

        {event.description && (
          <div className="mt-5 rounded-xl border border-border bg-muted/25 p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          </div>
        )}

        <dl className="mt-5 space-y-3 text-sm">
          <DetailRow label="Date" value={formatDate(event.date)} />
          <DetailRow label="When" value={relativeLabel(event.date)} />
          <DetailRow label="Type" value={typeLabel} />
        </dl>

        <section className="mt-6 space-y-3">
          <div>
            <p className="text-sm font-medium">Why it matters</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {eventWhy(event)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Next recommended action</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {recommendedAction(event)}
            </p>
          </div>
        </section>

        {href && (
          <div className="mt-6">
            <Link href={href} className={cn(buttonVariants(), "w-full")}>
              {eventActionLabel(event)}
              <ChevronRight className="size-4" />
            </Link>
          </div>
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
