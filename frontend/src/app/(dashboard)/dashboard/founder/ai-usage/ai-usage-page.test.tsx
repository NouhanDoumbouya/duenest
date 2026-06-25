// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { AiUsageOverview } from "@/types/founder";

const overview: AiUsageOverview = {
  configured: true,
  embeddings_configured: false,
  today: { requests: 4, tokens: 1200, cost_usd: 0.12 },
  month: { requests: 40, tokens: 12000, cost_usd: 1.23 },
  failures_by_reason: { budget: 2 },
  top_users: [{ user_id: 5, email: "heavy@example.com", tokens: 9000, requests: 30 }],
  caps: {
    daily_token_cap_user: 5000,
    daily_token_cap_global: 25000,
    monthly_cost_limit_usd: 5,
  },
};

vi.mock("@/lib/founder", () => ({
  getFounderAiUsage: vi.fn(() => Promise.resolve(overview)),
}));

import FounderAiUsagePage from "./page";

afterEach(cleanup);

describe("FounderAiUsagePage", () => {
  it("renders safe AI metering aggregates (no prompts)", async () => {
    render(<FounderAiUsagePage />);
    expect(await screen.findByText("AI configured")).toBeTruthy();
    expect(screen.getByText("Requests today")).toBeTruthy();
    expect(screen.getByText("Failures by reason (month)")).toBeTruthy();
    expect(screen.getByText("heavy@example.com")).toBeTruthy();
    // Cost + budget cap surface (safe metering only).
    expect(screen.getByText("Cost today")).toBeTruthy();
  });
});
