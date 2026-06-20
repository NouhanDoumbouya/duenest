/**
 * Auto-straighten (deskew) for scanned pages.
 *
 * Estimates a small skew angle with a projection-profile (Radon-like) method:
 * for a range of candidate angles, project the page's "ink" onto an axis and
 * measure how spiky the profile is — text lines pile into sharp peaks only when
 * the projection axis is parallel to them, i.e. at the true skew angle. Pure
 * (DOM-free) and unit-tested; the camera/warp layer applies the rotation.
 */

export interface DeskewOptions {
  /** Largest skew (degrees) considered in each direction. */
  maxDegrees: number;
  /** Angle step (degrees) of the search. */
  stepDegrees: number;
  /** Below this confidence (relative peak gain) we report 0 — don't rotate. */
  minConfidence: number;
}

export const DEFAULT_DESKEW: DeskewOptions = {
  maxDegrees: 10,
  stepDegrees: 0.5,
  minConfidence: 1.05,
};

function inkPlane(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { ink: Float32Array; threshold: number } {
  const ink = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, g = 0; i < data.length; i += 4, g += 1) {
    const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    ink[g] = l;
    sum += l;
  }
  const threshold = sum / (width * height);
  // Binarize: darker-than-average = ink (1), else 0.
  for (let g = 0; g < ink.length; g += 1) ink[g] = ink[g] < threshold ? 1 : 0;
  return { ink, threshold };
}

/** Variance of the projection profile of `ink` at angle θ (radians). */
function projectionVariance(
  ink: Float32Array,
  width: number,
  height: number,
  theta: number,
): number {
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const offset = Math.ceil(Math.abs(width * sin)) + 1;
  const bins = new Float32Array(height + offset * 2 + 2);
  for (let y = 0; y < height; y += 1) {
    const yc = y * cos;
    for (let x = 0; x < width; x += 1) {
      const v = ink[y * width + x];
      if (v === 0) continue;
      const r = (yc + x * sin) | 0;
      bins[r + offset] += v;
    }
  }
  let mean = 0;
  for (let i = 0; i < bins.length; i += 1) mean += bins[i];
  mean /= bins.length;
  let varSum = 0;
  for (let i = 0; i < bins.length; i += 1) {
    const d = bins[i] - mean;
    varSum += d * d;
  }
  return varSum / bins.length;
}

/**
 * Estimate the page skew in degrees (positive = needs rotating that much to
 * straighten). Returns 0 when no confident skew is found, so a clean page is
 * never rotated needlessly.
 */
export function estimateSkewAngle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DeskewOptions = DEFAULT_DESKEW,
): number {
  if (width < 8 || height < 8) return 0;
  const { ink } = inkPlane(data, width, height);

  const base = projectionVariance(ink, width, height, 0);
  let bestVar = base;
  let bestDeg = 0;
  for (
    let deg = -opts.maxDegrees;
    deg <= opts.maxDegrees;
    deg += opts.stepDegrees
  ) {
    if (deg === 0) continue;
    const v = projectionVariance(ink, width, height, (deg * Math.PI) / 180);
    if (v > bestVar) {
      bestVar = v;
      bestDeg = deg;
    }
  }
  // Only act if the best angle is a clear improvement over straight-on.
  if (base <= 0 || bestVar / base < opts.minConfidence) return 0;
  return bestDeg;
}

/**
 * Rotate RGBA pixels by `degrees` around the center into a NEW, expanded buffer
 * (so no corners are clipped). Bilinear sampling; out-of-bounds reads as white.
 * Returns the new buffer + dimensions. Canvas-free.
 */
export function rotateImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  degrees: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const newW = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
  const newH = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));
  const out = new Uint8ClampedArray(newW * newH * 4);
  const cx = width / 2;
  const cy = height / 2;
  const ncx = newW / 2;
  const ncy = newH / 2;

  for (let y = 0; y < newH; y += 1) {
    for (let x = 0; x < newW; x += 1) {
      // Map output pixel back into the source (inverse rotation).
      const dx = x - ncx;
      const dy = y - ncy;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      const o = (y * newW + x) * 4;
      if (sx < 0 || sx >= width - 1 || sy < 0 || sy >= height - 1) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 4; c += 1) {
        const i00 = (y0 * width + x0) * 4 + c;
        const i10 = i00 + 4;
        const i01 = i00 + width * 4;
        const i11 = i01 + 4;
        const top = data[i00] * (1 - fx) + data[i10] * fx;
        const bot = data[i01] * (1 - fx) + data[i11] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data: out, width: newW, height: newH };
}
