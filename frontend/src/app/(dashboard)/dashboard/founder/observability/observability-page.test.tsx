// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import type { ObservabilityOverview } from "@/types/founder";

const overview: ObservabilityOverview = {
  system_status: {
    generated_at: "2026-06-25T00:00:00Z",
    overall: "degraded",
    components: {
      database: { ok: true },
      cache: { ok: true },
      storage: { backend: "s3", configured: true },
      email: { provider: "resend", configured: true },
      ai: { configured: false, embeddings_configured: false },
      feature_flags: { loaded: true, count: 12 },
    },
    scheduled_jobs: [
      {
        job_name: "weekly_radar_job",
        status: "succeeded",
        started_at: null,
        finished_at: "2026-06-25T00:00:00Z",
        emails_sent: 5,
        emails_failed: 0,
        error: "",
      },
    ],
    counts: {
      unresolved_critical_events: 2,
      critical_events_24h: 1,
      unresolved_app_errors: 0,
    },
  },
  recent_critical_events: [
    {
      id: 1,
      created_at: "2026-06-25T00:00:00Z",
      severity: "error",
      category: "storage",
      source: "document_request_upload",
      status: "failed",
      user: null,
      organization: null,
      correlation_id: "ref-xyz",
      message: "Uploaded file could not be stored",
      error_code: "storage_write_failed",
      metadata: {},
      resolved: false,
      resolved_at: null,
      resolution_note: "",
    },
  ],
  upload_storage_issues: [],
  public_link_issues: [],
  ai_health: {
    configured: false,
    embeddings_configured: false,
    succeeded_24h: 0,
    errored_24h: 0,
    blocked_24h: 0,
    recent_failures: [],
  },
  email_health: null,
};

vi.mock("@/lib/founder", () => ({
  getFounderObservability: vi.fn(() => Promise.resolve(overview)),
  resolveFounderOperationalEvent: vi.fn(() => Promise.resolve(overview.recent_critical_events[0])),
}));

import FounderObservabilityPage from "./page";

afterEach(cleanup);

describe("FounderObservabilityPage", () => {
  it("renders the system status, counts, and a recent critical event", async () => {
    render(<FounderObservabilityPage />);

    // System status components.
    expect(await screen.findByText("Database")).toBeTruthy();
    expect(screen.getByText("Storage")).toBeTruthy();
    expect(screen.getByText("Degraded")).toBeTruthy();

    // Headline counts.
    expect(screen.getByText("Unresolved critical")).toBeTruthy();

    // The recent critical event + its safe reference (no token, no stack trace).
    expect(screen.getByText("Uploaded file could not be stored")).toBeTruthy();
    expect(screen.getByText("ref-xyz")).toBeTruthy();
  });

  it("offers a resolve action for unresolved events", async () => {
    render(<FounderObservabilityPage />);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Mark resolved" }).length).toBeGreaterThan(0),
    );
  });
});
