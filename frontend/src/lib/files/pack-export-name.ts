/**
 * Application-friendly export names for application packs.
 *
 * Suggests a clean, professional filename from the pack's title (and optional
 * target date) and sanitizes user edits. Nothing sensitive is added
 * automatically and the field stays fully editable — these are suggestions
 * only. The cleaner mirrors the server-side `sanitize_export_basename` so the
 * preview matches the downloaded filename.
 */

/** Max basename length (no extension), matching the server sanitizer. */
export const MAX_PACK_NAME_LEN = 80;

/**
 * Collapse to a safe basename (case preserved): strip characters that aren't
 * word/space/hyphen, turn whitespace/hyphen runs into single underscores, trim
 * stray underscores, cap length. Returns `fallback` when nothing usable remains.
 */
export function cleanPackName(input: string, fallback = "Pack"): string {
  const cleaned = (input ?? "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_PACK_NAME_LEN);
  return cleaned || fallback;
}

/**
 * Suggest a clean export basename from a pack title and optional target date.
 * Appends the year only when the title doesn't already contain a 4-digit year,
 * so we never produce names like `Visa_2026_2026`.
 */
export function suggestPackExportName(
  title: string,
  targetDate?: string | null,
  now: Date = new Date(),
): string {
  const base = (title ?? "").trim();
  let year: number | null = null;
  if (!/\b\d{4}\b/.test(base)) {
    const fromTarget = targetDate ? new Date(targetDate).getFullYear() : NaN;
    year = Number.isFinite(fromTarget) ? fromTarget : now.getFullYear();
  }
  const parts = year ? [base, String(year)] : [base];
  return cleanPackName(parts.join(" "));
}
