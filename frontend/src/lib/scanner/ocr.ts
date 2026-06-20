/**
 * On-device text extraction (OCR) for scanned pages.
 *
 * Runs Tesseract.js entirely in the browser — the image never leaves the
 * device, which keeps scanned IDs / documents private (no server round-trip,
 * no third-party API). The worker + language data are fetched from a CDN on
 * first use and the worker is torn down after each run so we don't hold WASM
 * memory between scans.
 *
 * `recognizeText` is the DOM/worker-touching entry point; `cleanOcrText` is a
 * pure string normaliser (tested) so the messy raw output becomes something a
 * human can read, copy, or use as a filename.
 */

import { createWorker } from "tesseract.js";

export interface OcrResult {
  /** Cleaned, human-readable text (collapsed whitespace, trimmed lines). */
  text: string;
  /** Mean per-word confidence, 0–100. Low values warn the user it's a guess. */
  confidence: number;
}

export interface OcrProgress {
  /** Coarse phase label for the UI ("Loading…", "Reading text…"). */
  status: string;
  /** 0–1 progress within the current phase, when Tesseract reports it. */
  progress: number;
}

/**
 * Normalise raw OCR output into readable text. Pure and DOM-free so it can be
 * unit-tested: it strips trailing spaces, drops empty/again-empty runs to a
 * single blank line, and trims the whole block. It never invents or reorders
 * content — only whitespace is touched.
 */
export function cleanOcrText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  const out: string[] = [];
  for (const line of lines) {
    // Collapse multiple blank lines into at most one.
    if (line === "" && out[out.length - 1] === "") continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Did OCR find anything worth showing? Guards the UI against a confident-looking
 * empty result (a blank page returns "" at high confidence).
 */
export function hasUsableText(result: OcrResult): boolean {
  return result.text.replace(/\s/g, "").length >= 3;
}

/**
 * Recognise text in a canvas using Tesseract.js (English). Resolves with the
 * cleaned text + mean confidence, or rejects if the worker can't load. The
 * worker is always terminated, including on error, so memory is reclaimed.
 */
export async function recognizeText(
  canvas: HTMLCanvasElement,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const worker = await createWorker("eng", 1, {
    logger: onProgress
      ? (m: { status: string; progress: number }) => {
          onProgress({ status: m.status, progress: m.progress });
        }
      : undefined,
  });
  try {
    const { data } = await worker.recognize(canvas);
    return {
      text: cleanOcrText(data.text ?? ""),
      confidence: Math.round(data.confidence ?? 0),
    };
  } finally {
    await worker.terminate();
  }
}
