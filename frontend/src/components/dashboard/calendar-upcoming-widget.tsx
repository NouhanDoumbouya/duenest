"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  DoorClosed,
  FileText,
  Package,
  Share2,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCalendarEvents } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarUrgency,
} from "@/types/calendar";

const DAY_MS = 86_400_000;

const URGENCY_CLASS: Record<CalendarUrgency, string> = {
  overdue: "border-destructive/25 bg-destructive/10 text-destructive",
  critical: "border-destructive/25 bg-destructive/10 text-destructive",
  soon: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
  upcoming: "border-primary/20 bg-primary/10 text-primary",
  normal: "border-border bg-muted text-muted-foreground",
};

const CATEGORY_ICON: Record<CalendarCategory, LucideIcon> = {
  documents: FileText,
  reminders: BellRing,
  bundles: Package,
  appointments: CalendarDays,
  proofs: FileText,
  shares: Share2,
  rooms: DoorClosed,
  emergency: ShieldAlert,
};

const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  documents: "Document",
  reminders: "Reminder",
  bundles: "Bundle",
  appointments: "Appointment",
  proofs: "Proof",
  shares: "Shared link",
  rooms: "Secure room",
  emergency: "Emergency",
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function countdown(dateStr: string): string {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(dateStr));
  const days = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

export function CalendarUpcomingWidget() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let active = true;
    const start = startOfDay(new Date());
    const end = new Date(start.getTime() + 90 * DAY_MS);
    getCalendarEvents({ start: toDateKey(start), end: toDateKey(end) })
      .then((result) => {
        if (!active) return;
        const sorted = [...result.events]
          .filter((event) => {
            const date = startOfDay(new Date(event.date));
            return date >= start || event.urgency === "overdue";
          })
          .sort(
            (a, b) =>
              new Date(a.date).getTime() - new Date(b.date).getTime() ||
              a.title.localeCompare(b.title),
          )
          .slice(0, 5);
        setEvents(sorted);
      })
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <SectionCard
      title="Upcoming calendar"
      description="Owner-scoped dates that may need action soon."
      action={
        <Link
          href="/dashboard/calendar"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {events === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <CalendarDays className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No urgent dates coming up</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add expiry dates or reminders to make the calendar useful.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const Icon = CATEGORY_ICON[event.category];
            return (
              <li key={event.id}>
                <Link
                  href={event.linked_resource_url || "/dashboard/calendar"}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm transition-all duration-150 hover:border-primary/35 hover:bg-muted/30 motion-reduce:transition-none"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {event.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {CATEGORY_LABEL[event.category]} · {countdown(event.date)}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", URGENCY_CLASS[event.urgency])}
                  >
                    {countdown(event.date)}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
