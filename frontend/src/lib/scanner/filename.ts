/**
 * Filename template helpers for the scanner. These only *suggest* clean names
 * from context the user picks (document type + date/year) — nothing is invented
 * or guessed, and the field stays fully editable. Sanitization keeps names safe
 * for the filesystem and object storage.
 */

export const FILENAME_TYPE_CHIPS = [
  "Passport",
  "Visa",
  "ID",
  "Licence",
  "Insurance",
  "Certificate",
] as const;

/** Max basename length (no extension), matching the scanner's save sanitizer. */
export const MAX_BASENAME_LEN = 80;

/**
 * Collapse to a safe basename: strip characters that aren't word/space/hyphen,
 * turn whitespace runs into single underscores, trim stray underscores, cap
 * length. Returns `fallback` when nothing usable remains.
 */
export function cleanFilename(input: string, fallback = "Scan"): string {
  const cleaned = input
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, MAX_BASENAME_LEN);
  return cleaned || fallback;
}

/** Build a clean suggested basename like `Passport_2026` or `Visa_2026-06-18`. */
export function suggestFilename(
  type: string,
  opts: { withYear?: boolean; withDate?: boolean } = {},
  now: Date = new Date(),
): string {
  const parts = [type];
  if (opts.withDate) parts.push(now.toISOString().slice(0, 10));
  else if (opts.withYear) parts.push(String(now.getFullYear()));
  return cleanFilename(parts.join("_"));
}
