/**
 * Auto-straighten (deskew) for scanned pages.
 *
 * Instead of estimating an abstract angle (whose sign convention is easy to get
 * backwards — which would *double* a tilt), this searches actual small
 * rotations and keeps the one that best aligns text into horizontal rows. The
 * search and the final rotation use the SAME rotation routine, so the result is
 * always a real straightening, never an inversion. Pure (DOM-free) and tested;
 * the camera/warp layer calls `deskewImageData` on the warped page.
 */

export interface DeskewOptions {
  /** Largest rotation (degrees) tried in each direction. */
  maxDegrees: number;
  /** Angle step (degrees) of the search. */
  stepDegrees: number;
  /** Width the page is downsampled to for the (cheap) search. */
  sampleWidth: number;
  /** Required alignment gain over straight-on before we rotate at all. */
  minGain: number;
}

export const DEFAULT_DESKEW: DeskewOptions = {
  maxDegrees: 8,
  stepDegrees: 0.5,
  sampleWidth: 220,
  minGain: 1.06,
};

/** Variance of per-row "ink" — high when text separates into horizontal lines. */
function rowAlignment(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  // Binarize against the mean: darker-than-average counts as ink.
  let sum = 0;
  const lum = new Float32Array(width * height);
  for (let i = 0, g = 0; i < data.length; i += 4, g += 1) {
    const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    lum[g] = l;
    sum += l;
  }
  const threshold = sum / (width * height);
  const rows = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const base = y * width;
    for (let x = 0; x < width; x += 1) if (lum[base + x] < threshold) count += 1;
    rows[y] = count;
  }
  let mean = 0;
  for (let y = 0; y < height; y += 1) mean += rows[y];
  mean /= height;
  let varSum = 0;
  for (let y = 0; y < height; y += 1) {
    const d = rows[y] - mean;
    varSum += d * d;
  }
  return varSum / height;
}

/** Nearest-neighbour downscale of RGBA data to `targetWidth` (keeps aspect). */
function downsample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  if (width <= targetWidth) return { data, width, height };
  const scale = width / targetWidth;
  const tw = targetWidth;
  const th = Math.max(1, Math.round(height / scale));
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y * scale));
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x * scale));
      const si = (sy * width + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { data: out, width: tw, height: th };
}

/**
 * Rotate RGBA pixels by `degrees` around the center into a NEW, expanded buffer
 * (so corners aren't clipped). Bilinear sampling; outside reads as white.
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

/**
 * Find the straightening rotation (degrees) for a page by trying small
 * rotations on a downsampled copy and keeping the one that best aligns text into
 * horizontal rows. Returns 0 when no rotation clearly helps (so clean pages are
 * never touched). The sign matches `rotateImageData`, so applying it straightens.
 */
export function bestDeskewDegrees(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DeskewOptions = DEFAULT_DESKEW,
): number {
  if (width < 16 || height < 16) return 0;
  const small = downsample(data, width, height, opts.sampleWidth);
  const base = rowAlignment(small.data, small.width, small.height);
  if (base <= 0) return 0;
  let best = base;
  let bestDeg = 0;
  for (let deg = -opts.maxDegrees; deg <= opts.maxDegrees; deg += opts.stepDegrees) {
    if (deg === 0) continue;
    const r = rotateImageData(small.data, small.width, small.height, deg);
    const score = rowAlignment(r.data, r.width, r.height);
    if (score > best) {
      best = score;
      bestDeg = deg;
    }
  }
  if (best / base < opts.minGain) return 0;
  return bestDeg;
}

/**
 * Auto-straighten a page. Returns the rotated buffer + dimensions, or the input
 * unchanged when no confident skew is found.
 */
export function deskewImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DeskewOptions = DEFAULT_DESKEW,
): { data: Uint8ClampedArray; width: number; height: number } {
  const deg = bestDeskewDegrees(data, width, height, opts);
  if (deg === 0) return { data, width, height };
  return rotateImageData(data, width, height, deg);
}
