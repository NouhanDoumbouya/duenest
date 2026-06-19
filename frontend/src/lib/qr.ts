/**
 * QR scan-reliability helpers.
 *
 * Pure, dependency-free contrast math (WCAG relative luminance) used to warn —
 * honestly, never blocking — when a customized QR may be hard for a camera to
 * read. This does NOT decode the QR, so we never claim it was "scan tested";
 * we only assess colour contrast and orientation (dark-on-light vs inverted).
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rgb` / `#rrggbb` (with or without `#`) to RGB, or null if invalid. */
export function hexToRgb(hex: string): RgbColor | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: RgbColor): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1 = none, 21 = black/white). */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type QrReliabilityLevel = "ok" | "warn";

export interface QrReliability {
  level: QrReliabilityLevel;
  /** Contrast ratio, rounded to 1dp, or null if a colour was unparseable. */
  ratio: number | null;
  /** One short, user-facing message describing the most important issue. */
  message: string;
}

// QR scanners need strong dark-on-light contrast. WCAG AA text is 4.5:1; we use
// the same floor as a conservative, well-understood threshold for "reliable".
const MIN_RELIABLE_RATIO = 4.5;

/**
 * Assess whether a foreground (`dark`) / background (`light`) pair will scan
 * reliably. Returns a single, honest, non-blocking message:
 * - inverted (light foreground on dark background) → warn
 * - low contrast → warn
 * - otherwise → ok ("Looks good")
 */
export function assessQrContrast(dark: string, light: string): QrReliability {
  const fg = hexToRgb(dark);
  const bg = hexToRgb(light);
  if (!fg || !bg) {
    return { level: "warn", ratio: null, message: "Enter valid colors." };
  }
  const ratio = contrastRatio(fg, bg);
  const rounded = Math.round(ratio * 10) / 10;

  // QR readers expect dark modules on a lighter background. If the foreground is
  // lighter than the background the code is effectively inverted.
  if (relativeLuminance(fg) > relativeLuminance(bg)) {
    return {
      level: "warn",
      ratio: rounded,
      message: "Inverted colors may not scan — use a dark code on a light background.",
    };
  }
  if (ratio < MIN_RELIABLE_RATIO) {
    return {
      level: "warn",
      ratio: rounded,
      message: "May be hard to scan — use higher contrast.",
    };
  }
  return { level: "ok", ratio: rounded, message: "Looks good." };
}
