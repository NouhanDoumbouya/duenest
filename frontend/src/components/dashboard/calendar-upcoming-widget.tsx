"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCalendarEvents } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarUrgency } from "@/types/calendar";

const URGENCY_CLASS: Record<CalendarUrgency, string> = {
  overdue: "text-destructive",
  critical: "text-destructive",
  soon: "text-amber-600",
  upcoming: "text-primary",
  normal: "text-muted-foreground",
};

function countdown(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Due today";
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

export function CalendarUpcomingWidget() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let active = true;
    getCalendarEvents()
      .then((result) => {
        if (!active) return;
        // Prioritise overdue + soonest upcoming.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sorted = [...result.events]
          .filter((e) => {
            const d = new Date(e.date);
            d.setHours(0, 0, 0, 0);
            return d >= today || e.urgency === "overdue";
          })
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
      title="Upcoming"
      action={
        <Link
          href="/dashboard/calendar"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open calendar
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {events === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          No urgent dates coming up.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={event.linked_resource_url || "/dashboard/calendar"}
                className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
              >
                <span className="min-w-0 truncate">{event.title}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    URGENCY_CLASS[event.urgency],
                  )}
                >
                  {countdown(event.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
