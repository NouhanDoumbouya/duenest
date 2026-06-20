/**
 * Smart (assistive) redaction: find sensitive text in OCR word boxes and turn it
 * into redaction rectangles for the user to review.
 *
 * Pure and DOM-free (except the OCR call lives in `ocr.ts`) so the matching logic
 * is unit-tested. Auto-redaction is ASSISTIVE — patterns can miss or over-match, so
 * the caller always lets the user review before applying. Boxes are returned in the
 * same normalized 0..1 space as `RedactionRect`.
 */

import type { OcrWord } from "./ocr";
import { isMeaningfulRect, type RedactionRect } from "./redaction";

export type RedactionPreset = "bank" | "contact" | "all" | "custom";

export interface FindRedactionsOptions {
  preset: RedactionPreset;
  /** Required when preset === "custom"; matched case-insensitively per word. */
  term?: string;
}

const digitsOnly = (text: string) => text.replace(/\D/g, "");

/** Account / card numbers: a word with 8+ digits (spaces/dashes allowed within). */
function isLongNumber(text: string): boolean {
  return digitsOnly(text).length >= 8 && /^[\d\s-]+$/.test(text.trim());
}

/** UK-style sort code: 12-34-56 / 12 34 56 / 123456. */
function isSortCode(text: string): boolean {
  return /^\d{2}[-\s]?\d{2}[-\s]?\d{2}$/.test(text.trim());
}

/** IBAN: 2 letters + 2 digits + 10–30 alphanumerics. */
function isIban(text: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(text.replace(/\s/g, "").toUpperCase());
}

function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** Phone: 9–15 digits made only of phone-ish characters. */
function isPhone(text: string): boolean {
  const trimmed = text.trim();
  const digits = digitsOnly(trimmed);
  return digits.length >= 9 && digits.length <= 15 && /^[+\d][\d\s()-]+$/.test(trimmed);
}

function customMatcher(term: string): (text: string) => boolean {
  // Match a word against any meaningful token of the term ("John Smith" hits the
  // separate OCR words "John" and "Smith").
  const tokens = term
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return (text: string) => {
    const word = text.toLowerCase().trim();
    if (!word) return false;
    return tokens.some((tok) => word.includes(tok) || tok.includes(word));
  };
}

const BANK = [isLongNumber, isSortCode, isIban];
const CONTACT = [isEmail, isPhone];

function matchersFor(options: FindRedactionsOptions): ((text: string) => boolean)[] {
  switch (options.preset) {
    case "bank":
      return BANK;
    case "contact":
      return CONTACT;
    case "all":
      return [...BANK, ...CONTACT];
    case "custom":
      return options.term?.trim() ? [customMatcher(options.term)] : [];
  }
}

/** Whether a single word's text counts as sensitive under the given options. */
export function wordIsSensitive(
  text: string,
  options: FindRedactionsOptions,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return matchersFor(options).some((test) => test(trimmed));
}

// Padding (as a fraction of the page) added around each matched word so the box
// comfortably covers the glyphs.
const PAD = 0.004;

/**
 * Turn matching OCR words into normalized redaction rects. `canvasW`/`canvasH` are
 * the pixel dimensions of the page the boxes came from.
 */
export function findRedactions(
  words: OcrWord[],
  options: FindRedactionsOptions,
  canvasW: number,
  canvasH: number,
): RedactionRect[] {
  if (canvasW <= 0 || canvasH <= 0) return [];
  const tests = matchersFor(options);
  if (tests.length === 0) return [];

  const rects: RedactionRect[] = [];
  for (const word of words) {
    const text = word.text.trim();
    if (!text || !tests.some((test) => test(text))) continue;

    const x = Math.max(0, word.bbox.x0 / canvasW - PAD);
    const y = Math.max(0, word.bbox.y0 / canvasH - PAD);
    const rect: RedactionRect = {
      x,
      y,
      w: Math.min(1 - x, (word.bbox.x1 - word.bbox.x0) / canvasW + PAD * 2),
      h: Math.min(1 - y, (word.bbox.y1 - word.bbox.y0) / canvasH + PAD * 2),
    };
    if (isMeaningfulRect(rect)) rects.push(rect);
  }
  return rects;
}
