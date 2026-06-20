import { describe, expect, it } from "vitest";

import {
  adaptiveMeanBinarizeInPlace,
  boxMean,
  flattenIlluminationInPlace,
  grayWorldWhiteBalanceInPlace,
  localContrastInPlace,
  otsuThreshold,
  toLuminance,
  unsharpMaskInPlace,
} from "./enhance";

/** Std of the luminance over an 8×8 region at (rx,ry). */
function tileStd(
  data: Uint8ClampedArray,
  w: number,
  rx: number,
  ry: number,
): number {
  const vals: number[] = [];
  for (let y = ry; y < ry + 8; y += 1) {
    for (let x = rx; x < rx + 8; x += 1) {
      const i = (y * w + x) * 4;
      vals.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
  }
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

/** Build an RGBA buffer from a per-pixel gray function. */
function grayImage(
  w: number,
  h: number,
  value: (x: number, y: number) => number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const v = value(x, y);
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("boxMean", () => {
  it("returns the constant value for a uniform plane", () => {
    const w = 8;
    const h = 8;
    const gray = new Float32Array(w * h).fill(120);
    const mean = boxMean(gray, w, h, 2);
    for (const m of mean) expect(m).toBeCloseTo(120, 4);
  });
});

describe("adaptiveMeanBinarizeInPlace", () => {
  // Background ramps dark→light across the width; sparse "text" columns sit a
  // fixed amount darker than their local background. A single global threshold
  // cannot separate them (dim background is darker than bright text); adaptive
  // local thresholding must recover text on BOTH the dim and bright sides.
  const w = 48;
  const h = 10;
  const bgAt = (x: number) => 60 + Math.round((x / (w - 1)) * 180); // 60..240
  const isText = (x: number) => x % 6 === 3;
  const value = (x: number) => (isText(x) ? bgAt(x) - 45 : bgAt(x));

  it("a global threshold provably mislabels this image", () => {
    const t = otsuThreshold(grayImage(w, h, value));
    // Dim background (60) falls below the global threshold (→ wrongly black),
    // while bright text (~195) sits above it (→ wrongly white).
    expect(60).toBeLessThan(t);
    expect(bgAt(w - 1) - 45).toBeGreaterThan(t);
  });

  it("recovers text as black and background as white on both sides", () => {
    const data = grayImage(w, h, value);
    adaptiveMeanBinarizeInPlace(data, w, h, { radius: 6, c: 10 });
    const px = (x: number) => data[(2 * w + x) * 4];
    // Text columns → black; background columns → white, dim side and bright side.
    expect(px(3)).toBe(0); // text, dim side
    expect(px(45)).toBe(0); // text, bright side
    expect(px(1)).toBe(255); // background, dim side
    expect(px(46)).toBe(255); // background, bright side
  });

  it("produces only pure black or white", () => {
    const data = grayImage(w, h, value);
    adaptiveMeanBinarizeInPlace(data, w, h);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i] === 0 || data[i] === 255).toBe(true);
    }
  });
});

describe("flattenIlluminationInPlace", () => {
  it("evens out a shadow gradient (reduces background spread)", () => {
    const w = 40;
    const h = 16;
    const value = (x: number) => 70 + Math.round((x / (w - 1)) * 150); // 70..220
    const data = grayImage(w, h, value);
    const before = data[(8 * w + 0) * 4]; // dim left edge
    flattenIlluminationInPlace(data, w, h);
    const after = data[(8 * w + 0) * 4];
    // The dim side is lifted toward white.
    expect(after).toBeGreaterThan(before);
    // Spread between the dim and bright sides shrinks.
    const left = data[(8 * w + 0) * 4];
    const right = data[(8 * w + (w - 1)) * 4];
    expect(Math.abs(right - left)).toBeLessThan(150);
  });

  it("leaves an already even, bright scan untouched", () => {
    const w = 20;
    const h = 20;
    const data = grayImage(w, h, () => 240);
    const copy = data.slice();
    flattenIlluminationInPlace(data, w, h);
    expect(Array.from(data)).toEqual(Array.from(copy));
  });
});

describe("grayWorldWhiteBalanceInPlace", () => {
  it("neutralizes a warm color cast", () => {
    const w = 8;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200; // R high
      data[i + 1] = 160; // G
      data[i + 2] = 120; // B low (warm cast)
      data[i + 3] = 255;
    }
    grayWorldWhiteBalanceInPlace(data);
    // Channel means converge toward each other.
    const spread = Math.max(data[0], data[1], data[2]) - Math.min(data[0], data[1], data[2]);
    expect(spread).toBeLessThan(80);
  });
});

describe("otsuThreshold", () => {
  it("lands between two well-separated peaks", () => {
    const w = 16;
    const h = 16;
    const data = grayImage(w, h, (x) => (x < w / 2 ? 30 : 220));
    const t = otsuThreshold(data);
    // Threshold sits in the valley: the dark peak is background (≤ t), the
    // bright peak foreground (> t). Otsu may return the lower peak on a tie.
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });
});

describe("unsharpMaskInPlace", () => {
  it("increases contrast across an edge", () => {
    const w = 8;
    const h = 8;
    const data = grayImage(w, h, (x) => (x < 4 ? 100 : 150));
    const beforeJump = 150 - 100;
    unsharpMaskInPlace(data, w, h, 1);
    const dark = data[(4 * w + 3) * 4];
    const light = data[(4 * w + 4) * 4];
    expect(light - dark).toBeGreaterThan(beforeJump);
  });
});

describe("localContrastInPlace (CLAHE)", () => {
  it("amplifies faint local detail in a low-contrast image", () => {
    const w = 128;
    const h = 128;
    // A gentle gradient with large tiles → each region's narrow value range is
    // stretched, raising local contrast.
    const data = grayImage(w, h, (x) => 100 + Math.round((x / (w - 1)) * 100));
    const before = tileStd(data, w, 48, 48);
    localContrastInPlace(data, w, h, { tiles: 4 });
    const after = tileStd(data, w, 48, 48);
    expect(after).toBeGreaterThan(before * 1.5);
  });

  it("keeps pixels in range", () => {
    const w = 32;
    const h = 32;
    const data = grayImage(w, h, (x, y) => (x + y) % 50);
    localContrastInPlace(data, w, h);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });
});

describe("toLuminance", () => {
  it("computes Rec.601 luminance", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255]);
    const lum = toLuminance(data, 1, 1);
    expect(lum[0]).toBeCloseTo(255 * 0.299, 3);
  });
});
