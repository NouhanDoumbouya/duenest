"use client";

import Link from "next/link";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  FileClock,
  ListChecks,
  PackageCheck,
  RefreshCw,
} from "lucide-react";

import { formatDate, daysUntil } from "@/lib/documents";
import { TIMELINE_EVENT_LABELS } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelineUrgency,
} from "@/types/renewal-workspace";

const EVENT_ICONS: Record<TimelineEventType, typeof CalendarClock> = {
  document_expiry: FileClock,
  document_renewal: RefreshCw,
  reminder: BellRing,
  checklist_item_due: ListChecks,
  bundle_target_date: PackageCheck,
  bundle_requirement_due: AlertCircle,
};

const URGENCY_STYLES: Record<TimelineUrgency, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

function relativeLabel(date: string): string {
  const days = daysUntil(date);
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days}d`;
}

function eventHref(event: TimelineEvent): string | null {
  if (event.related_bundle) return `/dashboard/bundles/${event.related_bundle}`;
  if (event.related_document)
    return `/dashboard/documents/${event.related_document}`;
  return null;
}

export function TimelineList({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
        <CalendarClock className="mx-auto size-7 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nothing on the horizon</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When documents, reminders, checklists, or bundles have upcoming dates,
          they’ll appear here in order.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.event_type] ?? CalendarClock;
        const href = eventHref(event);
        const inner = (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                URGENCY_STYLES[event.urgency_level],
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {TIMELINE_EVENT_LABELS[event.event_type] ?? event.event_type}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium tabular-nums">
                {formatDate(event.date)}
              </p>
              <p
                className={cn(
                  "text-[11px] font-medium",
                  event.urgency_level === "critical"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {relativeLabel(event.date)}
              </p>
            </div>
          </div>
        );
        return (
          <li key={event.id}>
            {href ? <Link href={href}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}
