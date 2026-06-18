import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { extractPages, getPdfPageCount } from "./extract";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

describe("getPdfPageCount", () => {
  it("returns the page count", async () => {
    expect(await getPdfPageCount(await makePdf(5))).toBe(5);
  });
});

describe("extractPages", () => {
  it("extracts the selected pages", async () => {
    const src = await makePdf(5);
    const out = await extractPages(src, [0, 2, 4]);
    expect(await getPdfPageCount(out)).toBe(3);
  });

  it("ignores out-of-range and duplicate indices, preserving order", async () => {
    const src = await makePdf(3);
    const out = await extractPages(src, [2, 2, 9, 0, -1]);
    expect(await getPdfPageCount(out)).toBe(2); // pages 0 and 2
  });

  it("throws when no valid page is selected", async () => {
    const src = await makePdf(2);
    await expect(extractPages(src, [])).rejects.toThrow();
    await expect(extractPages(src, [5, 6])).rejects.toThrow();
  });
});
