/**
 * Lightweight, fully local scan-quality heuristics.
 *
 * These are best-effort hints, never blockers: the user can always save anyway.
 * The math is pure (canvas-free) so it is unit-testable, and nothing here ever
 * leaves the browser — no image content is sent anywhere or logged.
 */

export interface ScanQualityMetrics {
  /** Mean luminance, 0 (black) – 255 (white). */
  brightness: number;
  /** Luminance standard deviation; low ≈ flat/low-contrast. */
  contrast: number;
  /** Variance of the Laplacian; low ≈ blurry/out of focus. */
  sharpness: number;
  /** Fraction (0–1) of near-clipped highlight pixels ≈ glare/specular hotspot. */
  glare: number;
  /** Total pixel count of the analyzed image. */
  pixels: number;
}

export type WarningSeverity = "info" | "warn";

export interface ScanQualityWarning {
  id: "dark" | "bright" | "low-contrast" | "blurry" | "low-resolution" | "glare";
  severity: WarningSeverity;
  message: string;
}

// Heuristic thresholds tuned to be calm (warn rarely, never block).
const DARK_BELOW = 72;
const BRIGHT_ABOVE = 220;
const LOW_CONTRAST_BELOW = 26;
const BLUR_BELOW = 55;
const LOW_RES_PIXELS = 480 * 480;
// Glare = a localized blown-out hotspot: a meaningful but not dominant fraction
// of clipped highlights on a page that isn't uniformly bright. Below GLARE_MIN
// is just normal white paper; above GLARE_MAX it's a bright/white image, not a
// reflection. Pixels are "clipped" at/above GLARE_CLIP luminance.
const GLARE_CLIP = 252;
const GLARE_MIN = 0.02;
const GLARE_MAX = 0.45;

/** Compute quality metrics from raw RGBA data. Pure; safe in Node. */
export function analyzeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ScanQualityMetrics {
  const pixels = width * height;
  if (pixels === 0) {
    return { brightness: 0, contrast: 0, sharpness: 0, glare: 0, pixels: 0 };
  }

  // Grayscale buffer for brightness/contrast/Laplacian.
  const gray = new Float32Array(pixels);
  let sum = 0;
  let clipped = 0;
  for (let i = 0, g = 0; i < data.length; i += 4, g += 1) {
    const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[g] = l;
    sum += l;
    if (l >= GLARE_CLIP) clipped += 1;
  }
  const brightness = sum / pixels;
  const glare = clipped / pixels;

  let varSum = 0;
  for (let g = 0; g < pixels; g += 1) {
    const d = gray[g] - brightness;
    varSum += d * d;
  }
  const contrast = Math.sqrt(varSum / pixels);

  // Variance of the Laplacian over interior pixels (focus measure).
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - width] -
        gray[idx + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount += 1;
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const sharpness = lapCount ? lapSqSum / lapCount - lapMean * lapMean : 0;

  return { brightness, contrast, sharpness, glare, pixels };
}

/** Turn metrics into friendly, non-blocking warnings. */
export function qualityWarnings(metrics: ScanQualityMetrics): ScanQualityWarning[] {
  const warnings: ScanQualityWarning[] = [];
  if (metrics.pixels === 0) return warnings;

  if (metrics.brightness < DARK_BELOW) {
    warnings.push({
      id: "dark",
      severity: "warn",
      message:
        "Lighting looks low. Try the Light filter, or retake for better readability.",
    });
  } else if (metrics.brightness > BRIGHT_ABOVE) {
    warnings.push({
      id: "bright",
      severity: "info",
      message: "This scan looks very bright and may be washed out. Retake if text is hard to read.",
    });
  }

  if (metrics.contrast < LOW_CONTRAST_BELOW) {
    warnings.push({
      id: "low-contrast",
      severity: "info",
      message: "Low contrast detected. Auto or B&W can make the text clearer.",
    });
  }

  if (metrics.sharpness < BLUR_BELOW) {
    warnings.push({
      id: "blurry",
      severity: "warn",
      message: "This scan may be blurry. You can retake it or save anyway.",
    });
  }

  // Localized glare (a reflection hotspot), but not a uniformly bright image.
  if (
    metrics.glare >= GLARE_MIN &&
    metrics.glare <= GLARE_MAX &&
    metrics.brightness < BRIGHT_ABOVE
  ) {
    warnings.push({
      id: "glare",
      severity: "warn",
      message:
        "There may be glare or a reflection. Tilt the page or move the light, then retake.",
    });
  }

  if (metrics.pixels < LOW_RES_PIXELS) {
    warnings.push({
      id: "low-resolution",
      severity: "info",
      message: "This scan is low resolution and may be hard to read when zoomed.",
    });
  }

  return warnings;
}

/** Canvas convenience wrapper. Returns [] if the 2D context is unavailable. */
export function analyzeCanvasQuality(
  canvas: HTMLCanvasElement,
): ScanQualityWarning[] {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return [];
  try {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return qualityWarnings(
      analyzeImageData(image.data, canvas.width, canvas.height),
    );
  } catch {
    return [];
  }
}
