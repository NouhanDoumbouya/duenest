import { describe, expect, it } from "vitest";

import {
  applyAdjustmentsToImageData,
  applyFilterToImageData,
  DEFAULT_FILTER,
  FILTERS,
  getFilterMeta,
  isNeutralAdjust,
  NEUTRAL_ADJUST,
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

  it("keeps the visible (primary) tray small so it can't crowd mobile", () => {
    const primary = FILTERS.filter((f) => f.primary);
    expect(primary.length).toBeGreaterThan(0);
    expect(primary.length).toBeLessThanOrEqual(5);
    // Original must always be reachable directly in the tray.
    expect(primary.map((f) => f.id)).toContain("original");
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

describe("manual adjustments", () => {
  const base = { brightness: 0, contrast: 0, sharpness: 0, denoise: false };

  it("treats neutral as a no-op and leaves pixels untouched", () => {
    expect(isNeutralAdjust(NEUTRAL_ADJUST)).toBe(true);
    const data = solid(4, 4, 120, 120, 120);
    const copy = data.slice();
    applyAdjustmentsToImageData(data, 4, 4, NEUTRAL_ADJUST);
    expect(Array.from(data)).toEqual(Array.from(copy));
  });

  it("positive brightness lifts, negative brightness lowers", () => {
    const up = solid(4, 4, 120, 120, 120);
    applyAdjustmentsToImageData(up, 4, 4, { ...base, brightness: 40 });
    expect(up[0]).toBeGreaterThan(120);

    const down = solid(4, 4, 120, 120, 120);
    applyAdjustmentsToImageData(down, 4, 4, { ...base, brightness: -40 });
    expect(down[0]).toBeLessThan(120);
  });

  it("contrast pushes darks darker and lights lighter around mid-grey", () => {
    const dark = solid(2, 2, 90, 90, 90);
    const light = solid(2, 2, 170, 170, 170);
    applyAdjustmentsToImageData(dark, 2, 2, { ...base, contrast: 50 });
    applyAdjustmentsToImageData(light, 2, 2, { ...base, contrast: 50 });
    expect(dark[0]).toBeLessThan(90);
    expect(light[0]).toBeGreaterThan(170);
  });

  it("clamps to the 0–255 range", () => {
    const data = solid(2, 2, 250, 5, 130);
    applyAdjustmentsToImageData(data, 2, 2, {
      ...base,
      brightness: 100,
      contrast: 100,
      sharpness: 100,
    });
    for (let i = 0; i < data.length; i += 1) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });

  it("sharpness increases local contrast at an edge", () => {
    // 4×1 row: dark | dark | light | light → the edge is between px1 and px2.
    const w = 4;
    const h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    [40, 40, 200, 200].forEach((v, x) => {
      const i = x * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    });
    applyAdjustmentsToImageData(data, w, h, { ...base, sharpness: 100 });
    // The dark side of the edge gets darker, the light side lighter.
    expect(data[1 * 4]).toBeLessThanOrEqual(40);
    expect(data[2 * 4]).toBeGreaterThanOrEqual(200);
  });

  it("denoise smooths a single noisy pixel toward its neighbors", () => {
    const w = 3;
    const h = 3;
    const data = solid(w, h, 100, 100, 100);
    const center = (1 * w + 1) * 4;
    data[center] = data[center + 1] = data[center + 2] = 255; // hot pixel
    applyAdjustmentsToImageData(data, w, h, { ...base, denoise: true });
    expect(data[center]).toBeLessThan(255);
    expect(data[center]).toBeGreaterThan(100);
  });
});
