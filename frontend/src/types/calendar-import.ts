// Types for the Google Calendar import API
// (/api/v1/integrations/google-calendar/*).
//
// Import-only and read-only: the backend never returns tokens, raw Google API
// bodies, or event descriptions, so none appear here. A calendar event becomes a
// CertaNest deadline + reminder only after the user confirms.

export interface GoogleCalendar {
  provider_calendar_id: string;
  name: string;
  primary: boolean;
  access_role: string;
  time_zone: string;
}

export interface GoogleCalendarEvent {
  provider_event_id: string;
  calendar_id: string;
  title: string;
  start: string;
  end: string;
  start_date: string;
  all_day: boolean;
  location: string;
  status: string;
  updated: string;
  recurring: boolean;
  already_imported?: boolean;
}

export interface CalendarEventsResponse {
  events: GoogleCalendarEvent[];
  next_page_token: string;
}

export interface ImportDestinationOption {
  type: string;
  label: string;
  available: boolean;
  reason?: string;
  description: string;
}

export type ImportResultStatus =
  | "imported"
  | "skipped"
  | "failed"
  | "importable"
  | "invalid";

export interface ImportResultItem {
  provider_event_id: string;
  title: string;
  status: ImportResultStatus;
  reason: string;
  reminder_id: number | null;
  document_id: number | null;
  event_date?: string;
}

export interface ImportPreviewResult {
  destination: { type: string; reminder_lead_days: number };
  importable_count: number;
  skipped_count: number;
  invalid_count: number;
  results: ImportResultItem[];
}

export interface ImportRunResult {
  status: "completed" | "partial" | "failed";
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  results: ImportResultItem[];
  warnings: string[];
}
