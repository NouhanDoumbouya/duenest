// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { OrgOnboarding } from "@/types/portals";

const createOrgDemo = vi.fn(() => Promise.resolve({} as never));
const dismissOrgOnboarding = vi.fn(() => Promise.resolve({} as never));
const cleanupOrgDemo = vi.fn(() => Promise.resolve({} as never));

vi.mock("@/lib/portals", () => ({
  createOrgDemo: (...args: unknown[]) => createOrgDemo(...(args as [])),
  dismissOrgOnboarding: (...args: unknown[]) => dismissOrgOnboarding(...(args as [])),
  cleanupOrgDemo: (...args: unknown[]) => cleanupOrgDemo(...(args as [])),
}));

import { OrgOnboardingCard } from "./org-onboarding-card";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeOnboarding(overrides: Partial<OrgOnboarding> = {}): OrgOnboarding {
  return {
    mode: "organization",
    organization_id: 1,
    steps: [
      { key: "create_template", title: "Create a template", description: "...", done: false },
      { key: "add_person", title: "Add a person", description: "...", done: false },
    ],
    completed_count: 0,
    total_count: 2,
    percent: 0,
    next_action: { key: "create_template", title: "Create a template", hint: "..." },
    dismissed: false,
    has_demo: false,
    demo_created_at: null,
    ...overrides,
  };
}

describe("OrgOnboardingCard", () => {
  it("renders the checklist and a demo CTA when in progress", () => {
    render(
      <OrgOnboardingCard
        orgId={1}
        onboarding={makeOnboarding()}
        canManage
        onChanged={() => Promise.resolve()}
      />,
    );
    expect(screen.getByText("Get your portal set up")).toBeTruthy();
    expect(screen.getByText("Create a template")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try a demo workspace/ })).toBeTruthy();
  });

  it("hides itself when dismissed or complete", () => {
    const { container, rerender } = render(
      <OrgOnboardingCard orgId={1} onboarding={makeOnboarding({ dismissed: true })} canManage onChanged={() => Promise.resolve()} />,
    );
    expect(container.firstChild).toBeNull();
    rerender(
      <OrgOnboardingCard orgId={1} onboarding={makeOnboarding({ percent: 100 })} canManage onChanged={() => Promise.resolve()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("creates the demo workspace and refreshes on click", async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    render(
      <OrgOnboardingCard orgId={7} onboarding={makeOnboarding()} canManage onChanged={onChanged} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Try a demo workspace/ }));
    await waitFor(() => expect(createOrgDemo).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows demo-active + remove when a demo exists", () => {
    render(
      <OrgOnboardingCard orgId={1} onboarding={makeOnboarding({ has_demo: true })} canManage onChanged={() => Promise.resolve()} />,
    );
    expect(screen.getByText("Demo workspace active")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove demo data/ })).toBeTruthy();
  });

  it("hides admin actions for non-managers", () => {
    render(
      <OrgOnboardingCard orgId={1} onboarding={makeOnboarding()} canManage={false} onChanged={() => Promise.resolve()} />,
    );
    expect(screen.queryByRole("button", { name: /Try a demo workspace/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Dismiss/ })).toBeNull();
  });
});
