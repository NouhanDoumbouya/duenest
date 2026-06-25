// API client for Google Calendar import
// (/api/v1/integrations/google-calendar/*).
//
// The backend is the enforcement boundary: it gates on the integrations +
// google_integrations + google_calendar_import flags, only ever touches the
// signed-in user's own connected account, and never returns tokens or raw API
// bodies. These wrappers stay thin. Nothing here writes back to Google.

import { apiFetch } from "./api";
import type {
  CalendarEventsResponse,
  GoogleCalendar,
  ImportDestinationOption,
  ImportPreviewResult,
  ImportRunResult,
  GoogleCalendarEvent,
} from "@/types/calendar-import";

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && `${value}` !== "") {
      search.set(key, `${value}`);
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export function getImportDestinations(): Promise<{ destinations: ImportDestinationOption[] }> {
  return apiFetch("/integrations/google-calendar/destinations/");
}

export function getGoogleCalendars(accountId: number): Promise<{ calendars: GoogleCalendar[] }> {
  return apiFetch(`/integrations/google-calendar/calendars/${qs({ account_id: accountId })}`);
}

export function getGoogleCalendarEvents(params: {
  accountId: number;
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  query?: string;
  pageToken?: string;
}): Promise<CalendarEventsResponse> {
  return apiFetch(
    `/integrations/google-calendar/events/${qs({
      account_id: params.accountId,
      calendar_id: params.calendarId,
      time_min: params.timeMin,
      time_max: params.timeMax,
      query: params.query,
      page_token: params.pageToken,
    })}`,
  );
}

export function previewGoogleCalendarImport(body: {
  accountId: number;
  events: GoogleCalendarEvent[];
  reminderLeadDays?: number;
}): Promise<ImportPreviewResult> {
  return apiFetch("/integrations/google-calendar/import/preview/", {
    method: "POST",
    body: {
      account_id: body.accountId,
      events: body.events,
      destination: { type: "deadline", reminder_lead_days: body.reminderLeadDays ?? 0 },
    },
  });
}

export function importGoogleCalendarEvents(body: {
  accountId: number;
  events: GoogleCalendarEvent[];
  reminderLeadDays?: number;
}): Promise<ImportRunResult> {
  return apiFetch("/integrations/google-calendar/import/", {
    method: "POST",
    body: {
      account_id: body.accountId,
      events: body.events,
      destination: { type: "deadline", reminder_lead_days: body.reminderLeadDays ?? 0 },
    },
  });
}

// ---- Pure presentation helpers (unit-tested) ------------------------------

export function importResultReasonLabel(reason: string): string {
  switch (reason) {
    case "already_imported":
      return "Already imported";
    case "missing_date":
      return "No date on this event";
    case "missing_event_id":
      return "Missing event id";
    case "plan_limit_reached":
      return "Plan limit reached";
    default:
      return reason ? reason.replace(/_/g, " ") : "";
  }
}

export function formatEventWhen(event: GoogleCalendarEvent): string {
  if (!event.start) return "No date";
  if (event.all_day) return `${event.start_date} · All day`;
  // Keep it simple and locale-stable: show the date and the raw time portion.
  const time = event.start.length > 11 ? event.start.slice(11, 16) : "";
  return time ? `${event.start_date} · ${time}` : event.start_date;
}
