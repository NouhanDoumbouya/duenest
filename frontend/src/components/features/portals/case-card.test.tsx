// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CaseCard } from "./case-card";
import type {
  CaseStatusRef,
  PortalCase,
  PortalCaseProgress,
} from "@/types/portals";

afterEach(cleanup);

function makeProgress(
  overrides: Partial<PortalCaseProgress> = {},
): PortalCaseProgress {
  return {
    total_requirements: 4,
    satisfied_requirements: 2,
    missing_requirements: 0,
    readiness_score: 50,
    requests_total: 0,
    requests_uploaded: 0,
    requests_accepted: 0,
    requests_needs_replacement: 0,
    uploads_needing_review: 0,
    suggested_status: "draft",
    ...overrides,
  };
}

function makeCase(overrides: Partial<PortalCase> = {}): PortalCase {
  return {
    id: 42,
    title: "Student visa application",
    case_type: "visa",
    status: "collecting_documents",
    priority: "normal",
    due_date: null,
    notes: "",
    person: {
      id: 10,
      full_name: "Amina Diallo",
      email: "amina@example.com",
      person_type: "client",
    },
    linked_bundle: null,
    linked_application: null,
    linked_room: null,
    room_public_url: null,
    progress: makeProgress(),
    requests: [],
    custom_status: null,
    custom_fields: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("CaseCard", () => {
  it("links to the case detail and shows title, person, and readiness", () => {
    render(<CaseCard orgId={7} portalCase={makeCase()} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/dashboard/organizations/7/portal/cases/42",
    );
    expect(screen.getByText("Student visa application")).toBeTruthy();
    expect(screen.getByText("Amina Diallo")).toBeTruthy();
    expect(screen.getByText("50% ready")).toBeTruthy();
  });

  it("surfaces the next action prominently", () => {
    render(
      <CaseCard
        orgId={1}
        portalCase={makeCase({
          progress: makeProgress({ uploads_needing_review: 2 }),
        })}
      />,
    );
    expect(screen.getByText("Review 2 uploads")).toBeTruthy();
  });

  it("shows the custom status label when one is set", () => {
    const customStatus: CaseStatusRef = {
      id: 5,
      key: "awaiting_signature",
      label: "Awaiting signature",
      category: "reviewing",
      color: "#2563eb",
      icon: "pen",
      is_active: true,
    };
    render(
      <CaseCard orgId={1} portalCase={makeCase({ custom_status: customStatus })} />,
    );
    expect(screen.getByText("Awaiting signature")).toBeTruthy();
  });
});
