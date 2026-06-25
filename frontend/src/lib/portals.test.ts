import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import {
  DASHBOARD_ACTIVITY_LABELS,
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
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  REVIEW_STATUS_TONE,
  canDecideStatus,
  dashboardActivityLabel,
  groupReviewItemsByStatus,
  humanizeEventType,
  isNearLimit,
  isOrgLimitError,
  isPortalForbiddenError,
  isPortalNotEnabledError,
  limitLabel,
  planLabel,
  progressPercent,
  reviewNoteRequired,
  reviewNotifyDefault,
  reviewQueueCount,
  reviewStatusCounts,
  usagePercent,
} from "./portals";
import type {
  DashboardActivityItem,
  PortalCaseProgress,
  PortalReviewStatus,
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

describe("usagePercent", () => {
  it("reads an unlimited limit (null) as 0%", () => {
    expect(usagePercent(7, null)).toBe(0);
    expect(usagePercent(0, null)).toBe(0);
  });

  it("treats a zero limit as full when anything is used, else 0", () => {
    expect(usagePercent(1, 0)).toBe(100);
    expect(usagePercent(0, 0)).toBe(0);
  });

  it("computes a rounded percentage of the limit used", () => {
    expect(usagePercent(1, 4)).toBe(25);
    expect(usagePercent(1, 3)).toBe(33);
    expect(usagePercent(5, 10)).toBe(50);
  });

  it("clamps over-limit usage to 100 (never above)", () => {
    expect(usagePercent(12, 10)).toBe(100);
  });

  it("never returns NaN for negative limits", () => {
    const value = usagePercent(3, -2);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBe(100);
  });
});

describe("isNearLimit", () => {
  it("is never near an unlimited (null) limit", () => {
    expect(isNearLimit(9999, null)).toBe(false);
  });

  it("uses an 80% default threshold", () => {
    expect(isNearLimit(8, 10)).toBe(true);
    expect(isNearLimit(7, 10)).toBe(false);
    expect(isNearLimit(10, 10)).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(isNearLimit(5, 10, 0.5)).toBe(true);
    expect(isNearLimit(4, 10, 0.5)).toBe(false);
  });

  it("treats a zero limit as near only when something is used", () => {
    expect(isNearLimit(1, 0)).toBe(true);
    expect(isNearLimit(0, 0)).toBe(false);
  });
});

describe("limitLabel + planLabel", () => {
  it("labels every limit resource", () => {
    expect(limitLabel("members")).toBe("Team members");
    expect(limitLabel("portal_people")).toBe("People");
    expect(limitLabel("active_portal_cases")).toBe("Active cases");
    expect(limitLabel("active_document_requests")).toBe("Active requests");
    expect(limitLabel("active_sharing_rooms")).toBe("Active rooms");
  });

  it("gives friendly plan names", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("teams_beta")).toBe("Teams (beta)");
    expect(planLabel("teams")).toBe("Teams");
    expect(planLabel("enterprise")).toBe("Enterprise");
  });

  it("falls back to the raw plan string for unknown plans", () => {
    expect(planLabel("mystery")).toBe("mystery");
  });
});

describe("isOrgLimitError + isPortalNotEnabledError", () => {
  it("detects the org plan-limit error (403 + code)", () => {
    const err = new ApiError("Limit reached", 403, {
      code: "organization_plan_limit_exceeded",
      resource: "active_portal_cases",
      limit: 5,
      used: 5,
      plan: "teams",
      message: "You've reached your active case limit.",
    });
    expect(isOrgLimitError(err)).toBe(true);
    expect(isPortalNotEnabledError(err)).toBe(false);
  });

  it("detects the portal-not-enabled error (403 + code)", () => {
    const err = new ApiError("Not enabled", 403, {
      code: "portal_not_enabled",
      message: "B2B Portals are available on Teams.",
    });
    expect(isPortalNotEnabledError(err)).toBe(true);
    expect(isOrgLimitError(err)).toBe(false);
  });

  it("ignores a 403 with a different code", () => {
    const err = new ApiError("Nope", 403, { code: "plan_limit_exceeded" });
    expect(isOrgLimitError(err)).toBe(false);
    expect(isPortalNotEnabledError(err)).toBe(false);
  });

  it("ignores a non-403 status even with the right code", () => {
    const err = new ApiError("Nope", 503, {
      code: "organization_plan_limit_exceeded",
    });
    expect(isOrgLimitError(err)).toBe(false);
  });

  it("ignores plain errors and null data", () => {
    expect(isOrgLimitError(new Error("boom"))).toBe(false);
    expect(isPortalNotEnabledError(null)).toBe(false);
    expect(isOrgLimitError(new ApiError("x", 403, null))).toBe(false);
  });
});

describe("isPortalForbiddenError", () => {
  it("matches a plain 403 with no special code", () => {
    expect(isPortalForbiddenError(new ApiError("Forbidden", 403, null))).toBe(
      true,
    );
    expect(
      isPortalForbiddenError(new ApiError("Forbidden", 403, { detail: "no" })),
    ).toBe(true);
  });

  it("excludes the richer org-limit and not-enabled 403s", () => {
    expect(
      isPortalForbiddenError(
        new ApiError("x", 403, { code: "organization_plan_limit_exceeded" }),
      ),
    ).toBe(false);
    expect(
      isPortalForbiddenError(
        new ApiError("x", 403, { code: "portal_not_enabled" }),
      ),
    ).toBe(false);
  });

  it("ignores non-403 statuses and non-ApiErrors", () => {
    expect(isPortalForbiddenError(new ApiError("x", 404, null))).toBe(false);
    expect(isPortalForbiddenError(new Error("boom"))).toBe(false);
    expect(isPortalForbiddenError(null)).toBe(false);
  });
});

describe("review-status label + tone + order maps", () => {
  it("labels and tones every status in the order list", () => {
    for (const status of REVIEW_STATUS_ORDER) {
      expect(REVIEW_STATUS_LABELS[status]).toBeTruthy();
      expect(REVIEW_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("covers all seven review statuses with no duplicates", () => {
    expect(REVIEW_STATUS_ORDER).toHaveLength(7);
    expect(new Set(REVIEW_STATUS_ORDER).size).toBe(7);
  });

  it("maps outcomes to calm, correct tones", () => {
    expect(REVIEW_STATUS_TONE.accepted).toBe("success");
    expect(REVIEW_STATUS_TONE.rejected).toBe("danger");
    expect(REVIEW_STATUS_TONE.needs_replacement).toBe("warning");
    expect(REVIEW_STATUS_TONE.uploaded).toBe("info");
    expect(REVIEW_STATUS_TONE.under_review).toBe("warning");
    expect(REVIEW_STATUS_TONE.pending_upload).toBe("neutral");
  });
});

describe("canDecideStatus", () => {
  it("allows decisions on uploaded, under-review, and needs-replacement", () => {
    expect(canDecideStatus("uploaded")).toBe(true);
    expect(canDecideStatus("under_review")).toBe(true);
    expect(canDecideStatus("needs_replacement")).toBe(true);
  });

  it("blocks decisions on terminal/empty states", () => {
    expect(canDecideStatus("pending_upload")).toBe(false);
    expect(canDecideStatus("accepted")).toBe(false);
    expect(canDecideStatus("rejected")).toBe(false);
    expect(canDecideStatus("cancelled")).toBe(false);
  });
});

describe("reviewNoteRequired", () => {
  it("requires a note for reject and needs_replacement only", () => {
    expect(reviewNoteRequired("rejected")).toBe(true);
    expect(reviewNoteRequired("needs_replacement")).toBe(true);
    expect(reviewNoteRequired("accepted")).toBe(false);
  });
});

describe("reviewNotifyDefault", () => {
  it("defaults notify on for reject/needs_replacement, off for accept", () => {
    expect(reviewNotifyDefault("rejected")).toBe(true);
    expect(reviewNotifyDefault("needs_replacement")).toBe(true);
    expect(reviewNotifyDefault("accepted")).toBe(false);
  });
});

function reviewItem(status: PortalReviewStatus): { review_status: PortalReviewStatus } {
  return { review_status: status };
}

describe("reviewStatusCounts", () => {
  it("returns a complete record with zeros for absent statuses", () => {
    const counts = reviewStatusCounts([]);
    expect(counts.uploaded).toBe(0);
    expect(counts.accepted).toBe(0);
    expect(Object.keys(counts)).toHaveLength(7);
  });

  it("counts each status", () => {
    const counts = reviewStatusCounts([
      reviewItem("uploaded"),
      reviewItem("uploaded"),
      reviewItem("under_review"),
      reviewItem("accepted"),
    ]);
    expect(counts.uploaded).toBe(2);
    expect(counts.under_review).toBe(1);
    expect(counts.accepted).toBe(1);
    expect(counts.rejected).toBe(0);
  });
});

describe("reviewQueueCount", () => {
  it("counts only uploaded + under-review (the active work)", () => {
    expect(
      reviewQueueCount([
        reviewItem("uploaded"),
        reviewItem("under_review"),
        reviewItem("accepted"),
        reviewItem("rejected"),
        reviewItem("pending_upload"),
      ]),
    ).toBe(2);
  });

  it("is 0 when nothing is waiting", () => {
    expect(reviewQueueCount([reviewItem("accepted")])).toBe(0);
    expect(reviewQueueCount([])).toBe(0);
  });
});

const ALL_DASHBOARD_EVENTS = [
  "portal_person_created",
  "portal_case_created",
  "portal_case_request_created",
  "portal_review_started",
  "portal_document_accepted",
  "portal_document_rejected",
  "portal_document_needs_replacement",
  "portal_recipient_notified",
  "portal_case_pack_created",
  "portal_case_room_created",
  "portal_case_status_changed",
  "portal_case_archived",
  "organization_plan_changed",
  "organization_portal_limit_reached",
] as const;

function makeActivity(
  overrides: Partial<DashboardActivityItem> = {},
): DashboardActivityItem {
  return {
    id: 1,
    event_type: "portal_case_created",
    severity: "info",
    object_label: "Student visa application",
    related_object_label: "",
    actor_label: "Amina Diallo",
    created_at: "2026-06-25T10:00:00Z",
    ...overrides,
  };
}

describe("dashboard activity label map", () => {
  it("labels every known portal/org event", () => {
    for (const event of ALL_DASHBOARD_EVENTS) {
      expect(DASHBOARD_ACTIVITY_LABELS[event]).toBeTruthy();
    }
  });

  it("uses calm, correct wording for key events", () => {
    expect(DASHBOARD_ACTIVITY_LABELS.portal_document_accepted).toBe(
      "Document accepted",
    );
    expect(DASHBOARD_ACTIVITY_LABELS.portal_document_needs_replacement).toBe(
      "Replacement requested",
    );
    expect(DASHBOARD_ACTIVITY_LABELS.organization_portal_limit_reached).toBe(
      "Plan limit reached",
    );
  });
});

describe("humanizeEventType", () => {
  it("title-cases an unknown snake_case event and drops the prefix", () => {
    expect(humanizeEventType("portal_case_reopened")).toBe("Case reopened");
    expect(humanizeEventType("organization_seat_added")).toBe("Seat added");
  });

  it("handles a bare token and never returns empty for a non-empty key", () => {
    expect(humanizeEventType("something")).toBe("Something");
    expect(humanizeEventType("portal_")).toBe("portal_");
  });
});

describe("dashboardActivityLabel", () => {
  it("returns the mapped label + the safe object label for known events", () => {
    const result = dashboardActivityLabel(
      makeActivity({ event_type: "portal_document_accepted" }),
    );
    expect(result.label).toBe("Document accepted");
    expect(result.objectLabel).toBe("Student visa application");
  });

  it("falls back to a humanized label for unknown events", () => {
    const result = dashboardActivityLabel(
      makeActivity({ event_type: "portal_mystery_thing" }),
    );
    expect(result.label).toBe("Mystery thing");
  });
});

describe("groupReviewItemsByStatus", () => {
  it("groups in canonical order and drops empty groups", () => {
    const groups = groupReviewItemsByStatus([
      reviewItem("accepted"),
      reviewItem("uploaded"),
      reviewItem("uploaded"),
    ]);
    // Order: uploaded comes before accepted in REVIEW_STATUS_ORDER.
    expect(groups.map((g) => g.status)).toEqual(["uploaded", "accepted"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it("returns an empty array for no items", () => {
    expect(groupReviewItemsByStatus([])).toEqual([]);
  });
});
