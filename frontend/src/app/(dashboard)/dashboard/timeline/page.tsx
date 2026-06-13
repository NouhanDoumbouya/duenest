"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";

import { TimelineList } from "@/components/timeline/timeline-list";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
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

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");

  useEffect(() => {
    let active = true;
    getTimeline(filter === "all" ? undefined : { event_type: filter })
      .then((res) => active && setEvents(res.items))
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Renewal workspace
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Timeline
            </h1>
            <p className="text-sm text-muted-foreground">
              Every upcoming expiry, renewal, reminder, and deadline in one
              calm, ordered view.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setEvents(null);
              setFilter(option.value);
            }}
            className={cn(filter === option.value && "pointer-events-none")}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {events === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading timeline…</span>
        </div>
      ) : (
        <TimelineList events={events} />
      )}
    </div>
  );
}
