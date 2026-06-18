import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { mergePdfs } from "./merge";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

describe("mergePdfs", () => {
  it("concatenates pages from all inputs in order", async () => {
    const a = await makePdf(1);
    const b = await makePdf(2);
    const c = await makePdf(3);
    const merged = await mergePdfs([a, b, c]);
    const reloaded = await PDFDocument.load(merged);
    expect(reloaded.getPageCount()).toBe(6);
  });

  it("rejects fewer than two inputs", async () => {
    await expect(mergePdfs([await makePdf(1)])).rejects.toThrow();
  });

  it("rejects a non-PDF source", async () => {
    const garbage = new TextEncoder().encode("not a pdf");
    await expect(mergePdfs([await makePdf(1), garbage])).rejects.toThrow();
  });
});
