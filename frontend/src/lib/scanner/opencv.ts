import { deskewImageData } from "./deskew";
import type { Point, Quad } from "./types";

/**
 * Minimal typed surface of the OpenCV.js objects we actually use. OpenCV.js is
 * dynamically typed; this keeps call sites type-checked without `any` and makes
 * the Mat lifecycle (every Mat must be `.delete()`d) explicit.
 */
interface CvMat {
  delete(): void;
  rows: number;
  cols: number;
  data32S: Int32Array;
  data32F: Float32Array;
}

interface CvMatVector {
  size(): number;
  get(i: number): CvMat;
  delete(): void;
}

interface CvSize {
  width: number;
  height: number;
}

interface OpenCv {
  Mat: {
    new (): CvMat;
    new (rows: number, cols: number, type: number): CvMat;
  };
  MatVector: { new (): CvMatVector };
  Size: { new (w: number, h: number): CvSize };
  matFromArray(rows: number, cols: number, type: number, arr: number[]): CvMat;
  imread(canvas: HTMLCanvasElement): CvMat;
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  GaussianBlur(src: CvMat, dst: CvMat, size: CvSize, sigmaX: number): void;
  Canny(src: CvMat, dst: CvMat, t1: number, t2: number): void;
  dilate(src: CvMat, dst: CvMat, kernel: CvMat): void;
  findContours(
    img: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: CvMat): number;
  arcLength(contour: CvMat, closed: boolean): number;
  approxPolyDP(contour: CvMat, approx: CvMat, epsilon: number, closed: boolean): void;
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat;
  warpPerspective(src: CvMat, dst: CvMat, m: CvMat, size: CvSize): void;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_32FC2: number;
  onRuntimeInitialized?: () => void;
}

declare global {
  interface Window {
    cv?: OpenCv & { then?: unknown };
  }
}

const OPENCV_CDN_URL = "https://docs.opencv.org/4.10.0/opencv.js";
const SCRIPT_ID = "duenest-opencv-js";

let loadPromise: Promise<OpenCv> | null = null;

/**
 * Load OpenCV.js from the CDN exactly once, resolving when the WASM runtime is
 * ready. Rejects on network error or timeout so the caller can degrade (manual
 * cropping still works without auto edge detection).
 */
export function loadOpenCv(timeoutMs = 20000): Promise<OpenCv> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV is browser-only."));
  }
  if (window.cv && typeof window.cv.imread === "function") {
    return Promise.resolve(window.cv as OpenCv);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<OpenCv>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("OpenCV failed to load in time."));
    }, timeoutMs);

    const settle = () => {
      const cv = window.cv;
      if (!cv) return;
      // OpenCV signals readiness via onRuntimeInitialized (or it is already up).
      const ready = () => {
        window.clearTimeout(timer);
        resolve(cv as OpenCv);
      };
      if (typeof cv.imread === "function") ready();
      else cv.onRuntimeInitialized = ready;
    };

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (script) {
      settle();
      return;
    }
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = OPENCV_CDN_URL;
    script.async = true;
    script.onload = settle;
    script.onerror = () => {
      window.clearTimeout(timer);
      loadPromise = null;
      reject(new Error("OpenCV failed to load."));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

function orderCorners(points: Point[]): Quad {
  // Top-left has the smallest x+y; bottom-right the largest. Top-right has the
  // smallest y-x; bottom-left the largest. Robust to arbitrary contour order.
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const tr = byDiff[0];
  const bl = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

/**
 * Detect the largest 4-point document-like contour in a canvas. Returns corners
 * in source-pixel space or `null` when no confident quad is found. Every Mat is
 * released in `finally`, including on the early-return paths.
 */
export function detectQuadFromCanvas(cv: OpenCv, canvas: HTMLCanvasElement): Quad | null {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  let best: Quad | null = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 60, 180);
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const frameArea = src.rows * src.cols;
    let bestArea = frameArea * 0.15; // ignore tiny noise contours

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const peri = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          const area = cv.contourArea(approx);
          if (area > bestArea) {
            const pts: Point[] = [];
            for (let p = 0; p < 4; p += 1) {
              pts.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
            }
            best = orderCorners(pts);
            bestArea = area;
          }
        }
      } finally {
        approx.delete();
        contour.delete();
      }
    }
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
  }

  return best;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Flatten the document defined by `quad` into a new upright canvas using
 * getPerspectiveTransform + warpPerspective. Output size is derived from the
 * quad's edge lengths. All Mats are released.
 */
export function warpToCanvas(
  cv: OpenCv,
  source: HTMLCanvasElement,
  quad: Quad,
): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad;
  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);
  const outW = Math.max(1, Math.round(Math.max(widthTop, widthBottom)));
  const outH = Math.max(1, Math.round(Math.max(heightLeft, heightRight)));

  const src = cv.imread(source);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;

  try {
    cv.warpPerspective(src, dst, transform, new cv.Size(outW, outH));
    cv.imshow(out, dst);
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    transform.delete();
  }

  // Auto-straighten residual skew (text not parallel to the cropped edges).
  // Best-effort and self-correcting: it only rotates when it clearly improves
  // row alignment, and never the wrong way — so a clean page is left untouched.
  try {
    const octx = out.getContext("2d");
    if (octx) {
      const img = octx.getImageData(0, 0, out.width, out.height);
      const fixed = deskewImageData(img.data, out.width, out.height);
      if (fixed.data !== img.data) {
        const straight = document.createElement("canvas");
        straight.width = fixed.width;
        straight.height = fixed.height;
        const sctx = straight.getContext("2d");
        if (sctx) {
          const id = sctx.createImageData(fixed.width, fixed.height);
          id.data.set(fixed.data);
          sctx.putImageData(id, 0, 0);
          return straight;
        }
      }
    }
  } catch {
    // Deskew is optional polish — fall back to the un-rotated page on any error.
  }
  return out;
}
