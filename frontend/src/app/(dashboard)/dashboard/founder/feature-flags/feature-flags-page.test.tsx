// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { FeatureFlag } from "@/types/founder";

const flags: FeatureFlag[] = [
  {
    id: 1,
    key: "b2b_portals",
    name: "B2B Portals",
    description: "Organization portal workspace",
    visibility: "beta_only",
    maintenance_message: "",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/lib/founder", () => ({
  getFounderFeatureFlags: vi.fn(() => Promise.resolve(flags)),
  updateFounderFeatureFlag: vi.fn(),
}));

import FounderFeatureFlagsPage from "./page";

afterEach(cleanup);

describe("FounderFeatureFlagsPage", () => {
  it("lists flags with a visibility control", async () => {
    render(<FounderFeatureFlagsPage />);
    expect(await screen.findByText("B2B Portals")).toBeTruthy();
    expect(screen.getByText("b2b_portals")).toBeTruthy();
    const select = screen.getByRole("combobox", { name: /Visibility for B2B Portals/ });
    expect((select as HTMLSelectElement).value).toBe("beta_only");
  });
});
