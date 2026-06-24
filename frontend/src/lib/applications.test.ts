import { describe, expect, it } from "vitest";

import {
  applicationStatusTone,
  deadlineStateLabel,
  deadlineStateTone,
} from "./applications";

describe("applicationStatusTone", () => {
  it("maps success statuses", () => {
    expect(applicationStatusTone("ready_to_submit")).toBe("success");
    expect(applicationStatusTone("accepted")).toBe("success");
  });

  it("maps in-flight statuses to info", () => {
    expect(applicationStatusTone("submitted")).toBe("info");
    expect(applicationStatusTone("under_review")).toBe("info");
    expect(applicationStatusTone("interview")).toBe("info");
  });

  it("maps attention statuses to warning", () => {
    expect(applicationStatusTone("documents_missing")).toBe("warning");
    expect(applicationStatusTone("renewal_needed")).toBe("warning");
  });

  it("maps rejection to danger", () => {
    expect(applicationStatusTone("rejected")).toBe("danger");
  });

  it("falls back to neutral", () => {
    expect(applicationStatusTone("planning")).toBe("neutral");
    expect(applicationStatusTone("withdrawn")).toBe("neutral");
  });
});

describe("deadlineStateTone", () => {
  it("maps deadline states to tones", () => {
    expect(deadlineStateTone("overdue")).toBe("danger");
    expect(deadlineStateTone("urgent")).toBe("warning");
    expect(deadlineStateTone("soon")).toBe("info");
    expect(deadlineStateTone("completed")).toBe("success");
    expect(deadlineStateTone("upcoming")).toBe("neutral");
    expect(deadlineStateTone("no_deadline")).toBe("neutral");
  });
});

describe("deadlineStateLabel", () => {
  it("labels no deadline", () => {
    expect(deadlineStateLabel("no_deadline", null)).toBe("No deadline");
  });

  it("labels overdue with absolute days", () => {
    expect(deadlineStateLabel("overdue", -3)).toBe("Overdue by 3d");
    expect(deadlineStateLabel("overdue", null)).toBe("Overdue");
  });

  it("labels upcoming windows with remaining days", () => {
    expect(deadlineStateLabel("urgent", 2)).toBe("In 2d");
    expect(deadlineStateLabel("soon", 10)).toBe("In 10d");
    expect(deadlineStateLabel("upcoming", null)).toBe("Upcoming");
  });

  it("labels completed", () => {
    expect(deadlineStateLabel("completed", null)).toBe("Completed");
  });
});
