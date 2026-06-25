// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { FounderOrgListItem } from "@/types/founder";

const orgs: FounderOrgListItem[] = [
  {
    id: 1,
    name: "Acme Agency",
    slug: "acme",
    country: "US",
    organization_type: "agency",
    owner: { id: 9, email: "owner@acme.com" },
    plan: "teams_beta",
    portal_enabled: true,
    has_demo_workspace: false,
    members: 3,
    people: 12,
    active_cases: 4,
    active_requests: 2,
    active_rooms: 1,
    is_archived: false,
    created_at: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/lib/founder", () => ({
  getFounderOrganizations: vi.fn(() => Promise.resolve({ organizations: orgs })),
}));

import FounderOrganizationsPage from "./page";

afterEach(cleanup);

describe("FounderOrganizationsPage", () => {
  it("renders the org list with safe aggregates", async () => {
    render(<FounderOrganizationsPage />);
    expect(await screen.findByText("Acme Agency")).toBeTruthy();
    expect(screen.getByText("owner@acme.com")).toBeTruthy();
    expect(screen.getByText("teams_beta")).toBeTruthy();
    expect(screen.getByText("Portal on")).toBeTruthy();
    expect(screen.getByText("12 people")).toBeTruthy();
  });
});
