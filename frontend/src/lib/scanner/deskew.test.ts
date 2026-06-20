import { describe, expect, it } from "vitest";

import { estimateSkewAngle, rotateImageData } from "./deskew";

/**
 * Build a page of horizontal "text lines" tilted by `deg` degrees: a pixel is
 * ink when its row index in the tilted frame falls on a line band. The
 * projection at the matching angle should pile that ink into sharp peaks.
 */
function tiltedLines(w: number, h: number, deg: number): Uint8ClampedArray {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = Math.round(y * cos + x * sin);
      const ink = r % 12 < 2; // line bands every 12 px
      const v = ink ? 20 : 235;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("estimateSkewAngle", () => {
  it("recovers a known skew angle", () => {
    const est = estimateSkewAngle(tiltedLines(160, 160, 5), 160, 160);
    expect(est).toBeGreaterThan(3.5);
    expect(est).toBeLessThan(6.5);
  });

  it("recovers a negative skew", () => {
    const est = estimateSkewAngle(tiltedLines(160, 160, -4), 160, 160);
    expect(est).toBeLessThan(-2.5);
    expect(est).toBeGreaterThan(-5.5);
  });

  it("returns 0 for a clean, straight page (no needless rotation)", () => {
    // Perfectly horizontal lines → already straight.
    const est = estimateSkewAngle(tiltedLines(160, 160, 0), 160, 160);
    expect(est).toBe(0);
  });
});

describe("rotateImageData", () => {
  it("expands the canvas and keeps pixels in range", () => {
    const w = 40;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4).fill(200);
    const out = rotateImageData(data, w, h, 10);
    expect(out.width).toBeGreaterThanOrEqual(w);
    expect(out.height).toBeGreaterThanOrEqual(h);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBeGreaterThanOrEqual(0);
      expect(out.data[i]).toBeLessThanOrEqual(255);
    }
  });

  it("is a near-identity at 0°", () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = 128;
      data[i + 3] = 255;
    }
    const out = rotateImageData(data, w, h, 0);
    expect(out.width).toBe(w);
    expect(out.height).toBe(h);
    expect(out.data[(8 * w + 8) * 4]).toBeCloseTo(128, 0);
  });
});
