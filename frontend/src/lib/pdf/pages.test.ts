import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { insertImagePage, replacePageWithImage } from "./pages";

// A tiny valid 1×1 transparent PNG.
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

describe("replacePageWithImage", () => {
  it("replaces in place, keeping the page count", async () => {
    const out = await replacePageWithImage(await makePdf(3), 1, PNG_1x1, "image/png");
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it("throws on an out-of-range index", async () => {
    await expect(
      replacePageWithImage(await makePdf(2), 5, PNG_1x1, "image/png"),
    ).rejects.toThrow();
  });

  it("rejects unsupported image types", async () => {
    await expect(
      replacePageWithImage(await makePdf(1), 0, PNG_1x1, "image/webp"),
    ).rejects.toThrow();
  });
});

describe("insertImagePage", () => {
  it("adds exactly one page", async () => {
    const out = await insertImagePage(await makePdf(2), 2, PNG_1x1, "image/png");
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });
});
