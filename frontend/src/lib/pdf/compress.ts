/**
 * Compress a PDF by rasterizing each page and re-encoding it as a JPEG-in-PDF at
 * the given quality. Bytes are processed in the browser; nothing is uploaded.
 *
 * IMPORTANT trade-off: this flattens the document to images, so the output has
 * no selectable text. It only meaningfully shrinks *scanned / image-heavy* PDFs;
 * a text PDF can end up the same size or larger. Callers should surface that
 * honestly and avoid replacing a file that didn't actually get smaller.
 */
import { generatePdfBlob } from "@/lib/scanner/pdf";

import { rasterizePdf } from "./rasterize";

export async function compressPdf(
  source: ArrayBuffer | Uint8Array,
  quality: number,
): Promise<Blob> {
  const pages = await rasterizePdf(source);
  if (pages.length === 0) throw new Error("That PDF has no pages.");
  return generatePdfBlob(pages, { quality });
}
