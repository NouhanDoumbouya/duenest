import { describe, expect, it } from "vitest";

import {
  caseNextAction,
  filterPortalCases,
  filterPortalPeople,
} from "./portals";
import type {
  CaseStatusRef,
  PortalCase,
  PortalCaseProgress,
  PortalPerson,
} from "@/types/portals";

function makeProgress(
  overrides: Partial<PortalCaseProgress> = {},
): PortalCaseProgress {
  return {
    total_requirements: 0,
    satisfied_requirements: 0,
    missing_requirements: 0,
    readiness_score: 0,
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
    id: 1,
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

function makePerson(overrides: Partial<PortalPerson> = {}): PortalPerson {
  return {
    id: 10,
    full_name: "Amina Diallo",
    email: "amina@example.com",
    phone: "",
    person_type: "client",
    status: "active",
    notes: "",
    active_cases: 1,
    custom_fields: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const customStatus: CaseStatusRef = {
  id: 5,
  key: "awaiting_signature",
  label: "Awaiting signature",
  category: "reviewing",
  color: "#2563eb",
  icon: "pen",
  is_active: true,
};

describe("caseNextAction", () => {
  it("leads with your own review work", () => {
    const portalCase = makeCase({
      progress: makeProgress({
        uploads_needing_review: 2,
        missing_requirements: 1,
      }),
    });
    expect(caseNextAction(portalCase)).toBe("Review 2 uploads");
  });

  it("uses the singular when one upload waits", () => {
    const portalCase = makeCase({
      progress: makeProgress({ uploads_needing_review: 1 }),
    });
    expect(caseNextAction(portalCase)).toBe("Review 1 upload");
  });

  it("surfaces missing documents when nothing is waiting on review", () => {
    const portalCase = makeCase({
      progress: makeProgress({ missing_requirements: 3 }),
    });
    expect(caseNextAction(portalCase)).toBe("3 documents still needed");
  });

  it("reads as ready when the case is ready", () => {
    const portalCase = makeCase({ status: "ready" });
    expect(caseNextAction(portalCase)).toBe("Ready to move forward");
  });

  it("nudges to set up a case with no requirements", () => {
    const portalCase = makeCase({
      status: "draft",
      progress: makeProgress({ total_requirements: 0 }),
    });
    expect(caseNextAction(portalCase)).toBe("Add what this case needs");
  });

  it("shows an archived case as archived", () => {
    const portalCase = makeCase({ status: "archived" });
    expect(caseNextAction(portalCase)).toBe("Archived");
  });
});

describe("filterPortalCases", () => {
  const cases = [
    makeCase({ id: 1, title: "Visa file", status: "collecting_documents" }),
    makeCase({
      id: 2,
      title: "Scholarship pack",
      status: "ready",
      person: {
        id: 11,
        full_name: "Bao Nguyen",
        email: "bao@example.com",
        person_type: "student",
      },
      progress: makeProgress({ suggested_status: "ready" }),
    }),
    makeCase({
      id: 3,
      title: "Onboarding",
      status: "collecting_documents",
      custom_status: customStatus,
      progress: makeProgress({ uploads_needing_review: 1 }),
    }),
  ];

  it("returns everything with no filters", () => {
    expect(filterPortalCases(cases, {})).toHaveLength(3);
  });

  it("searches case title and person name, case-insensitively", () => {
    expect(filterPortalCases(cases, { search: "bao" }).map((c) => c.id)).toEqual(
      [2],
    );
    expect(
      filterPortalCases(cases, { search: "VISA" }).map((c) => c.id),
    ).toEqual([1]);
  });

  it("filters by system status", () => {
    expect(
      filterPortalCases(cases, { status: "ready" }).map((c) => c.id),
    ).toEqual([2]);
  });

  it("filters by custom status key", () => {
    expect(
      filterPortalCases(cases, {
        customStatusKey: "awaiting_signature",
      }).map((c) => c.id),
    ).toEqual([3]);
  });

  it("filters by person id", () => {
    expect(
      filterPortalCases(cases, { personId: 11 }).map((c) => c.id),
    ).toEqual([2]);
  });

  it("focuses on cases that need review", () => {
    expect(
      filterPortalCases(cases, { focus: "needs_review" }).map((c) => c.id),
    ).toEqual([3]);
  });

  it("treats a due date in the past as overdue for open cases", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const overdue = makeCase({
      id: 9,
      due_date: "2026-06-01",
      status: "collecting_documents",
    });
    const completedPast = makeCase({
      id: 8,
      due_date: "2026-06-01",
      status: "completed",
    });
    const result = filterPortalCases(
      [overdue, completedPast],
      { focus: "overdue" },
      now,
    );
    expect(result.map((c) => c.id)).toEqual([9]);
  });

  it("treats a due date within a week as due soon", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const soon = makeCase({ id: 7, due_date: "2026-06-30" });
    const later = makeCase({ id: 6, due_date: "2026-09-30" });
    const result = filterPortalCases([soon, later], { focus: "due_soon" }, now);
    expect(result.map((c) => c.id)).toEqual([7]);
  });
});

describe("filterPortalPeople", () => {
  const people = [
    makePerson({ id: 1, full_name: "Amina Diallo", status: "active" }),
    makePerson({
      id: 2,
      full_name: "Bao Nguyen",
      email: "bao@example.com",
      person_type: "student",
      status: "completed",
    }),
  ];

  it("returns everyone with no filters", () => {
    expect(filterPortalPeople(people, {})).toHaveLength(2);
  });

  it("searches name and email", () => {
    expect(
      filterPortalPeople(people, { search: "nguyen" }).map((p) => p.id),
    ).toEqual([2]);
    expect(
      filterPortalPeople(people, { search: "amina@" }).map((p) => p.id),
    ).toEqual([1]);
  });

  it("filters by status and type", () => {
    expect(
      filterPortalPeople(people, { status: "completed" }).map((p) => p.id),
    ).toEqual([2]);
    expect(
      filterPortalPeople(people, { personType: "student" }).map((p) => p.id),
    ).toEqual([2]);
  });
});
