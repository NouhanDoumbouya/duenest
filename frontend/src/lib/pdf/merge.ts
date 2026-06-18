/**
 * Client-side PDF merge using pdf-lib (no external service; bytes never leave
 * the browser). Pages are copied in the given order into one new document. The
 * source buffers are not modified; the caller decides where the result is saved.
 *
 * pdf-lib copies page objects structurally (it does not rasterize), so text and
 * quality are preserved and there is no quality loss from merging.
 */
import { PDFDocument } from "pdf-lib";

/**
 * Merge two or more PDFs into one, preserving page order. Throws if fewer than
 * two inputs are given or if a source can't be parsed as a PDF.
 */
export async function mergePdfs(
  sources: (Uint8Array | ArrayBuffer)[],
): Promise<Uint8Array> {
  if (sources.length < 2) {
    throw new Error("Select at least two PDFs to merge.");
  }
  const merged = await PDFDocument.create();
  for (const source of sources) {
    const doc = await PDFDocument.load(source, { ignoreEncryption: true });
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}
