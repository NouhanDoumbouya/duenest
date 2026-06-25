"use client";

// Google Calendar import — manual, read-only, review-before-save.
//
// Flow: pick a connected Google account -> pick a calendar -> choose a date
// range / search -> select events -> review -> import. Each imported event
// becomes a CertaNest deadline + reminder on the event's date. CertaNest never
// creates, edits, or deletes anything in Google Calendar, and there is no
// automatic sync.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api";
import { getIntegrationAccounts } from "@/lib/integrations";
import {
  formatEventWhen,
  getGoogleCalendarEvents,
  getGoogleCalendars,
  importGoogleCalendarEvents,
} from "@/lib/calendar-import";
import { cn } from "@/lib/utils";
import type { ConnectedAccount } from "@/types/integrations";
import type {
  GoogleCalendar,
  GoogleCalendarEvent,
  ImportRunResult,
} from "@/types/calendar-import";

const PRIVACY_POINTS = [
  "Import selected events only.",
  "CertaNest will not create, edit, or delete events in Google Calendar.",
  "No automatic sync is enabled.",
  "Imported events become CertaNest reminders/deadlines after you confirm.",
  "Event descriptions are not stored — only the title and date.",
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const later = new Date(now.getTime());
  later.setDate(later.getDate() + 90);
  return { from: isoDate(now), to: isoDate(later) };
}

export default function GoogleCalendarImportPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null);
  const [calendarId, setCalendarId] = useState<string>("");
  const [calNotice, setCalNotice] = useState<string | null>(null);

  const [range, setRange] = useState(defaultRange);
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<GoogleCalendarEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [leadDays, setLeadDays] = useState(0);

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleAccount = useMemo(
    () => accounts?.find((a) => a.provider === "google") ?? null,
    [accounts],
  );

  // Load connected accounts once.
  useEffect(() => {
    let active = true;
    getIntegrationAccounts()
      .then((data) => active && setAccounts(data.accounts))
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 503)
          setAccountError("unavailable");
        else setAccountError("error");
      });
    return () => {
      active = false;
    };
  }, []);

  // Load calendars once we have a Google account.
  useEffect(() => {
    if (!googleAccount) return;
    let active = true;
    getGoogleCalendars(googleAccount.id)
      .then((data) => {
        if (!active) return;
        setCalNotice(null);
        setCalendars(data.calendars);
        const primary = data.calendars.find((c) => c.primary) ?? data.calendars[0];
        if (primary) setCalendarId(primary.provider_calendar_id);
      })
      .catch((err) => {
        if (!active) return;
        setCalendars([]);
        if (err instanceof ApiError) {
          const status = (err.data as { status?: string } | null)?.status;
          if (status === "not_configured") setCalNotice("not_configured");
          else if (status === "reconnect_required") setCalNotice("reconnect_required");
          else setCalNotice("error");
        } else setCalNotice("error");
      });
    return () => {
      active = false;
    };
  }, [googleAccount]);

  async function loadEvents() {
    if (!googleAccount || !calendarId) return;
    setEventsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getGoogleCalendarEvents({
        accountId: googleAccount.id,
        calendarId,
        timeMin: `${range.from}T00:00:00Z`,
        timeMax: `${range.to}T23:59:59Z`,
        query: query.trim() || undefined,
      });
      setEvents(data.events);
      setSelected(new Set());
    } catch (err) {
      setError(
        err instanceof ApiError && (err.data as { detail?: string } | null)?.detail
          ? (err.data as { detail: string }).detail
          : "Couldn't load events. Please try again.",
      );
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedEvents = useMemo(
    () => (events ?? []).filter((e) => selected.has(e.provider_event_id)),
    [events, selected],
  );

  async function runImport() {
    if (!googleAccount || selectedEvents.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importGoogleCalendarEvents({
        accountId: googleAccount.id,
        events: selectedEvents,
        reminderLeadDays: leadDays,
      });
      setResult(res);
      // Mark imported events so they can't be re-selected.
      setEvents((prev) =>
        (prev ?? []).map((e) =>
          res.results.some((r) => r.provider_event_id === e.provider_event_id && r.status === "imported")
            ? { ...e, already_imported: true }
            : e,
        ),
      );
      setSelected(new Set());
    } catch (err) {
      setError(
        err instanceof ApiError && (err.data as { detail?: string } | null)?.detail
          ? (err.data as { detail: string }).detail
          : "Import failed. Please try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  const back = (
    <Link
      href="/dashboard/settings/integrations"
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" /> Back to integrations
    </Link>
  );

  // ---- Account-level gates -------------------------------------------------

  if (accountError === "unavailable") {
    return (
      <PageContainer width="narrow">
        {back}
        <EmptyState
          icon={CalendarClock}
          title="Calendar import isn't available yet"
          description="This feature is coming soon to your account."
        />
      </PageContainer>
    );
  }

  if (accounts && !googleAccount) {
    return (
      <PageContainer width="narrow">
        {back}
        <PageHeader
          eyebrow="Integrations"
          title="Import from Google Calendar"
          description="Bring deadlines from your Google Calendar into CertaNest."
        />
        <EmptyState
          icon={CalendarClock}
          title="Connect Google first"
          description="Connect a Google account with calendar access, then come back to import your deadlines."
          action={
            <Link
              href="/dashboard/settings/integrations"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Connect Google
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      {back}
      <PageHeader
        eyebrow="Integrations"
        title="Import from Google Calendar"
        description="Choose a calendar, select the events that are real deadlines, and import them as CertaNest reminders. Your Google Calendar is never changed."
      />

      {!accounts ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Connected account + reconnect/config notices */}
          {googleAccount && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  Connected as{" "}
                  <span className="font-medium">
                    {googleAccount.provider_email || "your Google account"}
                  </span>
                </span>
                {calNotice === "reconnect_required" && (
                  <Link
                    href="/dashboard/settings/integrations"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Reconnect
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {calNotice === "not_configured" && (
            <Card>
              <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Google isn&apos;t configured on this server yet. An administrator needs
                to add the provider credentials.
              </CardContent>
            </Card>
          )}

          {calNotice === "reconnect_required" && (
            <Card>
              <CardContent className="flex items-start gap-2 text-sm text-amber-600">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Your Google connection needs attention. Reconnect to grant calendar
                access, then try again.
              </CardContent>
            </Card>
          )}

          {/* Calendar picker */}
          {calendars && calendars.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Calendar
                </p>
                <div className="flex flex-wrap gap-2">
                  {calendars.map((cal) => (
                    <Button
                      key={cal.provider_calendar_id}
                      type="button"
                      size="sm"
                      variant={calendarId === cal.provider_calendar_id ? "default" : "outline"}
                      onClick={() => setCalendarId(cal.provider_calendar_id)}
                    >
                      {cal.name}
                      {cal.primary ? " · Primary" : ""}
                    </Button>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="from">From</Label>
                    <Input
                      id="from"
                      type="date"
                      value={range.from}
                      onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="to">To</Label>
                    <Input
                      id="to"
                      type="date"
                      value={range.to}
                      onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="q">Search (optional)</Label>
                  <Input
                    id="q"
                    type="text"
                    placeholder="e.g. deadline, appointment"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Button type="button" onClick={loadEvents} disabled={eventsLoading || !calendarId}>
                  {eventsLoading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Load events
                </Button>
              </CardContent>
            </Card>
          )}

          {calendars && calendars.length === 0 && calNotice === null && (
            <EmptyState
              icon={CalendarClock}
              title="No calendars found"
              description="We couldn't find any calendars on this Google account."
            />
          )}

          {error && (
            <Card>
              <CardContent className="flex items-center gap-3 text-sm text-destructive">
                <TriangleAlert className="size-4 shrink-0" /> {error}
              </CardContent>
            </Card>
          )}

          {/* Import result summary */}
          {result && (
            <Card>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {result.status === "failed" ? (
                    <TriangleAlert className="size-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="size-4 text-primary" />
                  )}
                  {result.status === "partial"
                    ? "Imported with some skips"
                    : result.status === "failed"
                      ? "Nothing was imported"
                      : "Import complete"}
                </div>
                <p className="text-sm text-muted-foreground">
                  {result.imported_count} imported · {result.skipped_count} skipped ·{" "}
                  {result.failed_count} failed
                </p>
                {result.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-600">
                    {w}
                  </p>
                ))}
                {result.imported_count > 0 && (
                  <Link
                    href="/dashboard/reminders"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 w-fit")}
                  >
                    View reminders
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Events list */}
          {events && events.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Select events to import
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {selected.size} selected
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {events.map((event) => {
                    const disabled = Boolean(event.already_imported);
                    const isOn = selected.has(event.provider_event_id);
                    return (
                      <li key={event.provider_event_id} className="py-2">
                        <label
                          className={cn(
                            "flex items-start gap-3",
                            disabled ? "opacity-60" : "cursor-pointer",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 accent-primary"
                            checked={isOn}
                            disabled={disabled}
                            onChange={() => toggleEvent(event.provider_event_id)}
                            aria-label={`Select ${event.title}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium">{event.title}</span>
                              {event.recurring && (
                                <Badge variant="outline" className="text-[10px]">
                                  Recurring
                                </Badge>
                              )}
                              {event.already_imported && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Already imported
                                </Badge>
                              )}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatEventWhen(event)}
                              {event.location ? ` · ${event.location}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <Separator />

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lead">Remind me (days before)</Label>
                    <Input
                      id="lead"
                      type="number"
                      min={0}
                      max={365}
                      value={leadDays}
                      onChange={(e) => setLeadDays(Math.max(0, Number(e.target.value) || 0))}
                      className="w-28"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Each event becomes a CertaNest deadline with a reminder. The original
                    event in Google Calendar is never changed.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={runImport}
                  disabled={importing || selectedEvents.length === 0}
                >
                  {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Review &amp; import {selectedEvents.length || ""} event
                  {selectedEvents.length === 1 ? "" : "s"}
                </Button>
              </CardContent>
            </Card>
          )}

          {events && events.length === 0 && !eventsLoading && !error && (
            <EmptyState
              icon={CalendarClock}
              title="No events in this range"
              description="Try a wider date range or a different search."
            />
          )}
        </>
      )}

      {/* Privacy / trust copy */}
      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" /> How this works
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
