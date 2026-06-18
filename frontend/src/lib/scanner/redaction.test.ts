import { describe, expect, it } from "vitest";

import { isMeaningfulRect, normalizeRect } from "./redaction";

describe("normalizeRect", () => {
  it("orders points regardless of drag direction", () => {
    const fromTopLeft = normalizeRect(0.2, 0.2, 0.6, 0.5);
    const fromBottomRight = normalizeRect(0.6, 0.5, 0.2, 0.2);
    expect(fromTopLeft).toEqual(fromBottomRight);
    expect(fromTopLeft.x).toBeCloseTo(0.2);
    expect(fromTopLeft.y).toBeCloseTo(0.2);
    expect(fromTopLeft.w).toBeCloseTo(0.4);
    expect(fromTopLeft.h).toBeCloseTo(0.3);
  });

  it("clamps points to the 0..1 page bounds", () => {
    const rect = normalizeRect(-0.5, -0.2, 1.4, 1.1);
    expect(rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("produces a zero-size rect for a point", () => {
    const rect = normalizeRect(0.3, 0.3, 0.3, 0.3);
    expect(rect.w).toBe(0);
    expect(rect.h).toBe(0);
  });
});

describe("isMeaningfulRect", () => {
  it("rejects tiny/stray rects", () => {
    expect(isMeaningfulRect({ x: 0.5, y: 0.5, w: 0.005, h: 0.005 })).toBe(false);
  });

  it("accepts a deliberate rect", () => {
    expect(isMeaningfulRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.05 })).toBe(true);
  });
});
