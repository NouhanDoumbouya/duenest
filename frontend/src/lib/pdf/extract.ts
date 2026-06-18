/**
 * Client-side page extraction ("split") using pdf-lib. Selected pages are copied
 * structurally into a new PDF (no rasterization, no quality loss); the source is
 * never modified and bytes never leave the browser.
 */
import { PDFDocument } from "pdf-lib";

/** Number of pages in a PDF. Throws if the source can't be parsed. */
export async function getPdfPageCount(
  source: Uint8Array | ArrayBuffer,
): Promise<number> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Build a new PDF from the given 0-based page indices, in ascending page order.
 * Out-of-range and duplicate indices are ignored. Throws if nothing valid is
 * selected.
 */
export async function extractPages(
  source: Uint8Array | ArrayBuffer,
  indices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(source, { ignoreEncryption: true });
  const max = src.getPageCount();
  const valid = Array.from(new Set(indices))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < max)
    .sort((a, b) => a - b);
  if (valid.length === 0) {
    throw new Error("Select at least one page to extract.");
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, valid);
  copied.forEach((page) => out.addPage(page));
  return out.save();
}
