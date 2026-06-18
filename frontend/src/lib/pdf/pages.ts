/**
 * Lossless single-page edits on an existing PDF using pdf-lib. Existing pages
 * are preserved exactly (text layer intact) — only the new page is an embedded
 * image. The source is never mutated; callers upload the result as a new version
 * so the original is retained.
 *
 * Only JPEG/PNG images can become a page (what the scanner produces / users
 * import). Other types throw, so the caller can show a clear message.
 */
import { PDFDocument } from "pdf-lib";

async function embedImage(
  doc: PDFDocument,
  image: Uint8Array | ArrayBuffer,
  mime: string,
) {
  if (mime.includes("png")) return doc.embedPng(image);
  if (mime.includes("jpeg") || mime.includes("jpg")) return doc.embedJpg(image);
  throw new Error("Only JPEG or PNG images can be added as a page.");
}

/** Insert an image as a new page at `index` (0-based). Returns the new PDF bytes. */
export async function insertImagePage(
  pdfBytes: Uint8Array | ArrayBuffer,
  index: number,
  image: Uint8Array | ArrayBuffer,
  mime: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const at = Math.min(Math.max(0, index), doc.getPageCount());
  const img = await embedImage(doc, image, mime);
  const page = doc.insertPage(at, [img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return doc.save();
}

/**
 * Replace the page at `index` (0-based) with an image page. The other pages are
 * untouched (lossless). Throws if the index is out of range.
 */
export async function replacePageWithImage(
  pdfBytes: Uint8Array | ArrayBuffer,
  index: number,
  image: Uint8Array | ArrayBuffer,
  mime: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  if (index < 0 || index >= doc.getPageCount()) {
    throw new Error("That page no longer exists.");
  }
  const img = await embedImage(doc, image, mime);
  // Insert the new page before the old one, then drop the old (now shifted +1).
  const page = doc.insertPage(index, [img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  doc.removePage(index + 1);
  return doc.save();
}
