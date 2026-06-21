import { describe, expect, it } from "vitest";

import { getUseCase, USE_CASES } from "@/lib/use-cases";

describe("use-case content", () => {
  it("has unique, url-safe slugs", () => {
    const slugs = USE_CASES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("every use case has the required content fields", () => {
    for (const u of USE_CASES) {
      expect(u.title.length).toBeGreaterThan(0);
      expect(u.metaTitle.length).toBeGreaterThan(0);
      expect(u.metaDescription.length).toBeGreaterThan(0);
      expect(u.pain.length).toBeGreaterThan(0);
      expect(u.solution.length).toBeGreaterThan(0);
      expect(u.workflow.length).toBeGreaterThanOrEqual(3);
      expect(u.features.length).toBeGreaterThan(0);
      expect(u.trustNote.length).toBeGreaterThan(0);
    }
  });

  it("makes no dishonest guarantees in any copy", () => {
    const banned = /guaranteed|legally binding|100%|official requirement/i;
    for (const u of USE_CASES) {
      const blob = [u.title, u.solution, u.pain, u.trustNote, ...u.workflow].join(" ");
      expect(blob).not.toMatch(banned);
    }
  });

  it("resolves a use case by slug and returns undefined for unknown", () => {
    expect(getUseCase("students")?.slug).toBe("students");
    expect(getUseCase("nope")).toBeUndefined();
  });
});
