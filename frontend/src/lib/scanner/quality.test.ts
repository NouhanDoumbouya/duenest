import { describe, expect, it } from "vitest";

import { analyzeImageData, qualityWarnings } from "./quality";

function solid(w: number, h: number, value: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  return data;
}

/** A high-contrast checkerboard: bright, sharp, high-contrast. */
function checkerboard(size: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("analyzeImageData", () => {
  it("measures a flat image as that brightness with ~zero contrast/sharpness", () => {
    const m = analyzeImageData(solid(16, 16, 130), 16, 16);
    expect(Math.round(m.brightness)).toBe(130);
    expect(m.contrast).toBeLessThan(1);
    expect(m.sharpness).toBeLessThan(1);
    expect(m.pixels).toBe(256);
  });

  it("measures a checkerboard as high contrast and high sharpness", () => {
    const m = analyzeImageData(checkerboard(32), 32, 32);
    expect(m.contrast).toBeGreaterThan(100);
    expect(m.sharpness).toBeGreaterThan(100);
  });
});

describe("qualityWarnings", () => {
  it("warns on a dark, flat scan (dark + low-contrast + blurry)", () => {
    const ids = qualityWarnings(analyzeImageData(solid(64, 64, 40), 64, 64)).map(
      (w) => w.id,
    );
    expect(ids).toContain("dark");
    expect(ids).toContain("low-contrast");
    expect(ids).toContain("blurry");
  });

  it("flags a washed-out bright scan", () => {
    const ids = qualityWarnings(analyzeImageData(solid(64, 64, 250), 64, 64)).map(
      (w) => w.id,
    );
    expect(ids).toContain("bright");
  });

  it("flags small images as low resolution", () => {
    const ids = qualityWarnings(analyzeImageData(checkerboard(32), 32, 32)).map(
      (w) => w.id,
    );
    expect(ids).toContain("low-resolution");
  });

  it("stays quiet for a large, sharp, well-exposed scan", () => {
    const warnings = qualityWarnings(analyzeImageData(checkerboard(480), 480, 480));
    expect(warnings).toEqual([]);
  });

  it("flags a localized blown-out hotspot as glare", () => {
    // Mid-grey page with a clipped white reflection over ~10% of the area.
    const w = 64;
    const h = 64;
    const data = solid(w, h, 130);
    for (let y = 10; y < 30; y += 1) {
      for (let x = 10; x < 30; x += 1) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
      }
    }
    const m = analyzeImageData(data, w, h);
    expect(m.glare).toBeGreaterThan(0.02);
    expect(qualityWarnings(m).map((warn) => warn.id)).toContain("glare");
  });
});
