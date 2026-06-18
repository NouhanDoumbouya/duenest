import { describe, expect, it } from "vitest";

import {
  cleanFilename,
  MAX_BASENAME_LEN,
  suggestFilename,
} from "./filename";

describe("cleanFilename", () => {
  it("strips unsafe characters and collapses whitespace to underscores", () => {
    expect(cleanFilename("My  Passport / 2026!")).toBe("My_Passport_2026");
  });

  it("trims stray underscores and hyphens", () => {
    expect(cleanFilename("__visa--")).toBe("visa");
  });

  it("falls back when nothing usable remains", () => {
    expect(cleanFilename("///", "Scan")).toBe("Scan");
    expect(cleanFilename("   ")).toBe("Scan");
  });

  it("caps length", () => {
    expect(cleanFilename("a".repeat(MAX_BASENAME_LEN + 20))).toHaveLength(
      MAX_BASENAME_LEN,
    );
  });
});

describe("suggestFilename", () => {
  const fixed = new Date("2026-06-18T00:00:00Z");

  it("appends the year when requested", () => {
    expect(suggestFilename("Passport", { withYear: true }, fixed)).toBe(
      "Passport_2026",
    );
  });

  it("appends the full date when requested (date wins over year)", () => {
    expect(
      suggestFilename("Visa", { withYear: true, withDate: true }, fixed),
    ).toBe("Visa_2026-06-18");
  });

  it("returns just the cleaned type with no options", () => {
    expect(suggestFilename("ID", {}, fixed)).toBe("ID");
  });
});
