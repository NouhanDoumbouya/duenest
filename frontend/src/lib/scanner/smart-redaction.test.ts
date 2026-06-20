import { describe, expect, it } from "vitest";

import type { OcrWord } from "./ocr";
import { findRedactions, wordIsSensitive } from "./smart-redaction";

describe("wordIsSensitive — bank preset", () => {
  const opts = { preset: "bank" as const };
  it("matches account/card numbers (8+ digits)", () => {
    expect(wordIsSensitive("12345678", opts)).toBe(true);
    expect(wordIsSensitive("4111 1111 1111 1111", opts)).toBe(true);
  });
  it("matches sort codes and IBANs", () => {
    expect(wordIsSensitive("12-34-56", opts)).toBe(true);
    expect(wordIsSensitive("GB29NWBK60161331926819", opts)).toBe(true);
  });
  it("ignores short numbers and ordinary words", () => {
    expect(wordIsSensitive("2024", opts)).toBe(false);
    expect(wordIsSensitive("Passport", opts)).toBe(false);
  });
  it("does not match emails under the bank preset", () => {
    expect(wordIsSensitive("a@b.com", opts)).toBe(false);
  });
});

describe("wordIsSensitive — contact preset", () => {
  const opts = { preset: "contact" as const };
  it("matches emails and phone numbers", () => {
    expect(wordIsSensitive("jane@example.com", opts)).toBe(true);
    expect(wordIsSensitive("+44 7700 900123", opts)).toBe(true);
  });
  it("ignores a bare account number", () => {
    expect(wordIsSensitive("12345678", opts)).toBe(false);
  });
});

describe("wordIsSensitive — custom term", () => {
  it("matches per-word tokens of a multi-word term", () => {
    const opts = { preset: "custom" as const, term: "John Smith" };
    expect(wordIsSensitive("John", opts)).toBe(true);
    expect(wordIsSensitive("SMITH", opts)).toBe(true);
    expect(wordIsSensitive("Jane", opts)).toBe(false);
  });
  it("matches nothing when the term is blank", () => {
    expect(wordIsSensitive("anything", { preset: "custom", term: "  " })).toBe(false);
  });
});

describe("findRedactions", () => {
  const words: OcrWord[] = [
    { text: "Balance", bbox: { x0: 0, y0: 0, x1: 80, y1: 20 } },
    { text: "12345678", bbox: { x0: 100, y0: 0, x1: 180, y1: 20 } },
  ];

  it("returns normalized rects only for matching words", () => {
    const rects = findRedactions(words, { preset: "bank" }, 200, 100);
    expect(rects).toHaveLength(1);
    const r = rects[0];
    // Box covers the number word (x0 100 / 200 = 0.5), within 0..1 + padding.
    expect(r.x).toBeGreaterThan(0.49 - 0.01);
    expect(r.x).toBeLessThan(0.5);
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });

  it("returns nothing for an empty custom term or zero-size canvas", () => {
    expect(findRedactions(words, { preset: "custom", term: "" }, 200, 100)).toEqual([]);
    expect(findRedactions(words, { preset: "bank" }, 0, 0)).toEqual([]);
  });
});
