import type { EnhanceMode } from "./types";

/**
 * Document enhancement on a 2D canvas. "clean" lifts the background toward white
 * and deepens text without crushing mid-tones; "high-contrast" is stronger.
 * "original" returns an untouched copy. Non-destructive: always returns a NEW
 * canvas so the source frame is preserved for re-enhancement.
 */
export function enhanceCanvas(
  source: HTMLCanvasElement,
  mode: EnhanceMode,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);

  if (mode === "original") return out;

  const image = ctx.getImageData(0, 0, out.width, out.height);
  const data = image.data;

  // Estimate the page background brightness from a luminance histogram so the
  // whitening adapts to the lighting instead of a fixed threshold.
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    hist[lum] += 1;
  }
  let peak = 200;
  let peakCount = 0;
  for (let v = 128; v < 256; v += 1) {
    if (hist[v] > peakCount) {
      peakCount = hist[v];
      peak = v;
    }
  }

  const whitePoint = Math.max(160, peak - 18);
  const blackPoint = mode === "high-contrast" ? 90 : 60;
  const gamma = mode === "high-contrast" ? 0.78 : 0.9;
  const range = Math.max(1, whitePoint - blackPoint);

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    let n = (v - blackPoint) / range;
    n = Math.min(1, Math.max(0, n));
    n = Math.pow(n, gamma);
    lut[v] = Math.round(n * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  ctx.putImageData(image, 0, 0);
  return out;
}

export const ENHANCE_MODES: { value: EnhanceMode; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "clean", label: "Clean" },
  { value: "high-contrast", label: "High contrast" },
];
