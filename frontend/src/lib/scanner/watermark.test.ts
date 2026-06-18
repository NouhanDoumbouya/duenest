import { describe, expect, it } from "vitest";

import {
  MAX_WATERMARK_LEN,
  sanitizeWatermarkText,
  strengthAlpha,
  WATERMARK_PRESETS,
} from "./watermark";

describe("sanitizeWatermarkText", () => {
  it("trims and collapses internal whitespace", () => {
    expect(sanitizeWatermarkText("  For   review   only  ")).toBe(
      "For review only",
    );
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeWatermarkText("   \t  ")).toBe("");
  });

  it("replaces control characters with a space and collapses them", () => {
    const withControls = `a${String.fromCharCode(7)}${String.fromCharCode(127)}b`;
    expect(sanitizeWatermarkText(withControls)).toBe("a b");
  });

  it("caps length at MAX_WATERMARK_LEN", () => {
    const long = "x".repeat(MAX_WATERMARK_LEN + 25);
    expect(sanitizeWatermarkText(long)).toHaveLength(MAX_WATERMARK_LEN);
  });

  it("preserves ordinary punctuation and digits", () => {
    expect(sanitizeWatermarkText("Visa 2026 — copy")).toBe("Visa 2026 — copy");
  });
});

describe("strengthAlpha", () => {
  it("increases monotonically from light to strong", () => {
    expect(strengthAlpha("light")).toBeLessThan(strengthAlpha("medium"));
    expect(strengthAlpha("medium")).toBeLessThan(strengthAlpha("strong"));
  });

  it("stays within a readable, non-destructive range", () => {
    for (const s of ["light", "medium", "strong"] as const) {
      expect(strengthAlpha(s)).toBeGreaterThan(0);
      expect(strengthAlpha(s)).toBeLessThanOrEqual(0.35);
    }
  });
});

describe("WATERMARK_PRESETS", () => {
  it("offers the expected non-empty labels", () => {
    expect(WATERMARK_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of WATERMARK_PRESETS) {
      expect(sanitizeWatermarkText(preset)).toBe(preset);
    }
  });
});
