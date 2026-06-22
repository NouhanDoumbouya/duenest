/**
 * Burn-in watermarking for scanned page canvases.
 *
 * Scanner output is rasterized (JPEG-in-PDF), so a watermark drawn onto the
 * canvas BEFORE encoding becomes part of the image itself — no text or vector
 * layer survives underneath, so a PDF reader cannot peel it off. This makes the
 * watermark non-recoverable, but it is a *labelling* aid, NOT a security
 * control: it does not prevent copying, screenshots, or misuse, and callers
 * must never claim otherwise.
 *
 * Every function returns a NEW canvas; the source is never mutated, so the
 * original scan/pages stay intact.
 */

export const WATERMARK_PRESETS = [
  "Shared via CertaNest",
  "For application use only",
  "For review only",
  "For submission only",
] as const;

export type WatermarkPosition = "diagonal" | "footer" | "center";
export type WatermarkStrength = "light" | "medium" | "strong";

export interface WatermarkOptions {
  text: string;
  position: WatermarkPosition;
  strength: WatermarkStrength;
}

/** Longest watermark label we will render (prevents abusive/overflowing text). */
export const MAX_WATERMARK_LEN = 60;

const STRENGTH_ALPHA: Record<WatermarkStrength, number> = {
  light: 0.1,
  medium: 0.18,
  strong: 0.28,
};

/** Resolve the fill opacity used for a strength (exported for UI/testing). */
export function strengthAlpha(strength: WatermarkStrength): number {
  return STRENGTH_ALPHA[strength];
}

/**
 * Normalize user-entered watermark text: replace control characters with a
 * space, collapse whitespace, trim, and cap length. Returns "" for
 * empty/whitespace-only input. Implemented with a codepoint filter (rather than
 * a control-character regex) so the source stays free of control bytes.
 */
export function sanitizeWatermarkText(input: string): string {
  let cleaned = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return cleaned.replace(/\s+/g, " ").trim().slice(0, MAX_WATERMARK_LEN);
}

/**
 * Draw `options.text` onto a copy of `source` and return the new canvas. If the
 * text is empty or no 2D context is available, the source is returned unchanged.
 */
export function applyWatermark(
  source: HTMLCanvasElement,
  options: WatermarkOptions,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);

  const text = sanitizeWatermarkText(options.text);
  if (!text) return out;

  const w = out.width;
  const h = out.height;
  ctx.save();
  ctx.fillStyle = `rgba(15, 23, 42, ${STRENGTH_ALPHA[options.strength]})`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (options.position === "footer") {
    const fontSize = Math.max(14, Math.round(w * 0.03));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.fillText(text, w / 2, h - fontSize * 1.4, w * 0.92);
  } else if (options.position === "center") {
    const fontSize = Math.max(20, Math.round(w * 0.06));
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.fillText(text, 0, 0, w * 0.9);
  } else {
    // Diagonal: repeated lines tiled across the rotated page.
    const fontSize = Math.max(18, Math.round(w * 0.045));
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    const lineGap = fontSize * 3;
    const lines = Math.ceil(Math.max(w, h) / lineGap) + 2;
    for (let i = -lines; i <= lines; i += 1) {
      ctx.fillText(text, 0, i * lineGap, w * 1.2);
    }
  }
  ctx.restore();
  return out;
}
