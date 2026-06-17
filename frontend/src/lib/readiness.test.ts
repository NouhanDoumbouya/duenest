import { describe, expect, it } from "vitest";

import {
  buildFirstLifeRadarPreview,
  computeReadinessChecklist,
  formatExpiryRelative,
  formatOnboardingProgress,
  getDefaultCategoryForDocument,
  getDefaultReminderForDocument,
  getDocumentSuggestionsForGoal,
  getOnboardingGoalOptions,
  getOnboardingRedirect,
  getQuickStartGoals,
  getPersonalizedNextAction,
  mergeReadinessMetadata,
  readReadinessMetadata,
  shouldShowOnboarding,
  shouldShowReadinessChecklist,
} from "./readiness";
import type { OnboardingState } from "@/types/onboarding";

function makeState(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    id: 1,
    user: 1,
    has_completed_document_onboarding: false,
    first_document_created_at: null,
    first_file_uploaded_at: null,
    first_expiry_date_added_at: null,
    first_reminder_created_at: null,
    first_share_link_created_at: null,
    first_checklist_created_at: null,
    checklist_completed_at: null,
    dismissed_onboarding_at: null,
    metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("goal options & suggestions", () => {
  it("returns all eight goals with unique keys", () => {
    const opts = getOnboardingGoalOptions();
    expect(opts).toHaveLength(8);
    expect(new Set(opts.map((o) => o.key)).size).toBe(8);
  });

  it("tailors suggestions to the goal", () => {
    expect(getDocumentSuggestionsForGoal("international_student")).toContain("Passport");
    expect(getDocumentSuggestionsForGoal("applications").join(" ")).toMatch(/Transcript/);
    expect(getDocumentSuggestionsForGoal("subscriptions").join(" ")).toMatch(/Subscription|bill/i);
  });
});

describe("getDefaultCategoryForDocument", () => {
  it("maps passport to Identity (or Travel for travellers)", () => {
    expect(getDefaultCategoryForDocument("My Passport")).toBe("Identity");
    expect(getDefaultCategoryForDocument("Passport", "travel")).toBe("Travel");
  });
  it("maps visa, insurance, transcript", () => {
    expect(getDefaultCategoryForDocument("UK Visa")).toBe("Travel");
    expect(getDefaultCategoryForDocument("Health insurance")).toBe("Insurance");
    expect(getDefaultCategoryForDocument("University transcript")).toBe("Education");
  });
  it("falls back to goal then Other", () => {
    expect(getDefaultCategoryForDocument("random thing", "subscriptions")).toBe("Subscription");
    expect(getDefaultCategoryForDocument("random thing")).toBe("Other");
  });
});

describe("getDefaultReminderForDocument", () => {
  it("uses type-aware defaults", () => {
    expect(getDefaultReminderForDocument("Passport")).toEqual({ daysBefore: 90, expires: true });
    expect(getDefaultReminderForDocument("Car insurance")).toEqual({ daysBefore: 30, expires: true });
    expect(getDefaultReminderForDocument("Degree certificate")).toEqual({ daysBefore: null, expires: false });
  });
});

describe("formatExpiryRelative", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("handles days, months, years, past, today", () => {
    expect(formatExpiryRelative("2026-01-01T00:00:00Z", now)).toBe("today");
    expect(formatExpiryRelative("2026-01-10T00:00:00Z", now)).toBe("in 9 days");
    expect(formatExpiryRelative("2026-09-01T00:00:00Z", now)).toMatch(/in 8 months/);
    expect(formatExpiryRelative("2028-01-01T00:00:00Z", now)).toMatch(/year/);
    expect(formatExpiryRelative("2025-01-01T00:00:00Z", now)).toMatch(/expired/);
  });
});

describe("buildFirstLifeRadarPreview", () => {
  it("reflects expiry + reminder presence", () => {
    const p = buildFirstLifeRadarPreview({
      name: "Passport",
      category: "Identity",
      expiryDate: "2026-09-01T00:00:00Z",
      reminderDaysBefore: 90,
    });
    expect(p.hasExpiry).toBe(true);
    expect(p.hasReminder).toBe(true);
    expect(p.reminderStatus).toMatch(/90 days/);
  });
  it("handles no expiry / no reminder", () => {
    const p = buildFirstLifeRadarPreview({ name: "Transcript", category: "Education" });
    expect(p.hasExpiry).toBe(false);
    expect(p.expiryStatus).toBe("no expiry date");
    expect(p.reminderStatus).toMatch(/later/);
  });
});

describe("getPersonalizedNextAction", () => {
  it("gives exactly one action per goal", () => {
    expect(getPersonalizedNextAction("international_student").href).toBe("/dashboard/bundles");
    expect(getPersonalizedNextAction("subscriptions").href).toBe("/dashboard/subscriptions");
    expect(getPersonalizedNextAction("emergency").href).toBe("/dashboard/emergency");
    expect(getPersonalizedNextAction("vault").href).toBe("/dashboard/files");
    expect(getPersonalizedNextAction(null).href).toBe("/dashboard");
  });
});

describe("routing helpers", () => {
  it("shows onboarding only for fresh, non-dismissed, doc-less users", () => {
    expect(shouldShowOnboarding(makeState())).toBe(true);
    expect(shouldShowOnboarding(makeState({ has_completed_document_onboarding: true }))).toBe(false);
    expect(shouldShowOnboarding(makeState({ dismissed_onboarding_at: "2026-01-02T00:00:00Z" }))).toBe(false);
    expect(shouldShowOnboarding(makeState({ first_document_created_at: "2026-01-02T00:00:00Z" }))).toBe(false);
    expect(shouldShowOnboarding(null)).toBe(false);
  });

  it("getOnboardingRedirect returns the route or null", () => {
    expect(getOnboardingRedirect(makeState())).toBe("/dashboard/onboarding");
    expect(getOnboardingRedirect(makeState({ has_completed_document_onboarding: true }))).toBeNull();
  });

  it("hides checklist when dismissed or complete", () => {
    expect(shouldShowReadinessChecklist(makeState(), null)).toBe(true);
    expect(
      shouldShowReadinessChecklist(
        makeState({ metadata: { readiness_checklist_dismissed: true } }),
        null,
      ),
    ).toBe(false);
  });
});

describe("progress + metadata", () => {
  it("formats and clamps progress", () => {
    expect(formatOnboardingProgress(2, 5)).toBe("Step 2 of 5");
    expect(formatOnboardingProgress(9, 5)).toBe("Step 5 of 5");
    expect(formatOnboardingProgress(0, 5)).toBe("Step 1 of 5");
  });

  it("round-trips readiness metadata without clobbering other keys", () => {
    const merged = mergeReadinessMetadata(
      { document_onboarding_completed_at: "x" },
      { goal: "travel", current_step: "details" },
    );
    expect(merged.document_onboarding_completed_at).toBe("x");
    expect(merged.readiness_goal).toBe("travel");
    const read = readReadinessMetadata(makeState({ metadata: merged }));
    expect(read.goal).toBe("travel");
    expect(read.current_step).toBe("details");
  });
});

describe("computeReadinessChecklist", () => {
  it("reflects real completion signals", () => {
    const items = computeReadinessChecklist(
      makeState({ first_document_created_at: "2026-01-02T00:00:00Z" }),
      null,
    );
    expect(items.find((i) => i.key === "first_document")?.completed).toBe(true);
    expect(items.find((i) => i.key === "try_safesend")?.completed).toBe(false);
    expect(items).toHaveLength(6);
  });
});

describe("getQuickStartGoals", () => {
  it("offers life goals with valid dashboard routes and unique keys", () => {
    const goals = getQuickStartGoals();
    expect(goals.length).toBeGreaterThanOrEqual(4);
    expect(new Set(goals.map((g) => g.key)).size).toBe(goals.length);
    for (const g of goals) {
      expect(g.href.startsWith("/dashboard/")).toBe(true);
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.cta.length).toBeGreaterThan(0);
    }
  });

  it("keeps the default (primary) set to four so mobile stays calm", () => {
    const primary = getQuickStartGoals().filter((g) => g.primary);
    expect(primary).toHaveLength(4);
    expect(primary.map((g) => g.key)).toContain("scan");
    expect(primary.map((g) => g.key)).toContain("document");
  });
});
