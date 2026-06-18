/**
 * Lazy pdf.js loader + page rasterizer.
 *
 * pdf.js is large, so it loads on demand. Its worker is served from a CDN pinned
 * to the bundled version — the same runtime-CDN pattern the scanner uses for
 * OpenCV. Only the worker *code* comes from the CDN; the document bytes are
 * parsed and rendered locally in the browser and are never uploaded anywhere.
 *
 * Rasterizing flattens a page to pixels (no text/vector layer survives). That is
 * exactly what secure redaction needs: the exported copy carries no recoverable
 * text underneath a redaction.
 */
type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

/**
 * Render every page of a PDF to a canvas, in page order. `maxWidth` bounds the
 * render resolution (sharper but heavier when larger). Throws if the source
 * can't be parsed as a PDF.
 */
export async function rasterizePdf(
  source: ArrayBuffer | Uint8Array,
  { maxWidth = 1240 }: { maxWidth?: number } = {},
): Promise<HTMLCanvasElement[]> {
  const pdfjs = await loadPdfjs();
  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const canvases: HTMLCanvasElement[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = base.width > 0 ? Math.min(maxWidth / base.width, 4) : 1;
      const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable.");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
      page.cleanup();
    }
  } finally {
    void loadingTask.destroy();
  }
  return canvases;
}
