import { describe, expect, it } from "vitest";

import {
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_ORDER,
  PORTAL_CASE_PRIORITY_TONE,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_ORDER,
  PORTAL_CASE_STATUS_TONE,
  PORTAL_CASE_TYPE_LABELS,
  PORTAL_CASE_TYPE_ORDER,
  PORTAL_PERSON_STATUS_LABELS,
  PORTAL_PERSON_STATUS_ORDER,
  PORTAL_PERSON_STATUS_TONE,
  PORTAL_PERSON_TYPE_LABELS,
  PORTAL_PERSON_TYPE_ORDER,
  progressPercent,
} from "./portals";
import type { PortalCaseProgress } from "@/types/portals";

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

describe("person-type label + order maps", () => {
  it("labels every person type in the order list", () => {
    for (const type of PORTAL_PERSON_TYPE_ORDER) {
      expect(PORTAL_PERSON_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("covers all six person types with no duplicates in the order", () => {
    expect(PORTAL_PERSON_TYPE_ORDER).toHaveLength(6);
    expect(new Set(PORTAL_PERSON_TYPE_ORDER).size).toBe(6);
  });

  it("uses human wording for compound types", () => {
    expect(PORTAL_PERSON_TYPE_LABELS.family_member).toBe("Family member");
    expect(PORTAL_PERSON_TYPE_LABELS.applicant).toBe("Applicant");
  });
});

describe("person-status label + tone + order maps", () => {
  it("labels and tones every status in the order list", () => {
    for (const status of PORTAL_PERSON_STATUS_ORDER) {
      expect(PORTAL_PERSON_STATUS_LABELS[status]).toBeTruthy();
      expect(PORTAL_PERSON_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("maps completed to success and waiting to warning", () => {
    expect(PORTAL_PERSON_STATUS_TONE.completed).toBe("success");
    expect(PORTAL_PERSON_STATUS_TONE.waiting_for_documents).toBe("warning");
    expect(PORTAL_PERSON_STATUS_TONE.archived).toBe("neutral");
  });
});

describe("case-type label + order maps", () => {
  it("labels every case type in the order list", () => {
    for (const type of PORTAL_CASE_TYPE_ORDER) {
      expect(PORTAL_CASE_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("covers all seven case types", () => {
    expect(PORTAL_CASE_TYPE_ORDER).toHaveLength(7);
    expect(new Set(PORTAL_CASE_TYPE_ORDER).size).toBe(7);
  });
});

describe("case-status label + tone + order maps", () => {
  it("labels and tones every status in the order list", () => {
    for (const status of PORTAL_CASE_STATUS_ORDER) {
      expect(PORTAL_CASE_STATUS_LABELS[status]).toBeTruthy();
      expect(PORTAL_CASE_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("maps ready/completed to success and blocked to danger", () => {
    expect(PORTAL_CASE_STATUS_TONE.ready).toBe("success");
    expect(PORTAL_CASE_STATUS_TONE.completed).toBe("success");
    expect(PORTAL_CASE_STATUS_TONE.blocked).toBe("danger");
    expect(PORTAL_CASE_STATUS_TONE.waiting_for_review).toBe("warning");
    expect(PORTAL_CASE_STATUS_TONE.draft).toBe("neutral");
  });
});

describe("priority label + tone + order maps", () => {
  it("labels and tones every priority in the order list", () => {
    for (const priority of PORTAL_CASE_PRIORITY_ORDER) {
      expect(PORTAL_CASE_PRIORITY_LABELS[priority]).toBeTruthy();
      expect(PORTAL_CASE_PRIORITY_TONE[priority]).toBeTruthy();
    }
  });

  it("escalates tone from low to urgent", () => {
    expect(PORTAL_CASE_PRIORITY_TONE.low).toBe("neutral");
    expect(PORTAL_CASE_PRIORITY_TONE.high).toBe("warning");
    expect(PORTAL_CASE_PRIORITY_TONE.urgent).toBe("danger");
  });
});

describe("progressPercent", () => {
  it("returns 0 for a case with no requirements (never NaN)", () => {
    const value = progressPercent(makeProgress({ total_requirements: 0 }));
    expect(value).toBe(0);
    expect(Number.isNaN(value)).toBe(false);
  });

  it("returns 0 when total is negative or missing", () => {
    expect(
      progressPercent(makeProgress({ total_requirements: -3 })),
    ).toBe(0);
  });

  it("computes a rounded percentage of satisfied requirements", () => {
    expect(
      progressPercent(
        makeProgress({ total_requirements: 4, satisfied_requirements: 1 }),
      ),
    ).toBe(25);
    expect(
      progressPercent(
        makeProgress({ total_requirements: 3, satisfied_requirements: 1 }),
      ),
    ).toBe(33);
    expect(
      progressPercent(
        makeProgress({ total_requirements: 8, satisfied_requirements: 8 }),
      ),
    ).toBe(100);
  });

  it("clamps over-satisfied progress to 100", () => {
    expect(
      progressPercent(
        makeProgress({ total_requirements: 2, satisfied_requirements: 5 }),
      ),
    ).toBe(100);
  });
});
