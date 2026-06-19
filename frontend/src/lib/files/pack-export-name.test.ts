import { describe, expect, it } from "vitest";

import {
  cleanPackName,
  MAX_PACK_NAME_LEN,
  suggestPackExportName,
} from "./pack-export-name";

describe("cleanPackName", () => {
  it("strips unsafe characters and collapses whitespace/hyphens to underscores", () => {
    expect(cleanPackName("Scholarship / Application - 2026!")).toBe(
      "Scholarship_Application_2026",
    );
  });

  it("preserves case", () => {
    expect(cleanPackName("Visa Application Malaysia")).toBe(
      "Visa_Application_Malaysia",
    );
  });

  it("trims stray underscores and falls back when empty", () => {
    expect(cleanPackName("***")).toBe("Pack");
    expect(cleanPackName("  _weird_  ")).toBe("weird");
  });

  it("caps length", () => {
    expect(cleanPackName("a".repeat(200)).length).toBe(MAX_PACK_NAME_LEN);
  });
});

describe("suggestPackExportName", () => {
  const now = new Date("2026-06-19T00:00:00Z");

  it("appends the current year when the title has none", () => {
    expect(suggestPackExportName("Scholarship Application", null, now)).toBe(
      "Scholarship_Application_2026",
    );
  });

  it("uses the target date year when available", () => {
    expect(
      suggestPackExportName("Visa Application", "2027-03-01", now),
    ).toBe("Visa_Application_2027");
  });

  it("does not duplicate a year already in the title", () => {
    expect(suggestPackExportName("UK visa renewal 2026", null, now)).toBe(
      "UK_visa_renewal_2026",
    );
  });
});
