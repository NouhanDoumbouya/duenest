import { describe, expect, it } from "vitest";

import {
  PROTECTED_COPY_STATUS_LABELS,
  PROTECTED_COPY_STATUS_ORDER,
  PROTECTED_COPY_STATUS_TONE,
  PROTECTION_TYPE_LABELS,
  isMeaningfulBox,
  isPdfContentType,
  normalizeRect,
  supportedForFormat,
} from "./protected-copies";
import type {
  ProtectedCopyStatus,
  ProtectionType,
} from "@/types/protected-copies";

describe("protection-type + status label/tone maps", () => {
  it("labels every protection type", () => {
    const types: ProtectionType[] = [
      "watermark",
      "redaction",
      "redaction_watermark",
    ];
    for (const type of types) {
      expect(PROTECTION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("labels and tones every status in the order list", () => {
    for (const status of PROTECTED_COPY_STATUS_ORDER) {
      expect(PROTECTED_COPY_STATUS_LABELS[status]).toBeTruthy();
      expect(PROTECTED_COPY_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("maps ready to success and failed to danger", () => {
    expect(PROTECTED_COPY_STATUS_TONE.ready).toBe("success");
    expect(PROTECTED_COPY_STATUS_TONE.failed).toBe("danger");
    expect(PROTECTED_COPY_STATUS_TONE.processing).toBe("info");
    expect(PROTECTED_COPY_STATUS_TONE.draft).toBe("neutral");
  });

  it("covers every status in the order list exactly once", () => {
    const all: ProtectedCopyStatus[] = [
      "draft",
      "processing",
      "ready",
      "failed",
      "archived",
    ];
    expect([...PROTECTED_COPY_STATUS_ORDER].sort()).toEqual([...all].sort());
  });
});

describe("supportedForFormat", () => {
  it("accepts PDF, PNG, and JPEG", () => {
    expect(supportedForFormat("application/pdf")).toBe(true);
    expect(supportedForFormat("image/png")).toBe(true);
    expect(supportedForFormat("image/jpeg")).toBe(true);
    expect(supportedForFormat("image/jpg")).toBe(true);
  });

  it("is case-insensitive and ignores a charset suffix", () => {
    expect(supportedForFormat("IMAGE/PNG")).toBe(true);
    expect(supportedForFormat("application/pdf; charset=binary")).toBe(true);
  });

  it("rejects unsupported types and empty values", () => {
    expect(supportedForFormat("image/gif")).toBe(false);
    expect(supportedForFormat("application/msword")).toBe(false);
    expect(supportedForFormat("")).toBe(false);
    expect(supportedForFormat(null)).toBe(false);
    expect(supportedForFormat(undefined)).toBe(false);
  });
});

describe("isPdfContentType", () => {
  it("is true only for PDFs", () => {
    expect(isPdfContentType("application/pdf")).toBe(true);
    expect(isPdfContentType("application/pdf; charset=binary")).toBe(true);
    expect(isPdfContentType("image/png")).toBe(false);
    expect(isPdfContentType(null)).toBe(false);
  });
});

describe("normalizeRect", () => {
  it("maps a pixel rect to correct 0..1 fractions", () => {
    // 100px wide box at x=100 on an 800px-wide page → x=0.125, width=0.125.
    const result = normalizeRect(
      { x: 100, y: 200, width: 100, height: 50 },
      800,
      1000,
    );
    expect(result.x).toBeCloseTo(0.125);
    expect(result.y).toBeCloseTo(0.2);
    expect(result.width).toBeCloseTo(0.125);
    expect(result.height).toBeCloseTo(0.05);
  });

  it("normalizes a box drawn from bottom-right to top-left", () => {
    // Negative width/height (drag up-left) should still produce a positive box.
    const result = normalizeRect(
      { x: 200, y: 250, width: -100, height: -50 },
      800,
      1000,
    );
    expect(result.x).toBeCloseTo(0.125);
    expect(result.y).toBeCloseTo(0.2);
    expect(result.width).toBeCloseTo(0.125);
    expect(result.height).toBeCloseTo(0.05);
  });

  it("clamps a box that spills past the page edges", () => {
    // Starts off the top-left and runs past the bottom-right; trimmed to bounds.
    const result = normalizeRect(
      { x: -50, y: -100, width: 1000, height: 2000 },
      400,
      500,
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it("clamps the right/bottom edges without shifting the left/top", () => {
    // Box from x=300 width=300 on a 400px page → right edge clamps to 1.
    const result = normalizeRect(
      { x: 300, y: 0, width: 300, height: 250 },
      400,
      500,
    );
    expect(result.x).toBeCloseTo(0.75);
    expect(result.width).toBeCloseTo(0.25); // 1 - 0.75, not 0.75
    expect(result.y).toBe(0);
    expect(result.height).toBeCloseTo(0.5);
  });

  it("returns a zero box for a non-positive displayed size", () => {
    expect(normalizeRect({ x: 10, y: 10, width: 20, height: 20 }, 0, 100)).toEqual(
      { x: 0, y: 0, width: 0, height: 0 },
    );
    expect(
      normalizeRect({ x: 10, y: 10, width: 20, height: 20 }, 100, -5),
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("produces a zero-area box for a click without drag", () => {
    const result = normalizeRect({ x: 50, y: 50, width: 0, height: 0 }, 500, 500);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("isMeaningfulBox", () => {
  it("rejects tiny/stray boxes", () => {
    expect(isMeaningfulBox({ width: 0.005, height: 0.005 })).toBe(false);
    expect(isMeaningfulBox({ width: 0, height: 0 })).toBe(false);
  });

  it("accepts a deliberate box", () => {
    expect(isMeaningfulBox({ width: 0.2, height: 0.05 })).toBe(true);
  });
});
