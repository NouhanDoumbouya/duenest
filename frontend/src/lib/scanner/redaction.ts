/**
 * Burn-in redaction for scanned page canvases.
 *
 * Scanner output is rasterized (JPEG-in-PDF) — there is no text or vector layer
 * underneath. Painting an OPAQUE rectangle onto the canvas before encoding
 * permanently replaces the pixels beneath it, so the hidden content is
 * non-recoverable in the exported copy. This makes burn-in redaction genuinely
 * safe FOR SCANNER IMAGE PAGES.
 *
 * It must NOT be reused for arbitrary existing PDFs that still carry a text
 * layer — there the same overlay would leave the underlying text recoverable.
 * That case is deliberately out of scope (see DOCUMENT_SCANNER.md backlog).
 *
 * Rectangles are stored normalized (0..1) so they map to any render size. Every
 * function returns a NEW canvas; the source is never mutated.
 */

export interface RedactionRect {
  /** All fields are fractions of the page, 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Build a normalized rect from two fractional points (any drag direction). */
export function normalizeRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): RedactionRect {
  const x1 = clamp01(Math.min(ax, bx));
  const y1 = clamp01(Math.min(ay, by));
  const x2 = clamp01(Math.max(ax, bx));
  const y2 = clamp01(Math.max(ay, by));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** True for a rect big enough to be a deliberate redaction (filters stray taps). */
export function isMeaningfulRect(rect: RedactionRect): boolean {
  return rect.w >= 0.01 && rect.h >= 0.01;
}

/**
 * Return a copy of `source` with each meaningful rect painted opaque black.
 * Falls back to the source if no 2D context is available.
 */
export function applyRedactions(
  source: HTMLCanvasElement,
  rects: RedactionRect[],
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = "#000000";
  for (const rect of rects) {
    if (!isMeaningfulRect(rect)) continue;
    ctx.fillRect(
      Math.round(rect.x * out.width),
      Math.round(rect.y * out.height),
      Math.round(rect.w * out.width),
      Math.round(rect.h * out.height),
    );
  }
  return out;
}
