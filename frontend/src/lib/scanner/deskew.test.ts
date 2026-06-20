import { describe, expect, it } from "vitest";

import {
  bestDeskewDegrees,
  deskewImageData,
  rotateImageData,
} from "./deskew";

/** A page of "text lines" tilted by `deg` degrees. */
function tiltedLines(w: number, h: number, deg: number): Uint8ClampedArray {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = Math.round(y * cos + x * sin);
      const ink = r % 12 < 2;
      const v = ink ? 20 : 235;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("bestDeskewDegrees", () => {
  it("leaves a straight page alone", () => {
    expect(bestDeskewDegrees(tiltedLines(200, 200, 0), 200, 200)).toBe(0);
  });

  it("detects a tilted page", () => {
    expect(bestDeskewDegrees(tiltedLines(200, 200, 5), 200, 200)).not.toBe(0);
  });

  it("corrects in opposite directions for opposite tilts", () => {
    const a = bestDeskewDegrees(tiltedLines(200, 200, 5), 200, 200);
    const b = bestDeskewDegrees(tiltedLines(200, 200, -5), 200, 200);
    // Whatever the rotation convention, the two corrections must oppose.
    expect(a * b).toBeLessThan(0);
  });

  it("reduces the residual skew after straightening (never doubles it)", () => {
    const tilted = tiltedLines(200, 200, 5);
    const before = Math.abs(bestDeskewDegrees(tilted, 200, 200));
    const fixed = deskewImageData(tilted, 200, 200);
    const after = Math.abs(
      bestDeskewDegrees(fixed.data, fixed.width, fixed.height),
    );
    expect(after).toBeLessThan(before);
  });
});

describe("deskewImageData / rotateImageData", () => {
  it("returns the page unchanged when straight", () => {
    const out = deskewImageData(tiltedLines(200, 200, 0), 200, 200);
    expect(out.width).toBe(200);
    expect(out.height).toBe(200);
  });

  it("rotate expands the canvas and keeps pixels in range", () => {
    const w = 40;
    const h = 30;
    const out = rotateImageData(new Uint8ClampedArray(w * h * 4).fill(200), w, h, 8);
    expect(out.width).toBeGreaterThanOrEqual(w);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBeGreaterThanOrEqual(0);
      expect(out.data[i]).toBeLessThanOrEqual(255);
    }
  });
});
