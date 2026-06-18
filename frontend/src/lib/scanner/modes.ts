/**
 * Scan modes: friendly presets that map to existing, safe scanner settings
 * (filter + export quality). They are user-chosen guidance — NOT automatic
 * document recognition — so nothing is classified or claimed on the user's
 * behalf. Each mode only nudges defaults; the user can still adjust everything.
 */
import type { FilterId } from "./filters";

export interface ScanMode {
  id: string;
  label: string;
  hint: string;
  filterId: FilterId;
  quality: "standard" | "hd";
}

export const SCAN_MODES: ScanMode[] = [
  {
    id: "document",
    label: "Document",
    hint: "Balanced, clean output",
    filterId: "auto",
    quality: "standard",
  },
  {
    id: "id",
    label: "ID / Passport",
    hint: "Preserves photo and colour",
    filterId: "id-passport",
    quality: "standard",
  },
  {
    id: "certificate",
    label: "Certificate",
    hint: "Keeps seals and signatures clear",
    filterId: "signature-stamp",
    quality: "hd",
  },
  {
    id: "receipt",
    label: "Receipt",
    hint: "Improves faded text",
    filterId: "receipt",
    quality: "standard",
  },
  {
    id: "application",
    label: "Application",
    hint: "Clean PDF for submission",
    filterId: "auto",
    quality: "hd",
  },
  {
    id: "photo",
    label: "Photo evidence",
    hint: "Preserves the original look",
    filterId: "original",
    quality: "hd",
  },
];
