/**
 * Document-enhancement primitives that lift the scanner output toward real
 * "looks like a scanner, not a phone photo" quality. All functions are pure
 * (no DOM), operate on RGBA `Uint8ClampedArray` in place, and are unit-tested
 * on synthetic data — so they run identically in the live preview, the final
 * render, and tests.
 *
 * Techniques (the gaps a global tone curve can't fix):
 * - local **box mean** (separable, Float32 — memory-safe, no huge integral
 *   images) → the shared building block.
 * - **adaptive-mean binarization** (à la OpenCV ADAPTIVE_THRESH_MEAN_C): a
 *   per-pixel threshold from the local mean, so uneven lighting/shadows don't
 *   smear or drop text the way a single global cutoff does.
 * - **illumination flattening**: estimate the background light field with a
 *   large-radius blur and divide it out → uniformly white pages even with a
 *   shadow gradient or vignette.
 * - **gray-world white balance**: equalize channel means → removes warm/cool
 *   colour casts.
 * - **Otsu**: a data-driven global threshold (cheap fallback).
 * - mild **unsharp mask**: crisp text after enhancement.
 */

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/** Extract a luminance plane (Float32) from RGBA data. */
export function toLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 1) {
    out[j] = luminance(data[i], data[i + 1], data[i + 2]);
  }
  return out;
}

/**
 * Mean of `gray` over a (2r+1)² box, computed separably with edge-correct
 * counts. Float32 windowed sums stay exact (bounded by window²·255), so this
 * never needs a full Float64 integral image. Returns a per-pixel mean plane.
 */
export function boxMean(
  gray: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const r = Math.max(1, Math.floor(radius));
  const hSum = new Float32Array(width * height);
  // Per-column / per-row clamped window widths (area = hCount[x] * vCount[y]).
  const hCount = new Float32Array(width);
  const vCount = new Float32Array(height);
  for (let x = 0; x < width; x += 1) {
    hCount[x] = Math.min(x + r, width - 1) - Math.max(x - r, 0) + 1;
  }
  for (let y = 0; y < height; y += 1) {
    vCount[y] = Math.min(y + r, height - 1) - Math.max(y - r, 0) + 1;
  }

  // Horizontal running sum per row.
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= r && x < width; x += 1) sum += gray[row + x];
    for (let x = 0; x < width; x += 1) {
      hSum[row + x] = sum;
      const addX = x + r + 1;
      const subX = x - r;
      if (addX < width) sum += gray[row + addX];
      if (subX >= 0) sum -= gray[row + subX];
    }
  }

  // Vertical running sum of hSum per column → box sum; divide by area for mean.
  const mean = new Float32Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y <= r && y < height; y += 1) sum += hSum[y * width + x];
    for (let y = 0; y < height; y += 1) {
      mean[y * width + x] = sum / (hCount[x] * vCount[y]);
      const addY = y + r + 1;
      const subY = y - r;
      if (addY < height) sum += hSum[addY * width + x];
      if (subY >= 0) sum -= hSum[subY * width + x];
    }
  }
  return mean;
}

/** A radius that scales with image size, clamped to a sensible range. */
function scaledRadius(
  width: number,
  height: number,
  fraction: number,
  min: number,
  max: number,
): number {
  const r = Math.round(Math.min(width, height) * fraction);
  return Math.max(min, Math.min(max, r));
}

/**
 * Adaptive-mean binarization: each pixel becomes black/white by comparing its
 * luminance to the LOCAL mean minus a small bias `c`. Uneven lighting no longer
 * smears text to black or drops it to white the way a global threshold does.
 */
export function adaptiveMeanBinarizeInPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { radius?: number; c?: number } = {},
): Uint8ClampedArray {
  const gray = toLuminance(data, width, height);
  const radius = opts.radius ?? scaledRadius(width, height, 0.02, 8, 40);
  const c = opts.c ?? 8;
  const mean = boxMean(gray, width, height, radius);
  for (let j = 0, i = 0; j < gray.length; j += 1, i += 4) {
    const v = gray[j] > mean[j] - c ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return data;
}

/**
 * Illumination flattening: estimate the background light field with a large
 * blur and lift each pixel so the background reads as `target` white. Only
 * brightens (gain ≥ 1), so it removes shadow gradients/vignette without crushing
 * content. Skips images whose background is already uniform and bright.
 */
export function flattenIlluminationInPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { target?: number; maxGain?: number } = {},
): Uint8ClampedArray {
  const target = opts.target ?? 235;
  const maxGain = opts.maxGain ?? 2.6;
  const gray = toLuminance(data, width, height);
  const radius = scaledRadius(width, height, 0.12, 12, 220);
  const bg = boxMean(gray, width, height, radius);

  // If the background is already even and bright, leave the scan alone.
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < bg.length; j += 1) {
    if (bg[j] < min) min = bg[j];
    if (bg[j] > max) max = bg[j];
  }
  if (min > 200 && max - min < 18) return data;

  for (let j = 0, i = 0; j < bg.length; j += 1, i += 4) {
    let gain = target / Math.max(bg[j], 1);
    if (gain < 1) gain = 1;
    if (gain > maxGain) gain = maxGain;
    data[i] = clamp8(data[i] * gain);
    data[i + 1] = clamp8(data[i + 1] * gain);
    data[i + 2] = clamp8(data[i + 2] * gain);
  }
  return data;
}

/**
 * Gray-world white balance: equalize per-channel means so a warm/cool colour
 * cast neutralizes. Gains are clamped so we never wildly tint a genuinely
 * coloured document.
 */
export function grayWorldWhiteBalanceInPlace(
  data: Uint8ClampedArray,
): Uint8ClampedArray {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const n = data.length / 4;
  if (n === 0) return data;
  for (let i = 0; i < data.length; i += 4) {
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
  }
  const mr = sr / n || 1;
  const mg = sg / n || 1;
  const mb = sb / n || 1;
  const gray = (mr + mg + mb) / 3;
  const clampGain = (x: number) => Math.max(0.6, Math.min(1.8, x));
  const gr = clampGain(gray / mr);
  const gg = clampGain(gray / mg);
  const gb = clampGain(gray / mb);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp8(data[i] * gr);
    data[i + 1] = clamp8(data[i + 1] * gg);
    data[i + 2] = clamp8(data[i + 2] * gb);
  }
  return data;
}

/**
 * CLAHE-style local contrast (Contrast-Limited Adaptive Histogram Equalization)
 * on luminance, the trick that makes faded / unevenly-lit documents "pop" the
 * way a global contrast curve can't. The image is split into a grid of tiles;
 * each tile gets a clipped, equalized tone map; every pixel is remapped by
 * bilinearly blending the four nearest tile maps (so there are no tile seams).
 * Colour is preserved by scaling each channel by the luminance change.
 */
export function localContrastInPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { tiles?: number; clipLimit?: number; strength?: number } = {},
): Uint8ClampedArray {
  const tiles = Math.max(2, opts.tiles ?? 8);
  const clipLimit = opts.clipLimit ?? 0.08;
  const strength = opts.strength ?? 1;
  if (width < tiles || height < tiles) return data;

  const tw = Math.ceil(width / tiles);
  const th = Math.ceil(height / tiles);
  const gray = toLuminance(data, width, height);

  // Per-tile tone map (256-entry LUT) from a clipped, equalized histogram.
  const maps: Uint8ClampedArray[] = [];
  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = Math.min(x0 + tw, width);
      const y1 = Math.min(y0 + th, height);
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        const row = y * width;
        for (let x = x0; x < x1; x += 1) {
          hist[gray[row + x] | 0] += 1;
          count += 1;
        }
      }
      const map = new Uint8ClampedArray(256);
      if (count === 0) {
        for (let i = 0; i < 256; i += 1) map[i] = i;
        maps.push(map);
        continue;
      }
      // Clip the histogram and redistribute the excess uniformly.
      const limit = Math.max(1, Math.floor(clipLimit * count));
      let excess = 0;
      for (let i = 0; i < 256; i += 1) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const bonus = excess / 256;
      // Equalize: normalized CDF → 0..255.
      let cdf = 0;
      for (let i = 0; i < 256; i += 1) {
        cdf += hist[i] + bonus;
        map[i] = clamp8((cdf / count) * 255);
      }
      maps.push(map);
    }
  }

  const mapAt = (tx: number, ty: number, v: number) =>
    maps[Math.max(0, Math.min(tiles - 1, ty)) * tiles + Math.max(0, Math.min(tiles - 1, tx))][v];

  for (let y = 0; y < height; y += 1) {
    // Tile coordinate of this row relative to tile CENTERS.
    const fy = (y - th / 2) / th;
    const ty0 = Math.floor(fy);
    const wy = fy - ty0;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const g = gray[idx] | 0;
      const fx = (x - tw / 2) / tw;
      const tx0 = Math.floor(fx);
      const wx = fx - tx0;
      // Bilinear blend of the four neighbouring tile maps.
      const top =
        mapAt(tx0, ty0, g) * (1 - wx) + mapAt(tx0 + 1, ty0, g) * wx;
      const bot =
        mapAt(tx0, ty0 + 1, g) * (1 - wx) + mapAt(tx0 + 1, ty0 + 1, g) * wx;
      const mapped = top * (1 - wy) + bot * wy;
      const target = gray[idx] + (mapped - gray[idx]) * strength;
      const ratio = target / Math.max(gray[idx], 1);
      const i = idx * 4;
      data[i] = clamp8(data[i] * ratio);
      data[i + 1] = clamp8(data[i + 1] * ratio);
      data[i + 2] = clamp8(data[i + 2] * ratio);
    }
  }
  return data;
}

/** Otsu's optimal global threshold (0–255) from the luminance histogram. */
export function otsuThreshold(
  data: Uint8ClampedArray,
): number {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    hist[luminance(data[i], data[i + 1], data[i + 2]) | 0] += 1;
    total += 1;
  }
  if (total === 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Mild unsharp mask on luminance: adds `amount` of the high-frequency detail
 * back to each channel so text edges crisp up after tone work. Colour is
 * preserved (the same luminance delta is applied to R/G/B).
 */
export function unsharpMaskInPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.6,
): Uint8ClampedArray {
  const gray = toLuminance(data, width, height);
  const blur = boxMean(gray, width, height, 1);
  for (let j = 0, i = 0; j < gray.length; j += 1, i += 4) {
    const detail = (gray[j] - blur[j]) * amount;
    data[i] = clamp8(data[i] + detail);
    data[i + 1] = clamp8(data[i + 1] + detail);
    data[i + 2] = clamp8(data[i + 2] + detail);
  }
  return data;
}
