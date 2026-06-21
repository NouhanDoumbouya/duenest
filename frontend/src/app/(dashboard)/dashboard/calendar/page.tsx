"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BellRing,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorClosed,
  Download,
  FileText,
  LifeBuoy,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/ui/page-container";
import {
  DrawerBackdrop,
  DrawerPanel,
  InlineAlert,
  SegmentedControl,
  StatusDot,
} from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { downloadCalendarIcs, getCalendarEvents } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarUrgency,
} from "@/types/calendar";

type ViewMode = "upcoming" | "month";
type DrawerState =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "day"; dateKey: string; events: CalendarEvent[] }
  | null;

const DAY_MS = 86_400_000;

const TYPE_LABEL: Record<string, string> = {
  document_expiry: "Expiry",
  renewal_due: "Renewal",
  last_safe_action: "Act by",
  reminder: "Reminder",
  bundle_deadline: "Bundle",
  appointment: "Appointment",
  proof_submission: "Proof",
  share_expiry: "Shared link",
  room_expiry: "Secure room",
  emergency_pack_expiry: "Emergency",
  subscription_renewal: "Subscription",
  subscription_cancellation_deadline: "Cancel by",
  subscription_trial_ending: "Trial ends",
};

const CATEGORY_META: Record<
  CalendarCategory,
  { label: string; icon: LucideIcon; chip: string; dot: string }
> = {
  documents: {
    label: "Document",
    icon: FileText,
    chip: "border-primary/20 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  reminders: {
    label: "Reminder",
    icon: BellRing,
    chip: "border-brand-teal/25 bg-brand-mint/60 text-brand-teal",
    dot: "bg-brand-teal",
  },
  bundles: {
    label: "Pack",
    icon: Package,
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    dot: "bg-brand-amber",
  },
  appointments: {
    label: "Appointment",
    icon: CalendarCheck,
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  proofs: {
    label: "Proof",
    icon: BadgeCheck,
    chip: "border-brand-success/25 bg-brand-success/10 text-brand-success",
    dot: "bg-brand-success",
  },
  shares: {
    label: "Shared link",
    icon: Share2,
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  rooms: {
    label: "Secure room",
    icon: DoorClosed,
    chip: "border-teal-200 bg-teal-50 text-teal-700",
    dot: "bg-teal-500",
  },
  emergency: {
    label: "Emergency",
    icon: LifeBuoy,
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  subscriptions: {
    label: "Subscription",
    icon: RefreshCw,
    chip: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
  },
};

const URGENCY_META: Record<
  CalendarUrgency,
  { label: string; chip: string; row: string; tone: "default" | "good" | "warn" | "danger" | "secure" }
> = {
  overdue: {
    label: "Overdue",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    row: "border-destructive/30 bg-destructive/[0.04]",
    tone: "danger",
  },
  critical: {
    label: "Critical",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    row: "border-destructive/25 bg-destructive/[0.035]",
    tone: "danger",
  },
  soon: {
    label: "Soon",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
    row: "border-brand-amber/30 bg-brand-amber/[0.04]",
    tone: "warn",
  },
  upcoming: {
    label: "Upcoming",
    chip: "border-primary/20 bg-primary/10 text-primary",
    row: "border-border bg-card",
    tone: "secure",
  },
  normal: {
    label: "Planned",
    chip: "border-border bg-muted text-muted-foreground",
    row: "border-border bg-card",
    tone: "default",
  },
};

const FILTERS: {
  key: string;
  label: string;
  categories?: CalendarCategory[];
  urgency?: CalendarUrgency;
}[] = [
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

function toDateKey(date: Date | string): string {
  const d = startOfDay(typeof date === "string" ? new Date(date) : date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatDateKey(dateKey: string, style: "short" | "long" = "short") {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    month: style === "long" ? "long" : "short",
    day: "numeric",
    ...(style === "long" ? { weekday: "long" } : {}),
  });
}

function countdownLabel(dateStr: string): string {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(dateStr));
  const days = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "Expires today";
  if (days < 0) return `Overdue by ${Math.abs(days)} day${days === -1 ? "" : "s"}`;
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function agendaLabel(dateStr: string): string {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(dateStr));
  const days = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days < 30) return `${days}d`;
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function calendarRange(cursor: Date) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth() - 2, 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 7, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

function eventActionLabel(event: CalendarEvent): string {
  if (event.event_type === "reminder") return "Edit reminder";
  if (event.category === "documents") return "Open document";
  if (event.category === "bundles") return "Open bundle";
  if (event.category === "rooms") return "Open room";
  if (event.category === "shares") return "Open share";
  if (event.category === "appointments") return "Open appointment";
  return "Open item";
}

function eventWhy(event: CalendarEvent): string {
  if (event.urgency === "overdue") {
    return "This date has passed, so it should be reviewed before it becomes a missed renewal or expired proof.";
  }
  if (event.event_type === "room_expiry") {
    return "This secure room will stop being available to the recipient when it expires.";
  }
  if (event.event_type === "share_expiry") {
    return "This shared link has a time limit, so recipients may lose access soon.";
  }
  if (event.category === "bundles") {
    return "This date affects an application or renewal pack and may block readiness.";
  }
  if (event.category === "documents") {
    return "This document date can affect travel, identity, insurance, or other important life-admin tasks.";
  }
  return "This calendar item is included so you can plan the next action before it becomes urgent.";
}

function recommendedAction(event: CalendarEvent): string {
  if (event.urgency === "overdue") return "Open the linked item and update, renew, or resolve it.";
  if (event.event_type === "reminder") return "Open the reminder and confirm the next step.";
  if (event.category === "bundles") return "Open the bundle and check missing requirements.";
  if (event.category === "rooms" || event.category === "shares") {
    return "Review whether access should be extended, revoked, or left to expire.";
  }
  return "Open the linked item and confirm the date, file, or renewal status.";
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<ViewMode>("upcoming");
  const [filter, setFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const range = useMemo(() => calendarRange(monthCursor), [monthCursor]);

  useEffect(() => {
    let active = true;
    getCalendarEvents(range)
      .then((result) => {
        if (!active) return;
        setEvents(sortEvents(result.events));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load the calendar.",
        );
      });
    return () => {
      active = false;
    };
  }, [range, reloadKey]);

  // Retry re-runs the load effect (bumping the key) while keeping its
  // range-change cancellation guard intact.
  const retry = () => {
    setError(null);
    setEvents(null);
    setReloadKey((k) => k + 1);
  };

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

  const metrics = useMemo(() => {
    if (!events) return null;
    const today = startOfDay(new Date());
    const weekEnd = new Date(today.getTime() + 7 * DAY_MS);
    const overdue = events.filter((event) => new Date(event.date) < today).length;
    const thisWeek = events.filter((event) => {
      const d = startOfDay(new Date(event.date));
      return d >= today && d <= weekEnd;
    }).length;
    const documents = events.filter((event) => event.category === "documents").length;
    const reminders = events.filter((event) => event.category === "reminders").length;
    const next = events.find((event) => startOfDay(new Date(event.date)) >= today);
    return { overdue, thisWeek, documents, reminders, total: events.length, next };
  }, [events]);

  const byDay = useMemo(() => groupEventsByDay(filtered), [filtered]);

  async function handleExport() {
    setExporting(true);
    setExportMessage(null);
    try {
      await downloadCalendarIcs(range);
      setExportMessage("Calendar export started.");
    } catch {
      setError("Could not export the calendar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageContainer width="full" className="space-y-6">
      <header className="rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="size-3" />
              Private calendar
            </span>
            <h1 className="mt-3 text-page-title">Calendar</h1>
            <p className="mt-2 text-page-subtitle">
              Plan around expiries, renewals, reminders, bundle deadlines, and
              secure share expiries.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
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
        </div>
      </header>

      {exportMessage && <InlineAlert tone="good">{exportMessage}</InlineAlert>}

      {metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CalendarMetric
            href="#calendar-agenda"
            icon={ShieldAlert}
            label="Overdue"
            value={metrics.overdue}
            hint={metrics.overdue > 0 ? "Review overdue actions" : "No overdue dates"}
            tone={metrics.overdue > 0 ? "danger" : "good"}
            prominent={metrics.overdue > 0}
          />
          <CalendarMetric
            href="#calendar-agenda"
            icon={Clock3}
            label="This week"
            value={metrics.thisWeek}
            hint={
              metrics.thisWeek > 0
                ? "Review upcoming actions"
                : "No urgent dates this week"
            }
            tone={metrics.thisWeek > 0 ? "warn" : "secure"}
          />
          <CalendarMetric
            href="#calendar-agenda"
            icon={FileText}
            label="Document dates"
            value={metrics.documents}
            hint="Expiries and renewals"
            tone="secure"
          />
          <CalendarMetric
            href="#calendar-agenda"
            icon={BellRing}
            label="Reminders"
            value={metrics.reminders}
            hint="In-app reminders"
            tone="default"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[120px] rounded-xl" />
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main id="calendar-agenda" className="min-w-0 space-y-4">
          <CalendarToolbar view={view} onView={setView} filter={filter} onFilter={setFilter} />

          {error ? (
            <ErrorState description={error} onRetry={retry} />
          ) : events === null ? (
            <CalendarSkeleton />
          ) : filtered.length === 0 ? (
            <CalendarEmptyState
              filtered={filter !== "all"}
              onClear={() => setFilter("all")}
            />
          ) : view === "month" ? (
            <div className="content-fade-in">
              <MonthView
                events={filtered}
                byDay={byDay}
                cursor={monthCursor}
                onCursor={setMonthCursor}
                onDaySelect={(dateKey) =>
                  setDrawer({
                    kind: "day",
                    dateKey,
                    events: byDay.get(dateKey) ?? [],
                  })
                }
                onEventSelect={(event) => setDrawer({ kind: "event", event })}
              />
            </div>
          ) : (
            <div className="content-fade-in">
              <UpcomingView
                events={filtered}
                onSelect={(event) => setDrawer({ kind: "event", event })}
              />
            </div>
          )}
        </main>

        <PlanningRail
          metrics={metrics}
          events={events ?? []}
          filteredCount={filtered.length}
          range={range}
          onOpenEvent={(event) => setDrawer({ kind: "event", event })}
        />
      </div>

      {drawer?.kind === "event" && (
        <EventDrawer event={drawer.event} onClose={() => setDrawer(null)} />
      )}
      {drawer?.kind === "day" && (
        <DayDrawer
          dateKey={drawer.dateKey}
          events={drawer.events}
          onClose={() => setDrawer(null)}
          onOpenEvent={(event) => setDrawer({ kind: "event", event })}
        />
      )}
    </PageContainer>
  );
}

function CalendarMetric({
  href,
  icon: Icon,
  label,
  value,
  hint,
  tone,
  prominent = false,
}: {
  href: string;
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
    <Link
      href={href}
      className={cn(
        "group rounded-xl border p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none",
        toneClass,
        prominent && "ring-1 ring-destructive/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <span className="text-2xl font-semibold leading-none">{value}</span>
            <span className="text-sm font-medium text-muted-foreground">· {hint}</span>
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card/70 text-foreground shadow-xs">
          <Icon className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function CalendarToolbar({
  view,
  onView,
  filter,
  onFilter,
}: {
  view: ViewMode;
  onView: (view: ViewMode) => void;
  filter: string;
  onFilter: (filter: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          label="Calendar view"
          value={view}
          onChange={onView}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "month", label: "Month" },
          ]}
          className="w-full justify-center sm:w-auto"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  events,
  byDay,
  cursor,
  onCursor,
  onDaySelect,
  onEventSelect,
}: {
  events: CalendarEvent[];
  byDay: Map<string, CalendarEvent[]>;
  cursor: Date;
  onCursor: (date: Date) => void;
  onDaySelect: (dateKey: string) => void;
  onEventSelect: (event: CalendarEvent) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </CardTitle>
            <CardDescription>
              {events.length} planned item{events.length === 1 ? "" : "s"} in the visible range
            </CardDescription>
          </div>
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
              onClick={() => onCursor(startOfDay(new Date()))}
              aria-label="Go to current month"
            >
              <CalendarDays className="size-4" />
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
      </CardHeader>
      <CardContent className="overflow-x-hidden pt-4">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-muted/60 px-1.5 py-2 text-center font-medium">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          ))}
          {cells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-[5.75rem] bg-muted/25" />;
            }
            const key = toDateKey(date);
            const dayEvents = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onDaySelect(key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onDaySelect(key);
                  }
                }}
                className={cn(
                  "group min-h-[5.75rem] bg-card p-1.5 text-left transition-all duration-150 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none sm:min-h-[7.5rem] sm:p-2",
                  isToday && "bg-primary/[0.045] ring-1 ring-inset ring-primary/30",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground group-hover:bg-muted",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onEventSelect(event);
                      }}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          keyEvent.stopPropagation();
                          onEventSelect(event);
                        }
                      }}
                      className={cn(
                        "block min-w-0 rounded-md border px-1.5 py-1 text-[10px] font-medium leading-tight text-left transition-colors hover:border-primary/40 sm:text-[11px]",
                        CATEGORY_META[event.category].chip,
                      )}
                    >
                      <span className="line-clamp-2">{event.title}</span>
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      +{dayEvents.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
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
  const groups: { label: string; hint: string; events: CalendarEvent[] }[] = [
    { label: "Overdue", hint: "Past dates to review", events: [] },
    { label: "Today", hint: "Needs action now", events: [] },
    { label: "This week", hint: "Plan the next few days", events: [] },
    { label: "Next 30 days", hint: "Prepare ahead", events: [] },
    { label: "Later", hint: "Future planning", events: [] },
  ];
  const weekEnd = new Date(today.getTime() + 7 * DAY_MS);
  const monthEnd = new Date(today.getTime() + 30 * DAY_MS);
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
          <section key={group.label} className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                <p className="text-xs text-muted-foreground">{group.hint}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.events.length} item{group.events.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="space-y-2">
              {group.events.map((event) => (
                <li key={event.id}>
                  <EventAgendaRow event={event} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function EventAgendaRow({
  event,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}) {
  const Icon = CATEGORY_META[event.category].icon;
  const action = eventActionLabel(event);
  return (
    <div
      className={cn(
        "group grid grid-cols-1 gap-3 rounded-2xl border p-3 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none sm:grid-cols-[5.25rem_minmax(0,1fr)_auto]",
        URGENCY_META[event.urgency].row,
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(event)}
        className="flex items-center gap-3 text-left sm:block"
      >
        <span className="block text-sm font-semibold text-foreground">
          {agendaLabel(event.date)}
        </span>
        <span className="block text-xs text-muted-foreground sm:mt-1">
          {formatDateKey(toDateKey(event.date))}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onSelect(event)}
        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
              CATEGORY_META[event.category].chip,
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">
              {event.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {CATEGORY_META[event.category].label} · {countdownLabel(event.date)}
              {event.description ? ` · ${event.description}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={CATEGORY_META[event.category].chip}>
                {TYPE_LABEL[event.event_type] ?? "Calendar item"}
              </Badge>
              <Badge variant="outline" className={URGENCY_META[event.urgency].chip}>
                {URGENCY_META[event.urgency].label}
              </Badge>
            </div>
          </div>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {event.linked_resource_url ? (
          <Link
            href={event.linked_resource_url}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto")}
          >
            {action}
          </Link>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onSelect(event)} className="w-full sm:w-auto">
            Details
          </Button>
        )}
      </div>
    </div>
  );
}

function PlanningRail({
  metrics,
  events,
  filteredCount,
  range,
  onOpenEvent,
}: {
  metrics: {
    overdue: number;
    thisWeek: number;
    documents: number;
    reminders: number;
    total: number;
    next?: CalendarEvent;
  } | null;
  events: CalendarEvent[];
  filteredCount: number;
  range: { start: string; end: string };
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const focus = useMemo(() => {
    const urgent = events.find((event) => event.urgency === "overdue" || event.urgency === "critical");
    return urgent ?? metrics?.next ?? events[0];
  }, [events, metrics]);

  return (
    <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planning summary</CardTitle>
          <CardDescription>Owner-scoped dates in the loaded range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics ? (
            <>
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">{filteredCount}</span>{" "}
                of {metrics.total} date{metrics.total === 1 ? "" : "s"} in this range
              </p>
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <p className="text-xs font-medium text-muted-foreground">Range</p>
                <p className="mt-1 text-sm font-medium">
                  {formatDateKey(range.start)} - {formatDateKey(range.end)}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 rounded" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          )}

          {focus ? (
            <button
              type="button"
              onClick={() => onOpenEvent(focus)}
              className="w-full rounded-xl border border-primary/20 bg-primary/[0.035] p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <p className="text-xs font-medium text-primary">Next recommended review</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{focus.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {TYPE_LABEL[focus.event_type] ?? "Calendar item"} · {countdownLabel(focus.date)}
              </p>
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
              No dated item needs planning in this range.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Safe summaries only</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                DueNest keeps this planning view private to you and omits share
                tokens, access codes, and internal file paths.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusDot tone="secure" label="Owner-scoped calendar" />
            <StatusDot tone="good" label="One-way .ics" />
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function DayDrawer({
  dateKey,
  events,
  onClose,
  onOpenEvent,
}: {
  dateKey: string;
  events: CalendarEvent[];
  onClose: () => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  useEscapeClose(onClose);

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label={`Events for ${formatDateKey(dateKey, "long")}`} onClick={(e) => e.stopPropagation()}>
        <DrawerHeader title={formatDateKey(dateKey, "long")} subtitle={`${events.length} event${events.length === 1 ? "" : "s"}`} onClose={onClose} />
        {events.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
            <CalendarDays className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No events on this date.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add expiry dates, reminders, bundle deadlines, or secure share expiries
              to make this day useful.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <EventMiniCard event={event} onOpen={() => onOpenEvent(event)} />
              </li>
            ))}
          </ul>
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function EventDrawer({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  useEscapeClose(onClose);
  const Icon = CATEGORY_META[event.category].icon;

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label={event.title} onClick={(e) => e.stopPropagation()}>
        <DrawerHeader title={event.title} subtitle={CATEGORY_META[event.category].label} onClose={onClose} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className={CATEGORY_META[event.category].chip}>
            <Icon className="size-3" />
            {TYPE_LABEL[event.event_type] ?? "Calendar item"}
          </Badge>
          <Badge variant="outline" className={URGENCY_META[event.urgency].chip}>
            {URGENCY_META[event.urgency].label}
          </Badge>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-muted/25 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {event.description || "DueNest added this item so you can plan ahead."}
          </p>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <DetailRow label="Date" value={new Date(event.date).toLocaleDateString()} />
          <DetailRow label="When" value={countdownLabel(event.date)} />
          <DetailRow label="Linked item" value={CATEGORY_META[event.category].label} />
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

        <div className="mt-6 grid gap-2">
          {event.linked_resource_url && (
            <Link href={event.linked_resource_url} className={cn(buttonVariants(), "w-full")}>
              {eventActionLabel(event)}
            </Link>
          )}
          <Button variant="outline" onClick={() => void downloadCalendarIcs()}>
            <Download className="size-4" />
            Export .ics
          </Button>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function DrawerHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {subtitle && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {subtitle}
          </p>
        )}
        <h2 className="mt-1 font-heading text-xl font-semibold leading-tight">{title}</h2>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
        <X className="size-4" />
      </Button>
    </div>
  );
}

function EventMiniCard({
  event,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: () => void;
}) {
  const Icon = CATEGORY_META[event.category].icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", CATEGORY_META[event.category].chip)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{countdownLabel(event.date)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className={CATEGORY_META[event.category].chip}>
              {TYPE_LABEL[event.event_type] ?? "Calendar item"}
            </Badge>
            <Badge variant="outline" className={URGENCY_META[event.urgency].chip}>
              {URGENCY_META[event.urgency].label}
            </Badge>
          </div>
        </div>
      </div>
    </button>
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

function CalendarEmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={CalendarDays}
            title="No events match this filter"
            description="Try another calendar category or clear the filter to see every safe calendar summary."
            action={
              <Button variant="outline" onClick={onClear}>
                Clear filters
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={CalendarDays}
          title="No calendar events yet"
          description="Add expiry dates, reminders, pack deadlines, appointments, or secure share expiries to make your calendar useful."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/documents/new" className={cn(buttonVariants())}>
                <Plus className="size-4" />
                Add document
              </Link>
              <Link
                href="/dashboard/documents"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Add expiry date
              </Link>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

function groupEventsByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = toDateKey(event.date);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, sortEvents(list));
  }
  return map;
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}
