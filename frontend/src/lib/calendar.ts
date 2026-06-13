// API helpers for DueNest Calendar V1.

import { API_BASE_URL, apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  CalendarEventsResponse,
  CalendarFilters,
  CalendarSummary,
} from "@/types/calendar";

function buildQuery(filters?: CalendarFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.type) params.set("type", filters.type);
  if (filters.urgency) params.set("urgency", filters.urgency);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getCalendarEvents(
  filters?: CalendarFilters,
): Promise<CalendarEventsResponse> {
  return apiFetch<CalendarEventsResponse>(
    `/calendar/events/${buildQuery(filters)}`,
    { auth: true },
  );
}

export function getCalendarSummary(): Promise<CalendarSummary> {
  return apiFetch<CalendarSummary>("/calendar/summary/", { auth: true });
}

/** Download the calendar as a one-way .ics file. */
export async function downloadCalendarIcs(
  filters?: CalendarFilters,
): Promise<void> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(
    `${API_BASE_URL}/calendar/export.ics${buildQuery(filters)}`,
    { headers },
  );
  if (!response.ok) throw new Error("Could not export the calendar.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "duenest-calendar.ics";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
