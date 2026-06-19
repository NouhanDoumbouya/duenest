import { describe, expect, it } from "vitest";

import {
  assessQrContrast,
  contrastRatio,
  hexToRgb,
  relativeLuminance,
} from "./qr";

describe("hexToRgb", () => {
  it("parses 6- and 3-digit hex with/without #", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#0af")).toEqual({ r: 0, g: 170, b: 255 });
  });

  it("rejects invalid input", () => {
    expect(hexToRgb("nope")).toBeNull();
    expect(hexToRgb("#12")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    const black = hexToRgb("#000000")!;
    const white = hexToRgb("#ffffff")!;
    expect(Math.round(contrastRatio(black, white))).toBe(21);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("white is brighter than black", () => {
    expect(relativeLuminance(hexToRgb("#ffffff")!)).toBeGreaterThan(
      relativeLuminance(hexToRgb("#000000")!),
    );
  });
});

describe("assessQrContrast", () => {
  it("approves a strong dark-on-light code", () => {
    const r = assessQrContrast("#0b1220", "#ffffff");
    expect(r.level).toBe("ok");
    expect(r.message).toBe("Looks good.");
  });

  it("warns on low contrast", () => {
    const r = assessQrContrast("#888888", "#999999");
    expect(r.level).toBe("warn");
    expect(r.message).toMatch(/hard to scan/i);
  });

  it("warns when colors are inverted (light code on dark background)", () => {
    const r = assessQrContrast("#ffffff", "#0b1220");
    expect(r.level).toBe("warn");
    expect(r.message).toMatch(/inverted/i);
  });

  it("warns on invalid colors instead of throwing", () => {
    const r = assessQrContrast("not-a-color", "#ffffff");
    expect(r.level).toBe("warn");
    expect(r.ratio).toBeNull();
  });
});
