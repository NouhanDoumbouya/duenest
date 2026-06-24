import { describe, expect, it } from "vitest";

import {
  INBOX_STATUS_LABELS,
  MAGIC_INBOX_AI_CREDITS,
  SUGGESTION_PRIORITY_LABELS,
  analyzeReasonMessage,
  applySkippedReasonMessage,
  groupSuggestionsByPriority,
  isAnalyzeUpgradeReason,
  isAnalyzeUsageReason,
  magicInboxCreditNotice,
  routeDestination,
  sortSuggestionsByPriority,
} from "./magic-inbox";
import type { Suggestion } from "@/types/magic-inbox";

function suggestion(
  id: string,
  priority: Suggestion["priority"],
  type: Suggestion["type"] = "save_to_vault",
): Suggestion {
  return {
    id,
    type,
    label: `Suggestion ${id}`,
    description: "",
    priority,
  };
}

describe("magicInboxCreditNotice / MAGIC_INBOX_AI_CREDITS", () => {
  it("states the fixed 3-credit cost", () => {
    expect(magicInboxCreditNotice()).toBe(
      "Smart analysis uses 3 AI credits after successful analysis.",
    );
    expect(MAGIC_INBOX_AI_CREDITS).toBe(3);
  });
});

describe("analyzeReasonMessage", () => {
  it("maps known blocked reasons", () => {
    expect(analyzeReasonMessage("consent_required")).toContain("Turn on AI");
    expect(analyzeReasonMessage("ai_feature_not_in_plan")).toBe(
      "Smart analysis is a Pro feature.",
    );
    expect(analyzeReasonMessage("ai_credits_exhausted")).toBe(
      "You've used all your AI credits for this period.",
    );
    expect(analyzeReasonMessage("budget")).toContain("paused");
    expect(analyzeReasonMessage("not_configured")).toBe(
      "AI isn't configured yet.",
    );
  });

  it("falls back for unknown / null reasons", () => {
    expect(analyzeReasonMessage("error")).toContain("standard analysis");
    expect(analyzeReasonMessage(null)).toContain("standard analysis");
    expect(analyzeReasonMessage(undefined)).toContain("standard analysis");
  });
});

describe("isAnalyzeUpgradeReason / isAnalyzeUsageReason", () => {
  it("flags plan-gated reasons for upgrade", () => {
    expect(isAnalyzeUpgradeReason("ai_feature_not_in_plan")).toBe(true);
    expect(isAnalyzeUpgradeReason("budget")).toBe(false);
    expect(isAnalyzeUpgradeReason(null)).toBe(false);
  });

  it("flags usage/budget reasons", () => {
    expect(isAnalyzeUsageReason("ai_credits_exhausted")).toBe(true);
    expect(isAnalyzeUsageReason("budget")).toBe(true);
    expect(isAnalyzeUsageReason("ai_feature_not_in_plan")).toBe(false);
  });
});

describe("groupSuggestionsByPriority", () => {
  const suggestions: Suggestion[] = [
    suggestion("a", "low"),
    suggestion("b", "high"),
    suggestion("c", "medium"),
    suggestion("d", "high"),
  ];

  it("orders buckets high → medium → low and omits empty ones", () => {
    const grouped = groupSuggestionsByPriority(suggestions);
    expect(grouped.map((g) => g.priority)).toEqual(["high", "medium", "low"]);
    expect(grouped[0].items.map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("omits buckets that have no items", () => {
    const grouped = groupSuggestionsByPriority([suggestion("x", "medium")]);
    expect(grouped.map((g) => g.priority)).toEqual(["medium"]);
  });

  it("returns nothing for empty/undefined input", () => {
    expect(groupSuggestionsByPriority([])).toEqual([]);
    expect(groupSuggestionsByPriority(undefined)).toEqual([]);
  });
});

describe("sortSuggestionsByPriority", () => {
  it("sorts high → medium → low and preserves order within a bucket", () => {
    const input: Suggestion[] = [
      suggestion("a", "low"),
      suggestion("b", "high"),
      suggestion("c", "low"),
      suggestion("d", "high"),
      suggestion("e", "medium"),
    ];
    const sorted = sortSuggestionsByPriority(input);
    expect(sorted.map((s) => s.id)).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [suggestion("a", "low"), suggestion("b", "high")];
    const snapshot = input.map((s) => s.id);
    sortSuggestionsByPriority(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });
});

describe("applySkippedReasonMessage", () => {
  it("maps known skip reasons to friendly copy", () => {
    expect(applySkippedReasonMessage("already_applied")).toContain(
      "Already done",
    );
    expect(applySkippedReasonMessage("missing_data")).toContain("more detail");
    expect(applySkippedReasonMessage("continue_elsewhere")).toContain(
      "linked tool",
    );
  });

  it("falls back for unknown reasons", () => {
    expect(applySkippedReasonMessage("mystery")).toBe("Skipped.");
  });
});

describe("routeDestination", () => {
  it("maps the requirement importer route to a bundle", () => {
    expect(
      routeDestination({ route: "requirement_link_import", bundle_id: 7 }),
    ).toEqual({
      href: "/dashboard/bundles/7",
      label: "Continue in the requirement importer",
    });
  });

  it("maps the document generator route to an application", () => {
    expect(
      routeDestination({
        route: "application_document_generator",
        application_id: 12,
      }),
    ).toEqual({
      href: "/dashboard/applications/12",
      label: "Continue in the document generator",
    });
  });

  it("falls back to the list route when no id is present", () => {
    expect(routeDestination({ route: "requirement_link_import" })?.href).toBe(
      "/dashboard/bundles",
    );
    expect(
      routeDestination({ route: "application_document_generator" })?.href,
    ).toBe("/dashboard/applications");
  });

  it("returns null for unknown routes", () => {
    expect(routeDestination({ route: "something_else" })).toBeNull();
  });
});

describe("label maps", () => {
  it("labels every status", () => {
    expect(INBOX_STATUS_LABELS.new).toBe("New");
    expect(INBOX_STATUS_LABELS.failed).toBe("Failed");
  });

  it("labels every priority bucket", () => {
    expect(SUGGESTION_PRIORITY_LABELS.high).toBe("Recommended");
    expect(SUGGESTION_PRIORITY_LABELS.low).toBe("Optional");
  });
});
