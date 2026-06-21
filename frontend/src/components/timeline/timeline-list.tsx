"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BadgeCheck,
  BellRing,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  FileClock,
  ListChecks,
  PackageCheck,
  RefreshCw,
  Share2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, daysUntil } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type {
  TimelineEvent,
  TimelineUrgency,
} from "@/types/renewal-workspace";

// ---- Event-type presentation -----------------------------------------------
// Keyed by string (not the strict union) so that if the backend timeline feed
// later emits the richer calendar event types, they still get a sensible icon
// and label instead of falling back to a generic node.

const EVENT_META: Record<string, { label: string; icon: LucideIcon }> = {
  document_expiry: { label: "Document expiry", icon: FileClock },
  document_renewal: { label: "Document renewal", icon: RefreshCw },
  reminder: { label: "Reminder", icon: BellRing },
  checklist_item_due: { label: "Checklist task", icon: ListChecks },
  bundle_target_date: { label: "Bundle deadline", icon: PackageCheck },
  bundle_requirement_due: { label: "Bundle requirement", icon: BadgeCheck },
  subscription_renewal: { label: "Subscription renewal", icon: RefreshCw },
  subscription_cancellation_deadline: {
    label: "Cancellation deadline",
    icon: AlertCircle,
  },
  subscription_trial_ending: { label: "Trial ending", icon: RefreshCw },
  // Future-proofing for calendar-style events, should they ever appear here.
  share_expiry: { label: "Shared link", icon: Share2 },
  room_expiry: { label: "Secure room", icon: ShieldCheck },
  appointment: { label: "Appointment", icon: CalendarCheck },
  proof_submission: { label: "Proof", icon: BadgeCheck },
};

function eventMeta(event: TimelineEvent) {
  return EVENT_META[event.event_type] ?? { label: "Event", icon: CalendarClock };
}

// ---- Status (urgency-aware, time-aware) ------------------------------------

export type TimelineStatus =
  | "critical"
  | "overdue"
  | "soon"
  | "upcoming"
  | "planned";

export const STATUS_META: Record<
  TimelineStatus,
  {
    label: string;
    /** Marker node (icon container) styling. */
    marker: string;
    /** Card border + faint background wash. */
    row: string;
    /** Small badge styling for the status chip. */
    chip: string;
    /** Rail-segment / connector accent. */
    accent: string;
  }
> = {
  critical: {
    label: "Action needed",
    marker: "border-destructive/30 bg-destructive/10 text-destructive",
    row: "border-destructive/30 bg-destructive/[0.04]",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    accent: "bg-destructive/60",
  },
  overdue: {
    label: "Overdue",
    marker: "border-destructive/30 bg-destructive/10 text-destructive",
    row: "border-destructive/25 bg-destructive/[0.035]",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    accent: "bg-destructive/60",
  },
  soon: {
    label: "Soon",
    marker: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    row: "border-brand-amber/30 bg-brand-amber/[0.04]",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    accent: "bg-brand-amber/60",
  },
  upcoming: {
    label: "Upcoming",
    marker: "border-primary/25 bg-primary/10 text-primary",
    row: "border-border bg-card",
    chip: "border-primary/20 bg-primary/10 text-primary",
    accent: "bg-primary/50",
  },
  planned: {
    label: "Planned",
    marker: "border-border bg-muted text-muted-foreground",
    row: "border-border bg-card",
    chip: "border-border bg-muted text-muted-foreground",
    accent: "bg-border",
  },
};

export function deriveStatus(event: TimelineEvent): TimelineStatus {
  const days = daysUntil(event.date);
  const urgency: TimelineUrgency = event.urgency_level;
  if (days === null) return "planned";
  if (days < 0) return "overdue";
  if (urgency === "critical") return "critical";
  if (days <= 7 || urgency === "high") return "soon";
  if (days <= 30 || urgency === "medium") return "upcoming";
  return "planned";
}

// ---- Labels & links ---------------------------------------------------------

export function relativeLabel(date: string): string {
  const days = daysUntil(date);
  if (days === null) return "";
  if (days < 0)
    return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function eventHref(event: TimelineEvent): string | null {
  if (event.related_bundle) return `/dashboard/bundles/${event.related_bundle}`;
  if (event.related_document)
    return `/dashboard/documents/${event.related_document}`;
  if (event.related_subscription)
    return `/dashboard/subscriptions/${event.related_subscription}`;
  if (event.event_type === "reminder") return "/dashboard/reminders";
  return null;
}

export function eventActionLabel(event: TimelineEvent): string {
  if (event.related_bundle) return "Open pack";
  if (event.related_document) return "Open document";
  if (event.related_subscription) return "Open subscription";
  if (event.event_type === "reminder") return "Edit reminder";
  return "View details";
}

// ---- Time-period grouping ---------------------------------------------------

const DAY_MS = 86_400_000;

export interface TimelineGroup {
  key: string;
  label: string;
  hint: string;
  tone: TimelineStatus;
  events: TimelineEvent[];
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today.getTime() + 7 * DAY_MS);
  const monthEnd = new Date(today.getTime() + 30 * DAY_MS);

  const groups: TimelineGroup[] = [
    { key: "overdue", label: "Overdue", hint: "Past dates to review", tone: "overdue", events: [] },
    { key: "today", label: "Today", hint: "Needs attention now", tone: "soon", events: [] },
    { key: "week", label: "This week", hint: "The next seven days", tone: "soon", events: [] },
    { key: "month", label: "Next 30 days", hint: "Prepare ahead", tone: "upcoming", events: [] },
    { key: "later", label: "Later", hint: "Further down the road", tone: "planned", events: [] },
  ];

  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (const event of sorted) {
    const d = new Date(event.date);
    d.setHours(0, 0, 0, 0);
    if (d < today) groups[0].events.push(event);
    else if (d.getTime() === today.getTime()) groups[1].events.push(event);
    else if (d <= weekEnd) groups[2].events.push(event);
    else if (d <= monthEnd) groups[3].events.push(event);
    else groups[4].events.push(event);
  }

  return groups.filter((group) => group.events.length > 0);
}

// ---- The timeline rail ------------------------------------------------------

export function TimelineRail({
  events,
  onSelect,
}: {
  events: TimelineEvent[];
  /**
   * When provided, a row opens a detail drawer. When omitted (e.g. the bundle
   * detail tab) rows link directly to the underlying resource instead.
   */
  onSelect?: (event: TimelineEvent) => void;
}) {
  if (events.length === 0) {
    return <TimelineEmptyState />;
  }

  const groups = groupTimelineEvents(events);
  const hasOverdue = groups[0]?.key === "overdue";
  const todayLabel = formatDate(new Date().toISOString());

  // Precompute each group's stagger offset so markers + cards fade in in order
  // (each group contributes its milestone header + its events).
  const staggerStarts: number[] = [];
  groups.reduce((acc, group, index) => {
    staggerStarts[index] = acc;
    return acc + group.events.length + 1;
  }, 0);

  return (
    <div className="relative pl-1">
      {/* Vertical spine: a single subtle rail running through every event. */}
      <span
        aria-hidden
        className="absolute top-2 bottom-6 left-[1.25rem] w-px -translate-x-1/2 bg-gradient-to-b from-border via-border to-border/30 sm:left-[1.5rem]"
      />

      <div className="space-y-8">
        {groups.map((group, groupIndex) => {
          const stagger = staggerStarts[groupIndex];
          return (
            <div key={group.key}>
              <GroupMilestone group={group} index={stagger} />

              {/* A subtle "today" anchor sits between the past and the future. */}
              {group.key === "overdue" && hasOverdue && (
                <TodayMarker label={todayLabel} />
              )}

              <ul className="mt-2 space-y-3">
                {group.events.map((event, eventIndex) => (
                  <TimelineRow
                    key={event.id}
                    event={event}
                    index={stagger + eventIndex + 1}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function railFadeStyle(index: number): CSSProperties {
  // Cap the delay so long timelines never feel sluggish to reveal.
  return { animationDelay: `${Math.min(index, 8) * 45}ms` };
}

function GroupMilestone({
  group,
  index,
}: {
  group: TimelineGroup;
  index: number;
}) {
  return (
    <div
      className="content-fade-in grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4"
      style={railFadeStyle(index)}
    >
      <div className="flex justify-center">
        <span
          className={cn(
            "size-3.5 rounded-full ring-4 ring-background",
            STATUS_META[group.tone].accent,
          )}
        />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {group.label}
          </h2>
          <p className="text-xs text-muted-foreground">{group.hint}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {group.events.length}
        </span>
      </div>
    </div>
  );
}

function TodayMarker({ label }: { label: string }) {
  return (
    <div className="mt-3 grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4">
      <div className="flex justify-center">
        <span className="relative flex size-3 items-center justify-center">
          <span className="absolute inline-flex size-3 animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
          <span className="relative size-2.5 rounded-full bg-primary ring-4 ring-background" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
          Today · {label}
        </span>
        <span
          aria-hidden
          className="h-px flex-1 bg-[repeating-linear-gradient(to_right,var(--color-primary)_0,var(--color-primary)_4px,transparent_4px,transparent_8px)] opacity-25"
        />
      </div>
    </div>
  );
}

function TimelineRow({
  event,
  index,
  onSelect,
}: {
  event: TimelineEvent;
  index: number;
  onSelect?: (event: TimelineEvent) => void;
}) {
  const status = deriveStatus(event);
  const meta = eventMeta(event);
  const Icon = meta.icon;
  const statusMeta = STATUS_META[status];
  const href = eventHref(event);

  const cardClassName = cn(
    "block min-w-0 rounded-2xl border p-3.5 text-left shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none",
    statusMeta.row,
  );

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-3">
        <Badge
          variant="outline"
          className={cn("text-[0.8125rem] tabular-nums", statusMeta.chip)}
        >
          {relativeLabel(event.date)}
        </Badge>
        <Badge variant="outline" className={statusMeta.chip}>
          {statusMeta.label}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">
        {event.title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {meta.label} · Due {formatDate(event.date)}
      </p>
      {event.description && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">
          {event.description}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5">
        <span className="text-xs text-muted-foreground">
          {new Date(event.date).toLocaleDateString(undefined, {
            weekday: "short",
          })}
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary transition-transform group-hover/event:translate-x-0.5 motion-reduce:transform-none">
          {eventActionLabel(event)}
          <ChevronRight className="size-3.5" />
        </span>
      </div>
    </>
  );

  return (
    <li
      className="group/event content-fade-in grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4"
      style={railFadeStyle(index)}
    >
      {/* Rail marker: icon by type, ring color by status. */}
      <div className="relative flex justify-center pt-3.5">
        {/* Connector branch from the rail to the card. */}
        <span
          aria-hidden
          className={cn(
            "absolute top-[1.85rem] left-1/2 h-px w-1/2 transition-colors",
            "bg-border group-hover/event:bg-transparent",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-[1.85rem] left-1/2 h-px w-1/2 opacity-0 transition-opacity group-hover/event:opacity-100",
            statusMeta.accent,
          )}
        />
        <span
          className={cn(
            "z-10 flex size-9 items-center justify-center rounded-xl border ring-4 ring-background transition-all duration-200 ease-out group-hover/event:scale-105 motion-reduce:transform-none motion-reduce:transition-none",
            statusMeta.marker,
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>

      {/* Milestone card. Opens a drawer when onSelect is wired, otherwise
          links straight to the underlying resource. */}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(event)}
          className={cardClassName}
        >
          {cardBody}
        </button>
      ) : href ? (
        <Link href={href} className={cardClassName}>
          {cardBody}
        </Link>
      ) : (
        <div className={cn(cardClassName, "cursor-default")}>{cardBody}</div>
      )}
    </li>
  );
}

function TimelineEmptyState() {
  return (
    <div className="relative pl-1">
      <span
        aria-hidden
        className="absolute top-2 bottom-10 left-[1.25rem] w-px -translate-x-1/2 bg-gradient-to-b from-border to-transparent sm:left-[1.5rem]"
      />
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4">
        <div className="flex justify-center pt-1">
          <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground ring-4 ring-background">
            <CalendarClock className="size-4" />
          </span>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6">
          <p className="text-sm font-medium">Nothing on the horizon</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            When documents, reminders, checklists, or bundles have upcoming
            dates, they’ll appear along this timeline in the order they arrive.
          </p>
          <Link
            href="/dashboard/documents/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
          >
            Add a document
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="relative pl-1">
      <span
        aria-hidden
        className="absolute top-2 bottom-6 left-[1.25rem] w-px -translate-x-1/2 bg-border sm:left-[1.5rem]"
      />
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4"
          >
            <div className="flex justify-center pt-3.5">
              <Skeleton className="size-9 rounded-xl ring-4 ring-background" />
            </div>
            <Skeleton className="h-[6.5rem] rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Backwards-compatible alias retained for any external imports.
export { TimelineRail as TimelineList };
