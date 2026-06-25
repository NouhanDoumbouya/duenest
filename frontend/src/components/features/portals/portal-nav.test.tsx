// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PortalNav } from "./portal-nav";

afterEach(cleanup);

describe("PortalNav", () => {
  it("links every portal surface for the org", () => {
    render(<PortalNav orgId={7} active="overview" />);
    const base = "/dashboard/organizations/7/portal";
    const expected: Record<string, string> = {
      Overview: base,
      Cases: `${base}/cases`,
      People: `${base}/people`,
      Documents: `${base}/documents`,
      Templates: `${base}/templates`,
      Settings: `${base}/settings/customization`,
    };
    for (const [label, href] of Object.entries(expected)) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("marks only the active section with aria-current", () => {
    render(<PortalNav orgId={1} active="cases" />);
    expect(
      screen.getByRole("link", { name: "Cases" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Overview" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("exposes an accessible nav landmark", () => {
    render(<PortalNav orgId={1} active="people" />);
    expect(
      screen.getByRole("navigation", { name: "Portal sections" }),
    ).toBeTruthy();
  });
});
