import { describe, expect, it } from "vitest";

import { annualSavingsPercent, asArray, formatMoney } from "./billing";

describe("formatMoney", () => {
  it("formats USD minor units", () => {
    expect(formatMoney(599)).toBe("$5.99");
    expect(formatMoney(5900)).toBe("$59");
    expect(formatMoney(0)).toBe("$0");
  });
  it("uses RM for MYR", () => {
    expect(formatMoney(1490, "myr")).toBe("RM14.90");
  });
  it("returns a dash for null", () => {
    expect(formatMoney(null)).toBe("—");
  });
});

describe("annualSavingsPercent", () => {
  it("computes savings of yearly vs 12x monthly", () => {
    // $5.99/mo => $71.88/yr; $59/yr => ~18% off
    expect(annualSavingsPercent(599, 5900)).toBe(18);
  });
  it("returns null when no saving or missing prices", () => {
    expect(annualSavingsPercent(599, null)).toBeNull();
    expect(annualSavingsPercent(500, 6000)).toBeNull();
  });
});

describe("asArray", () => {
  it("passes through arrays", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
  });
  it("unwraps paginated responses", () => {
    expect(asArray({ results: [1, 2] })).toEqual([1, 2]);
  });
});
