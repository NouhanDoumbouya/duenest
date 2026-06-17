/**
 * Non-destructive document filters for the scanner.
 *
 * Design:
 *   - The captured/warped frame is kept untouched; every filter returns a NEW
 *     canvas, so the user can switch filters freely and revert to Original.
 *   - The pixel math lives in a pure, canvas-free function
 *     (`applyFilterToImageData`) so it is unit-testable in Node without a DOM.
 *   - Filter metadata is rich enough that advanced filters can later be gated by
 *     plan/feature flags WITHOUT changing call sites. No paywall is enforced
 *     here — `planTier` is descriptive only.
 *
 * Quality guarantees:
 *   - "Original" is always available and untouched.
 *   - The default ("auto") cleans gently and must NOT aggressively darken.
 *   - Color-preserving modes (ID/Passport, Low-Light, Signature/Stamp) never
 *     threshold to black & white, so faces, stamps and signatures survive.
 */

export type FilterId =
  | "original"
  | "auto"
  | "light"
  | "grayscale"
  | "bw"
  | "id-passport"
  | "receipt"
  | "low-light"
  | "signature-stamp";

export type PlanTier = "free" | "pro" | "experimental" | "internal_only";
export type DestructiveRisk = "none" | "low" | "medium" | "high";

export interface FilterMeta {
  id: FilterId;
  label: string;
  description: string;
  recommendedFor: string;
  planTier: PlanTier;
  isDefault: boolean;
  isExperimental: boolean;
  preservesColor: boolean;
  destructiveRisk: DestructiveRisk;
  supportsBatchApply: boolean;
  /** Shown in the compact tray (vs. only inside the "More" sheet). */
  primary: boolean;
}

/** Per-filter pixel pipeline parameters consumed by `applyFilterToImageData`. */
interface FilterParams {
  grayscale?: boolean;
  /** Lift the page background toward white using an adaptive white point. */
  adaptiveWhiten?: boolean;
  /** Binarize to black & white after whitening (text-heavy docs). */
  threshold?: boolean;
  /** Added to each channel, -255..255 (applied before contrast). */
  brightness?: number;
  /** Contrast factor around mid-grey, 1 = unchanged. */
  contrast?: number;
  /** Gamma; <1 brightens shadows, >1 darkens. */
  gamma?: number;
  /** Saturation multiplier, 1 = unchanged (ignored when grayscale). */
  saturation?: number;
}

const PARAMS: Record<FilterId, FilterParams> = {
  original: {},
  // Gentle, color-preserving clean. Softer than the old "clean" so it never
  // crushes mid-tones or over-darkens photos.
  auto: { adaptiveWhiten: true, gamma: 0.96, contrast: 1.06 },
  // Brightens dark/low-contrast captures without washing out text.
  light: { brightness: 26, gamma: 0.9, contrast: 1.04 },
  grayscale: { grayscale: true, contrast: 1.05 },
  // Strong contrast for printed text. Destroys color — not a default.
  bw: { grayscale: true, adaptiveWhiten: true, threshold: true },
  // Color-preserving modes never threshold, so faces/stamps/signatures survive.
  "id-passport": { brightness: 8, contrast: 1.05, saturation: 1.08 },
  receipt: { grayscale: true, brightness: 18, contrast: 1.28, gamma: 0.95 },
  "low-light": { brightness: 42, gamma: 1.25, contrast: 1.08 },
  "signature-stamp": { brightness: 8, contrast: 1.06, saturation: 1.25 },
};

export const FILTERS: FilterMeta[] = [
  {
    id: "original",
    label: "Original",
    description: "The scan exactly as captured. No enhancement.",
    recommendedFor: "Photos and anything you want untouched",
    planTier: "free",
    isDefault: false,
    isExperimental: false,
    preservesColor: true,
    destructiveRisk: "none",
    supportsBatchApply: true,
    primary: true,
  },
  {
    id: "auto",
    label: "Auto",
    description: "Balanced clean-up that improves readability without over-darkening.",
    recommendedFor: "Most documents",
    planTier: "free",
    isDefault: true,
    isExperimental: false,
    preservesColor: true,
    destructiveRisk: "low",
    supportsBatchApply: true,
    primary: true,
  },
  {
    id: "light",
    label: "Light",
    description: "Brightens dark or low-light scans while keeping text readable.",
    recommendedFor: "White paper, forms, certificates, dim photos",
    planTier: "free",
    isDefault: false,
    isExperimental: false,
    preservesColor: true,
    destructiveRisk: "low",
    supportsBatchApply: true,
    primary: true,
  },
  {
    id: "bw",
    label: "B&W",
    description: "High contrast for printed text. May remove color details like stamps or signatures.",
    recommendedFor: "Text-heavy printed forms",
    planTier: "free",
    isDefault: false,
    isExperimental: false,
    preservesColor: false,
    destructiveRisk: "high",
    supportsBatchApply: true,
    primary: true,
  },
  {
    id: "grayscale",
    label: "Grayscale",
    description: "Removes color but keeps soft readability.",
    recommendedFor: "Normal text documents",
    planTier: "free",
    isDefault: false,
    isExperimental: false,
    preservesColor: false,
    destructiveRisk: "medium",
    supportsBatchApply: true,
    primary: false,
  },
  {
    id: "id-passport",
    label: "ID / Passport",
    description: "Preserves natural colors, the photo area and security colors. Gentle, never harsh.",
    recommendedFor: "Passport, visa, ID, residence permit, student card",
    planTier: "pro",
    isDefault: false,
    isExperimental: true,
    preservesColor: true,
    destructiveRisk: "none",
    supportsBatchApply: true,
    primary: false,
  },
  {
    id: "receipt",
    label: "Receipt",
    description: "Improves faded receipts and thermal-paper slips by brightening and lifting contrast.",
    recommendedFor: "Receipts, payment slips, thermal paper",
    planTier: "pro",
    isDefault: false,
    isExperimental: true,
    preservesColor: false,
    destructiveRisk: "medium",
    supportsBatchApply: true,
    primary: false,
  },
  {
    id: "low-light",
    label: "Low-Light Fix",
    description: "Brightens scans captured in dark environments while trying not to wash out text.",
    recommendedFor: "Dim rooms, evening captures",
    planTier: "pro",
    isDefault: false,
    isExperimental: true,
    preservesColor: true,
    destructiveRisk: "low",
    supportsBatchApply: true,
    primary: false,
  },
  {
    id: "signature-stamp",
    label: "Signature / Stamp",
    description: "Keeps blue and red stamps and signatures vivid instead of turning them harsh black & white.",
    recommendedFor: "Signed or stamped documents",
    planTier: "pro",
    isDefault: false,
    isExperimental: true,
    preservesColor: true,
    destructiveRisk: "low",
    supportsBatchApply: true,
    primary: false,
  },
];

export const DEFAULT_FILTER: FilterId =
  FILTERS.find((f) => f.isDefault)?.id ?? "auto";

export function getFilterMeta(id: FilterId): FilterMeta {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * Apply a filter to raw RGBA pixel data IN PLACE. Pure (no DOM) so it is
 * unit-testable. Returns the same `data` reference for convenience.
 */
export function applyFilterToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  id: FilterId,
): Uint8ClampedArray {
  const p = PARAMS[id];
  if (!p || id === "original") return data;

  // Adaptive white point: find the brightest histogram peak so whitening adapts
  // to the lighting instead of a fixed threshold.
  let whitePoint = 245;
  if (p.adaptiveWhiten) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      hist[luminance(data[i], data[i + 1], data[i + 2]) | 0] += 1;
    }
    let peak = 200;
    let peakCount = 0;
    for (let v = 128; v < 256; v += 1) {
      if (hist[v] > peakCount) {
        peakCount = hist[v];
        peak = v;
      }
    }
    whitePoint = Math.max(170, peak - 12);
  }
  const blackPoint = p.adaptiveWhiten ? 48 : 0;
  const range = Math.max(1, whitePoint - blackPoint);
  const gamma = p.gamma ?? 1;
  const brightness = p.brightness ?? 0;
  const contrast = p.contrast ?? 1;
  const saturation = p.saturation ?? 1;

  // Precompute a tone curve (levels + gamma + brightness + contrast) once.
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    let n = (v - blackPoint) / range;
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    n = Math.pow(n, gamma);
    let out = n * 255 + brightness;
    out = (out - 128) * contrast + 128;
    lut[v] = clamp8(out);
  }

  // Global binarization point for B&W: midway through the usable range.
  const thresholdAt = blackPoint + range * 0.55;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (p.grayscale || p.threshold) {
      const l = luminance(r, g, b);
      if (p.threshold) {
        const v = l <= thresholdAt ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = v;
        continue;
      }
      r = g = b = l;
    }

    r = lut[r | 0];
    g = lut[g | 0];
    b = lut[b | 0];

    if (saturation !== 1 && !p.grayscale) {
      const l = luminance(r, g, b);
      r = clamp8(l + (r - l) * saturation);
      g = clamp8(l + (g - l) * saturation);
      b = clamp8(l + (b - l) * saturation);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return data;
}

/**
 * Non-destructive: returns a NEW canvas with the filter applied, leaving the
 * source untouched. On any failure the original is returned unchanged so a
 * filter can never break the scan (callers surface a friendly message).
 */
export function applyFilter(
  source: HTMLCanvasElement,
  id: FilterId,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  if (id === "original") return out;
  try {
    const image = ctx.getImageData(0, 0, out.width, out.height);
    applyFilterToImageData(image.data, out.width, out.height, id);
    ctx.putImageData(image, 0, 0);
  } catch {
    return source;
  }
  return out;
}

/**
 * Optional manual fine-tuning applied ON TOP of a filter. `brightness` and
 * `contrast` are sliders in [-100, 100]; `sharpness` is [0, 100]; `denoise` is a
 * toggle. All-neutral is a no-op. Kept separate from filters so the "Adjust"
 * panel composes with any filter and stays fully non-destructive.
 */
export interface Adjustments {
  brightness: number;
  contrast: number;
  sharpness: number;
  denoise: boolean;
}

export const NEUTRAL_ADJUST: Adjustments = {
  brightness: 0,
  contrast: 0,
  sharpness: 0,
  denoise: false,
};

export function isNeutralAdjust(adj: Adjustments): boolean {
  return (
    adj.brightness === 0 &&
    adj.contrast === 0 &&
    adj.sharpness === 0 &&
    !adj.denoise
  );
}

/** 3×3 box blur of the RGB channels → a new buffer (alpha preserved). */
function boxBlur3x3(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = (yy * width + xx) * 4;
          r += data[j];
          g += data[j + 1];
          b += data[j + 2];
          n += 1;
        }
      }
      out[i] = r / n;
      out[i + 1] = g / n;
      out[i + 2] = b / n;
      out[i + 3] = data[i + 3];
    }
  }
  return out;
}

/** Apply denoise → sharpen → brightness/contrast to RGBA data IN PLACE. Pure. */
export function applyAdjustmentsToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: Adjustments,
): Uint8ClampedArray {
  if (isNeutralAdjust(adj)) return data;

  // 1) Denoise: a light 3×3 mean smooths sensor noise before sharpening.
  if (adj.denoise) {
    data.set(boxBlur3x3(data, width, height));
  }

  // 2) Sharpen: unsharp mask = pixel + amount × (pixel − blurred).
  const sharpen = Math.max(0, Math.min(100, adj.sharpness));
  if (sharpen > 0) {
    const amount = (sharpen / 100) * 1.5;
    const blurred = boxBlur3x3(data, width, height);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp8(data[i] + amount * (data[i] - blurred[i]));
      data[i + 1] = clamp8(data[i + 1] + amount * (data[i + 1] - blurred[i + 1]));
      data[i + 2] = clamp8(data[i + 2] + amount * (data[i + 2] - blurred[i + 2]));
    }
  }

  // 3) Brightness/contrast via a single tone curve.
  const brightness = Math.max(-100, Math.min(100, adj.brightness));
  const c = Math.max(-100, Math.min(100, adj.contrast)) * 1.28;
  if (brightness !== 0 || c !== 0) {
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v += 1) {
      lut[v] = clamp8(factor * (v + brightness - 128) + 128);
    }
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }
  return data;
}

/**
 * Apply brightness/contrast to a canvas, returning a NEW canvas. Used for cheap
 * live slider updates on an already-filtered canvas (no re-filtering needed).
 */
export function applyAdjustments(
  source: HTMLCanvasElement,
  adj: Adjustments,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  if (isNeutralAdjust(adj)) return out;
  try {
    const image = ctx.getImageData(0, 0, out.width, out.height);
    applyAdjustmentsToImageData(image.data, out.width, out.height, adj);
    ctx.putImageData(image, 0, 0);
  } catch {
    return source;
  }
  return out;
}

/**
 * Render a page = filter + optional manual adjustments, non-destructively, from
 * the untouched base canvas. Returns a NEW canvas (or the filtered one when no
 * adjustment is needed).
 */
export function renderPage(
  base: HTMLCanvasElement,
  id: FilterId,
  adj: Adjustments = NEUTRAL_ADJUST,
): HTMLCanvasElement {
  const filtered = applyFilter(base, id);
  if (isNeutralAdjust(adj)) return filtered;
  const ctx = filtered.getContext("2d");
  if (!ctx) return filtered;
  try {
    const image = ctx.getImageData(0, 0, filtered.width, filtered.height);
    applyAdjustmentsToImageData(image.data, filtered.width, filtered.height, adj);
    ctx.putImageData(image, 0, 0);
  } catch {
    return filtered;
  }
  return filtered;
}
