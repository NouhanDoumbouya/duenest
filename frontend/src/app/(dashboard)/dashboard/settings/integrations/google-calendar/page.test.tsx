// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ConnectedAccount } from "@/types/integrations";
import type {
  GoogleCalendar,
  GoogleCalendarEvent,
  ImportRunResult,
} from "@/types/calendar-import";

const ACCOUNT: ConnectedAccount = {
  id: 7,
  provider: "google",
  provider_account_id: "google-sub-123",
  provider_email: "user@example.com",
  display_name: "Test User",
  scopes: [],
  scope_groups: ["calendar"],
  status: "connected",
  token_expires_at: null,
  last_refresh_at: null,
  last_checked_at: null,
  last_error_code: "",
  last_error_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  disconnected_at: null,
  is_token_expired: false,
  needs_attention: false,
};

const CAL: GoogleCalendar = {
  provider_calendar_id: "primary",
  name: "Work",
  primary: true,
  access_role: "owner",
  time_zone: "UTC",
};

const EVENT: GoogleCalendarEvent = {
  provider_event_id: "e1",
  calendar_id: "primary",
  title: "Scholarship deadline",
  start: "2026-08-20T09:00:00Z",
  end: "2026-08-20T10:00:00Z",
  start_date: "2026-08-20",
  all_day: false,
  location: "",
  status: "confirmed",
  updated: "",
  recurring: false,
};

const IMPORT_OK: ImportRunResult = {
  status: "completed",
  imported_count: 1,
  skipped_count: 0,
  failed_count: 0,
  results: [
    { provider_event_id: "e1", title: "Scholarship deadline", status: "imported", reason: "", reminder_id: 5, document_id: 9 },
  ],
  warnings: [],
};

const getIntegrationAccounts = vi.fn();
const getGoogleCalendars = vi.fn();
const getGoogleCalendarEvents = vi.fn();
const importGoogleCalendarEvents = vi.fn();

vi.mock("@/lib/integrations", () => ({
  getIntegrationAccounts: () => getIntegrationAccounts(),
}));

vi.mock("@/lib/calendar-import", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calendar-import")>(
    "@/lib/calendar-import",
  );
  return {
    ...actual,
    getGoogleCalendars: (...a: unknown[]) => getGoogleCalendars(...(a as [])),
    getGoogleCalendarEvents: (...a: unknown[]) => getGoogleCalendarEvents(...(a as [])),
    importGoogleCalendarEvents: (...a: unknown[]) => importGoogleCalendarEvents(...(a as [])),
  };
});

import GoogleCalendarImportPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GoogleCalendarImportPage", () => {
  it("shows the connect-first state when no Google account is connected", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [] });
    render(<GoogleCalendarImportPage />);
    expect(await screen.findByText("Connect Google first")).toBeTruthy();
  });

  it("renders the calendar picker, date controls, and privacy copy when connected", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    getGoogleCalendars.mockResolvedValueOnce({ calendars: [CAL] });
    render(<GoogleCalendarImportPage />);

    expect(await screen.findByText("user@example.com")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Work · Primary/ })).toBeTruthy();
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
    expect(screen.getByLabelText(/Search/)).toBeTruthy();
    // Trust copy is present.
    expect(
      screen.getByText(/CertaNest will not create, edit, or delete events/),
    ).toBeTruthy();
    expect(screen.getByText(/No automatic sync is enabled/)).toBeTruthy();
  });

  it("loads events, selects one, imports, and shows the result (no tokens shown)", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    getGoogleCalendars.mockResolvedValueOnce({ calendars: [CAL] });
    getGoogleCalendarEvents.mockResolvedValueOnce({ events: [EVENT], next_page_token: "" });
    importGoogleCalendarEvents.mockResolvedValueOnce(IMPORT_OK);

    render(<GoogleCalendarImportPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Load events/ }));

    const checkbox = await screen.findByLabelText("Select Scholarship deadline");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /Review .* import/ }));

    await waitFor(() => expect(importGoogleCalendarEvents).toHaveBeenCalled());
    expect(await screen.findByText("Import complete")).toBeTruthy();
    expect(screen.getByText(/1 imported · 0 skipped · 0 failed/)).toBeTruthy();
    // Never render token material.
    expect(screen.queryByText(/access_token|refresh_token|ya29\./)).toBeNull();
  });

  it("renders a partial-success result with a warning", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    getGoogleCalendars.mockResolvedValueOnce({ calendars: [CAL] });
    getGoogleCalendarEvents.mockResolvedValueOnce({
      events: [EVENT, { ...EVENT, provider_event_id: "e2", title: "Visa appt", recurring: true }],
      next_page_token: "",
    });
    importGoogleCalendarEvents.mockResolvedValueOnce({
      status: "partial",
      imported_count: 1,
      skipped_count: 1,
      failed_count: 0,
      results: [
        { provider_event_id: "e1", title: "Scholarship deadline", status: "imported", reason: "", reminder_id: 5, document_id: 9 },
        { provider_event_id: "e2", title: "Visa appt", status: "skipped", reason: "already_imported", reminder_id: null, document_id: null },
      ],
      warnings: ["Recurring events were imported as single one-off deadlines."],
    });

    render(<GoogleCalendarImportPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Load events/ }));
    fireEvent.click(await screen.findByLabelText("Select Scholarship deadline"));
    fireEvent.click(screen.getByRole("button", { name: /Review .* import/ }));

    expect(await screen.findByText("Imported with some skips")).toBeTruthy();
    expect(
      screen.getByText(/Recurring events were imported as single one-off deadlines/),
    ).toBeTruthy();
  });
});
