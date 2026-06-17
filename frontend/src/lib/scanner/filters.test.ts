import { describe, expect, it } from "vitest";

import {
  applyFilterToImageData,
  DEFAULT_FILTER,
  FILTERS,
  getFilterMeta,
  type FilterId,
} from "./filters";

/** Build an w×h RGBA buffer where every pixel is (r,g,b,255). */
function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

function meanBrightness(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return sum / (data.length / 4);
}

describe("FILTERS metadata", () => {
  it("has exactly one default and it is the documented one", () => {
    const defaults = FILTERS.filter((f) => f.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(DEFAULT_FILTER);
    expect(DEFAULT_FILTER).toBe("auto");
  });

  it("uses unique ids and includes the minimum filter set", () => {
    const ids = FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const required of ["original", "auto", "light", "grayscale", "bw"]) {
      expect(ids).toContain(required as FilterId);
    }
  });

  it("keeps Original safe and B&W flagged as color-destroying", () => {
    const original = getFilterMeta("original");
    expect(original.destructiveRisk).toBe("none");
    expect(original.preservesColor).toBe(true);

    const bw = getFilterMeta("bw");
    expect(bw.preservesColor).toBe(false);
    expect(bw.destructiveRisk).toBe("high");
  });

  it("marks advanced color modes as pro/experimental but color-preserving", () => {
    for (const id of ["id-passport", "low-light", "signature-stamp"] as FilterId[]) {
      const meta = getFilterMeta(id);
      expect(meta.planTier).toBe("pro");
      expect(meta.preservesColor).toBe(true);
    }
  });
});

describe("applyFilterToImageData", () => {
  it("leaves Original untouched", () => {
    const src = solid(4, 4, 120, 130, 140);
    const copy = src.slice();
    applyFilterToImageData(src, 4, 4, "original");
    expect(Array.from(src)).toEqual(Array.from(copy));
  });

  it("Grayscale equalizes the RGB channels", () => {
    const data = solid(4, 4, 100, 150, 200);
    applyFilterToImageData(data, 4, 4, "grayscale");
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
    }
  });

  it("Light brightens a dark scan", () => {
    const dark = solid(8, 8, 80, 80, 80);
    const before = meanBrightness(dark);
    applyFilterToImageData(dark, 8, 8, "light");
    expect(meanBrightness(dark)).toBeGreaterThan(before);
  });

  it("B&W produces only pure black or white pixels", () => {
    const data = solid(4, 4, 60, 60, 60);
    // mix in some bright pixels
    data[0] = data[1] = data[2] = 240;
    applyFilterToImageData(data, 4, 4, "bw");
    for (let i = 0; i < data.length; i += 4) {
      expect([0, 255]).toContain(data[i]);
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
    }
  });

  it("ID/Passport keeps strong color (channels stay distinct)", () => {
    const red = solid(4, 4, 230, 20, 20);
    applyFilterToImageData(red, 4, 4, "id-passport");
    // Still clearly red, not grayscaled.
    expect(red[0]).toBeGreaterThan(red[1] + 40);
    expect(red[0]).toBeGreaterThan(red[2] + 40);
  });

  it("never returns out-of-range channel values", () => {
    const data = solid(6, 6, 10, 200, 90);
    for (const id of FILTERS.map((f) => f.id)) {
      const copy = data.slice();
      applyFilterToImageData(copy, 6, 6, id);
      for (let i = 0; i < copy.length; i += 1) {
        expect(copy[i]).toBeGreaterThanOrEqual(0);
        expect(copy[i]).toBeLessThanOrEqual(255);
      }
    }
  });
});
