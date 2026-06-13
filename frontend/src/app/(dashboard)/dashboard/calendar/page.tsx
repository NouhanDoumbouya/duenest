"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  DrawerBackdrop,
  DrawerPanel,
  InlineAlert,
  ProductMetric,
  SectionToolbar,
  SegmentedControl,
  TrustNotice,
} from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { downloadCalendarIcs, getCalendarEvents } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarUrgency,
} from "@/types/calendar";

type ViewMode = "month" | "upcoming";

const URGENCY_CLASS: Record<CalendarUrgency, string> = {
  overdue: "bg-destructive/10 text-destructive",
  critical: "bg-destructive/10 text-destructive",
  soon: "bg-amber-100 text-amber-700",
  upcoming: "bg-primary/10 text-primary",
  normal: "bg-muted text-muted-foreground",
};

const TYPE_LABEL: Record<string, string> = {
  document_expiry: "Expiry",
  renewal_due: "Renewal",
  last_safe_action: "Act by",
  reminder: "Reminder",
  bundle_deadline: "Bundle",
  appointment: "Appointment",
  proof_submission: "Proof",
  share_expiry: "Share",
  room_expiry: "Room",
  emergency_pack_expiry: "Emergency",
};

const FILTERS: { key: string; label: string; categories?: CalendarCategory[]; urgency?: CalendarUrgency }[] =
  [
    { key: "all", label: "All" },
    { key: "documents", label: "Documents", categories: ["documents"] },
    { key: "reminders", label: "Reminders", categories: ["reminders"] },
    { key: "bundles", label: "Bundles", categories: ["bundles"] },
    { key: "appointments", label: "Appointments", categories: ["appointments"] },
    { key: "proofs", label: "Proofs", categories: ["proofs"] },
    { key: "shares", label: "Shares/Rooms", categories: ["shares", "rooms"] },
    { key: "overdue", label: "Overdue", urgency: "overdue" },
  ];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countdownLabel(dateStr: string): string {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(dateStr));
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Due today";
  if (days < 0) return `Overdue by ${Math.abs(days)} day${days === -1 ? "" : "s"}`;
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("upcoming");
  const [filter, setFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    getCalendarEvents()
      .then((result) => active && setEvents(result.events))
      .catch((err) => {
        if (!active) return;
        setEvents([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load the calendar.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!events) return [];
    const active = FILTERS.find((f) => f.key === filter);
    return events.filter((event) => {
      if (active?.categories && !active.categories.includes(event.category)) {
        return false;
      }
      if (active?.urgency && event.urgency !== active.urgency) return false;
      return true;
    });
  }, [events, filter]);

  const health = useMemo(() => {
    if (!events) return "";
    const today = startOfDay(new Date());
    const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
    const overdue = events.filter((e) => new Date(e.date) < today).length;
    const thisWeek = events.filter((e) => {
      const d = startOfDay(new Date(e.date));
      return d >= today && d <= weekEnd;
    }).length;
    if (overdue > 0) {
      return `${overdue} overdue item${overdue === 1 ? "" : "s"} · ${thisWeek} date${thisWeek === 1 ? "" : "s"} this week`;
    }
    if (thisWeek > 0) {
      return `${thisWeek} important date${thisWeek === 1 ? "" : "s"} this week`;
    }
    return "No urgent dates this week";
  }, [events]);

  const metrics = useMemo(() => {
    if (!events) return null;
    const today = startOfDay(new Date());
    const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
    const overdue = events.filter((event) => new Date(event.date) < today).length;
    const thisWeek = events.filter((event) => {
      const d = startOfDay(new Date(event.date));
      return d >= today && d <= weekEnd;
    }).length;
    const documents = events.filter(
      (event) => event.category === "documents",
    ).length;
    const reminders = events.filter(
      (event) => event.category === "reminders",
    ).length;
    return { overdue, thisWeek, documents, reminders, total: events.length };
  }, [events]);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadCalendarIcs();
    } catch {
      setError("Could not export the calendar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Calendar"
        description="See document expiries, renewals, reminders, bundle deadlines, appointments, proofs, and secure sharing expiries in one owner-scoped planning view."
        actions={
          <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/documents"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Plus className="size-4" />
            Add document
          </Link>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export .ics
          </Button>
        </div>
        }
      />

      {metrics && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductMetric
            icon={ShieldAlert}
            label="Overdue"
            value={metrics.overdue}
            hint={metrics.overdue > 0 ? "Needs review" : "No overdue dates"}
            tone={metrics.overdue > 0 ? "danger" : "good"}
          />
          <ProductMetric
            icon={CalendarDays}
            label="This week"
            value={metrics.thisWeek}
            hint="Visible in upcoming view"
            tone={metrics.thisWeek > 0 ? "warn" : "secure"}
          />
          <ProductMetric
            icon={FileText}
            label="Document dates"
            value={metrics.documents}
            hint={`${metrics.total} total calendar events`}
            tone="secure"
          />
          <ProductMetric
            icon={BellRing}
            label="Reminders"
            value={metrics.reminders}
            hint="Owner-only reminders"
          />
        </div>
      )}

      {events && (
        <TrustNotice icon={ShieldCheck} title="Private calendar scope">
          {health}. Calendar events use safe summaries only and never include
          share tokens, access codes, or internal file paths.
        </TrustNotice>
      )}

      {error && <InlineAlert>{error}</InlineAlert>}

      <SectionToolbar className="items-start">
        <SegmentedControl
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "month", label: "Month" },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </SectionToolbar>

      {events === null ? (
        <CalendarSkeleton />
      ) : filtered.length === 0 ? (
        <CalendarEmptyState filtered={filter !== "all"} onClear={() => setFilter("all")} />
      ) : view === "month" ? (
        <div className="content-fade-in">
          <MonthView
            events={filtered}
            cursor={monthCursor}
            onCursor={setMonthCursor}
            onSelect={setSelected}
          />
        </div>
      ) : (
        <div className="content-fade-in">
          <UpcomingView events={filtered} onSelect={setSelected} />
        </div>
      )}

      {selected && (
        <EventDrawer event={selected} onClose={() => setSelected(null)} />
      )}
    </PageContainer>
  );
}

function MonthView({
  events,
  cursor,
  onCursor,
  onSelect,
}: {
  events: CalendarEvent[];
  cursor: Date;
  onCursor: (date: Date) => void;
  onSelect: (event: CalendarEvent) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = startOfDay(new Date()).toDateString();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = startOfDay(new Date(event.date)).toDateString();
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">
          {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          const key = date.toDateString();
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "min-h-[68px] rounded-lg border border-transparent p-1 text-left",
                isToday ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <button
                    key={event.id}
                    onClick={() => onSelect(event)}
                    className={cn(
                      "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium",
                      URGENCY_CLASS[event.urgency],
                    )}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <button
                    onClick={() => onSelect(dayEvents[2])}
                    className="text-[10px] text-muted-foreground"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingView({
  events,
  onSelect,
}: {
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const today = startOfDay(new Date());
  const groups: { label: string; events: CalendarEvent[] }[] = [
    { label: "Overdue", events: [] },
    { label: "Today", events: [] },
    { label: "This week", events: [] },
    { label: "Next 30 days", events: [] },
    { label: "Later", events: [] },
  ];
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const monthEnd = new Date(today.getTime() + 30 * 86_400_000);
  for (const event of events) {
    const d = startOfDay(new Date(event.date));
    if (d < today) groups[0].events.push(event);
    else if (d.getTime() === today.getTime()) groups[1].events.push(event);
    else if (d <= weekEnd) groups[2].events.push(event);
    else if (d <= monthEnd) groups[3].events.push(event);
    else groups[4].events.push(event);
  }

  return (
    <div className="space-y-5">
      {groups
        .filter((group) => group.events.length > 0)
        .map((group) => (
          <div key={group.label}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              {group.label}
            </h2>
            <ul className="space-y-2">
              {group.events.map((event) => (
                <li key={event.id}>
                  <button
                    onClick={() => onSelect(event)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{event.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {countdownLabel(event.date)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0", URGENCY_CLASS[event.urgency])}
                    >
                      {TYPE_LABEL[event.event_type] ?? event.event_type}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function EventDrawer({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label={event.title} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">{event.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className={URGENCY_CLASS[event.urgency]}>
            {event.urgency}
          </Badge>
          <Badge variant="secondary">
            {TYPE_LABEL[event.event_type] ?? event.event_type}
          </Badge>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{event.description}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="font-medium">
              {new Date(event.date).toLocaleDateString()}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">When</dt>
            <dd className="font-medium">{countdownLabel(event.date)}</dd>
          </div>
        </dl>
        {event.linked_resource_url && (
          <Link
            href={event.linked_resource_url}
            className={cn(buttonVariants(), "mt-5 w-full")}
          >
            Open {event.linked_resource_type || "resource"}
          </Link>
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function CalendarEmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
        <p className="text-sm font-medium">No events match this filter.</p>
        <Button variant="outline" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
      <CalendarDays className="mx-auto size-7 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">No calendar events yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Add expiry dates, reminders, bundle deadlines, appointments, or secure
        share expiries to make your calendar useful.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href="/dashboard/documents"
          className={cn(buttonVariants())}
        >
          Add document
        </Link>
        <Link
          href="/dashboard/reminders"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Set reminder
        </Link>
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
