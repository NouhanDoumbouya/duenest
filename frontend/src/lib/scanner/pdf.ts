/**
 * Build a compressed, single-document PDF from one or more enhanced page
 * canvases using jsPDF (lazy-loaded so it never enters the initial bundle).
 *
 * Each page is sized to the canvas aspect ratio inside an A4 box, JPEG-encoded
 * at a quality that keeps scans readable while bounding file size. The structure
 * accepts an array so multi-page scanning can be added later without API churn.
 */
export async function generatePdfBlob(
  pages: HTMLCanvasElement[],
  opts: { quality?: number } = {},
): Promise<Blob> {
  if (pages.length === 0) throw new Error("No pages to export.");
  const { jsPDF } = await import("jspdf");
  const quality = opts.quality ?? 0.72;

  const A4 = { w: 595.28, h: 841.89 }; // points
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  pages.forEach((canvas, index) => {
    if (index > 0) doc.addPage();
    const imgData = canvas.toDataURL("image/jpeg", quality);
    const ratio = canvas.width / canvas.height;
    const margin = 24;
    const maxW = A4.w - margin * 2;
    const maxH = A4.h - margin * 2;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const x = (A4.w - w) / 2;
    const y = (A4.h - h) / 2;
    doc.addImage(imgData, "JPEG", x, y, w, h, undefined, "FAST");
  });

  return doc.output("blob");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
