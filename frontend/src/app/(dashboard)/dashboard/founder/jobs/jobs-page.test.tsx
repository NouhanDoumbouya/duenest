// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

import type { ScheduledJob, ScheduledJobsSummary } from "@/types/founder";

function makeJob(overrides: Partial<ScheduledJob>): ScheduledJob {
  return {
    job_name: "x",
    display_name: "X",
    description: "desc",
    category: "maintenance",
    command_name: "x",
    expected_frequency: "daily",
    expected_max_age_minutes: 1440,
    is_enabled: true,
    is_manual_run_allowed: false,
    supports_dry_run: false,
    is_destructive: false,
    is_idempotent: true,
    safe_to_retry: true,
    notes: "",
    health: "healthy",
    last_run: null,
    ...overrides,
  };
}

const jobs: ScheduledJob[] = [
  makeJob({
    job_name: "weekly_radar_email",
    display_name: "Weekly Radar email",
    category: "email",
    is_manual_run_allowed: true,
    supports_dry_run: true,
    health: "healthy",
  }),
  makeJob({
    job_name: "purge_expired_trash",
    display_name: "Purge expired trash",
    category: "cleanup",
    is_destructive: true,
    is_manual_run_allowed: false,
    supports_dry_run: true,
    health: "stale",
  }),
  makeJob({
    job_name: "ai_briefing_digest",
    display_name: "AI briefing digest",
    category: "ai",
    is_manual_run_allowed: false,
    supports_dry_run: false,
    health: "never_run",
  }),
];

const summary: ScheduledJobsSummary = {
  scheduled_jobs_total: 3,
  scheduled_jobs_healthy: 1,
  scheduled_jobs_failing: 0,
  scheduled_jobs_stale: 1,
  scheduled_jobs_never_run: 1,
  scheduled_jobs_disabled: 0,
  last_failed_job: null,
};

vi.mock("@/lib/founder", () => ({
  getFounderJobs: vi.fn(() => Promise.resolve({ jobs })),
  getFounderJobsSummary: vi.fn(() => Promise.resolve(summary)),
  runFounderJob: vi.fn(),
  dryRunFounderJob: vi.fn(),
}));

import FounderJobsPage from "./page";

afterEach(cleanup);

describe("FounderJobsPage", () => {
  it("renders summary cards and a row per job with health badges", async () => {
    render(<FounderJobsPage />);
    expect(await screen.findByText("Weekly Radar email")).toBeTruthy();
    expect(screen.getByText("Total jobs")).toBeTruthy();
    // "Stale" / "Never run" appear as both a stat label and a health badge.
    expect(screen.getAllByText("Stale").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Never run").length).toBeGreaterThanOrEqual(1);
    // "Healthy" only renders as the email job's health badge here.
    expect(screen.getByText("Healthy")).toBeTruthy();
  });

  it("shows Run now only for safe manual jobs, never for destructive/AI jobs", async () => {
    render(<FounderJobsPage />);
    await screen.findByText("Weekly Radar email");

    // Email job: both Dry run + Run now.
    const radar = screen.getByText("Weekly Radar email").closest("div")!
      .parentElement!.parentElement!;
    expect(within(radar).getByRole("button", { name: "Run now" })).toBeTruthy();

    // Destructive purge: a Run now button must NOT exist anywhere for it.
    // (Only the email job exposes Run now.)
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Run now" })).toHaveLength(1),
    );
    // Dry run is offered for both the email and the destructive job.
    expect(screen.getAllByRole("button", { name: "Dry run" }).length).toBe(2);
  });
});
