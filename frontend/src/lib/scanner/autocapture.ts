/**
 * Auto-capture decision engine + live framing coaching.
 *
 * This is the brain that makes the camera *feel* like a real scanner: it turns
 * per-frame signals (a detected document quad + quality metrics) into (a) a
 * single coaching state for the live overlay ("Move closer", "Hold steady", …)
 * and (b) a hands-free "capture now" decision once the page is well-framed,
 * sharp, lit, and held steady for a short dwell.
 *
 * Pure and DOM-free so it runs identically in the camera loop and in tests. The
 * camera layer feeds it frames and renders the overlay/auto-advance; none of
 * that visual wiring lives here.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four document corners in any order (the framing math is order-agnostic). */
export type Quad = readonly [Point, Point, Point, Point];

export type FramingState =
  | "no_document" // nothing detected
  | "move_closer" // document too small in frame
  | "too_close" // document overflows the frame
  | "center_document" // off to one side
  | "align_document" // too skewed / not flat-on
  | "hold_steady" // framed, but still moving / not yet sharp
  | "ready"; // framed well — safe to capture

export interface FramingAssessment {
  state: FramingState;
  /** Quad area as a fraction of the frame (0–1). */
  coverage: number;
}

export interface FramingOptions {
  minCoverage: number;
  maxCoverage: number;
  /** Max centroid offset from frame center, as a fraction of frame size. */
  maxOffset: number;
  /** Max opposite-side length ratio before it reads as too skewed. */
  maxSideRatio: number;
}

export const DEFAULT_FRAMING: FramingOptions = {
  minCoverage: 0.25,
  maxCoverage: 0.92,
  maxOffset: 0.18,
  maxSideRatio: 1.9,
};

function quadArea(q: Quad): number {
  // Shoelace; corners may be unordered, so take the absolute value.
  let s = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function centroid(q: Quad): Point {
  return {
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Assess how well a detected quad is framed and return one coaching state.
 * `ready` means "well framed" — it does NOT consider focus/steadiness (the
 * controller layers those on for the actual capture decision).
 */
export function assessFraming(
  quad: Quad | null,
  frameWidth: number,
  frameHeight: number,
  opts: FramingOptions = DEFAULT_FRAMING,
): FramingAssessment {
  if (!quad || frameWidth <= 0 || frameHeight <= 0) {
    return { state: "no_document", coverage: 0 };
  }
  const frameArea = frameWidth * frameHeight;
  const coverage = quadArea(quad) / frameArea;

  if (coverage < opts.minCoverage) return { state: "move_closer", coverage };
  if (coverage > opts.maxCoverage) return { state: "too_close", coverage };

  const c = centroid(quad);
  const offX = Math.abs(c.x - frameWidth / 2) / frameWidth;
  const offY = Math.abs(c.y - frameHeight / 2) / frameHeight;
  if (offX > opts.maxOffset || offY > opts.maxOffset) {
    return { state: "center_document", coverage };
  }

  // Skew: compare opposite side lengths. A flat-on page has near-equal pairs.
  const sides = [
    dist(quad[0], quad[1]),
    dist(quad[1], quad[2]),
    dist(quad[2], quad[3]),
    dist(quad[3], quad[0]),
  ];
  const ratioA = Math.max(sides[0], sides[2]) / Math.max(1, Math.min(sides[0], sides[2]));
  const ratioB = Math.max(sides[1], sides[3]) / Math.max(1, Math.min(sides[1], sides[3]));
  if (ratioA > opts.maxSideRatio || ratioB > opts.maxSideRatio) {
    return { state: "align_document", coverage };
  }

  return { state: "ready", coverage };
}

export interface FrameSignal {
  quad: Quad | null;
  frameWidth: number;
  frameHeight: number;
  /** Variance-of-Laplacian focus measure (see quality.ts `analyzeImageData`). */
  sharpness: number;
  /** Mean luminance 0–255. */
  brightness: number;
}

export interface AutoCaptureOptions extends FramingOptions {
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  /** How long the page must stay framed + sharp + still before firing (ms). */
  dwellMs: number;
  /** Max centroid movement between frames to count as "still", as a fraction. */
  stabilityFraction: number;
  /** Quiet period after a capture so we don't fire twice on one page (ms). */
  cooldownMs: number;
}

export const DEFAULT_AUTO_CAPTURE: AutoCaptureOptions = {
  ...DEFAULT_FRAMING,
  minSharpness: 60,
  minBrightness: 60,
  maxBrightness: 238,
  dwellMs: 600,
  stabilityFraction: 0.03,
  cooldownMs: 1500,
};

export interface AutoCaptureDecision {
  coaching: FramingState;
  shouldCapture: boolean;
}

/**
 * Stateful controller: feed it one frame per camera tick with a timestamp.
 * Emits a coaching state every frame and `shouldCapture: true` exactly once per
 * well-held page (then enters a cooldown). Deterministic given inputs + time.
 */
export class AutoCaptureController {
  private readonly opts: AutoCaptureOptions;
  private steadySince: number | null = null;
  private lastCentroid: Point | null = null;
  private cooldownUntil = 0;

  constructor(opts: Partial<AutoCaptureOptions> = {}) {
    this.opts = { ...DEFAULT_AUTO_CAPTURE, ...opts };
  }

  /** Clear progress (e.g. when the user pauses or switches modes). */
  reset(): void {
    this.steadySince = null;
    this.lastCentroid = null;
    this.cooldownUntil = 0;
  }

  update(signal: FrameSignal, nowMs: number): AutoCaptureDecision {
    const framing = assessFraming(
      signal.quad,
      signal.frameWidth,
      signal.frameHeight,
      this.opts,
    );

    // In cooldown, or not yet well framed: report coaching, never capture.
    if (nowMs < this.cooldownUntil || framing.state !== "ready") {
      this.steadySince = null;
      this.lastCentroid = signal.quad ? centroid(signal.quad) : null;
      return { coaching: framing.state, shouldCapture: false };
    }

    const focusOk = signal.sharpness >= this.opts.minSharpness;
    const lightOk =
      signal.brightness >= this.opts.minBrightness &&
      signal.brightness <= this.opts.maxBrightness;

    const c = signal.quad ? centroid(signal.quad) : null;
    let still = false;
    if (c && this.lastCentroid) {
      const moved = dist(c, this.lastCentroid);
      const limit =
        this.opts.stabilityFraction *
        Math.min(signal.frameWidth, signal.frameHeight);
      still = moved <= limit;
    }
    this.lastCentroid = c;

    // Framed but not yet sharp / lit / still → keep coaching to hold steady.
    if (!focusOk || !lightOk || !still) {
      this.steadySince = null;
      return { coaching: "hold_steady", shouldCapture: false };
    }

    if (this.steadySince === null) this.steadySince = nowMs;
    if (nowMs - this.steadySince >= this.opts.dwellMs) {
      this.steadySince = null;
      this.cooldownUntil = nowMs + this.opts.cooldownMs;
      return { coaching: "ready", shouldCapture: true };
    }
    return { coaching: "ready", shouldCapture: false };
  }
}

/** Short, user-facing coaching copy for the live overlay. */
export const FRAMING_COPY: Record<FramingState, string> = {
  no_document: "Point at a document",
  move_closer: "Move closer",
  too_close: "Move back a little",
  center_document: "Center the document",
  align_document: "Hold the camera flat",
  hold_steady: "Hold steady…",
  ready: "Looks good",
};
