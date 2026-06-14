// Maps free-text country labels (as stored on product events / waitlist entries)
// to the canonical country names used by the world-atlas 110m dataset, so the
// Global Map can shade the right country. Matching is privacy-safe and purely
// at the country level — no city, coordinate, or IP data is ever involved.

// Canonical names that differ from common informal spellings. Keys are compared
// in a normalized (lower-cased, punctuation-stripped) form.
const ALIASES: Record<string, string> = {
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  usa: "United States of America",
  us: "United States of America",
  america: "United States of America",
  "united states": "United States of America",
  "united states of america": "United States of America",
  uk: "United Kingdom",
  "u k": "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  "united kingdom": "United Kingdom",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  korea: "South Korea",
  "north korea": "North Korea",
  russia: "Russia",
  "russian federation": "Russia",
  "czech republic": "Czechia",
  czechia: "Czechia",
  "ivory coast": "Côte d'Ivoire",
  "cote divoire": "Côte d'Ivoire",
  "côte divoire": "Côte d'Ivoire",
  drc: "Dem. Rep. Congo",
  "democratic republic of the congo": "Dem. Rep. Congo",
  "democratic republic of congo": "Dem. Rep. Congo",
  "republic of the congo": "Congo",
  congo: "Congo",
  "dominican republic": "Dominican Rep.",
  "bosnia and herzegovina": "Bosnia and Herz.",
  bosnia: "Bosnia and Herz.",
  "south sudan": "S. Sudan",
  "equatorial guinea": "Eq. Guinea",
  "central african republic": "Central African Rep.",
  "western sahara": "W. Sahara",
  swaziland: "eSwatini",
  eswatini: "eSwatini",
  "north macedonia": "Macedonia",
  macedonia: "Macedonia",
  myanmar: "Myanmar",
  burma: "Myanmar",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  laos: "Laos",
  syria: "Syria",
  "syrian arab republic": "Syria",
  iran: "Iran",
  tanzania: "Tanzania",
  "timor leste": "Timor-Leste",
  "east timor": "Timor-Leste",
  "trinidad and tobago": "Trinidad and Tobago",
  "papua new guinea": "Papua New Guinea",
  "saudi arabia": "Saudi Arabia",
  "sri lanka": "Sri Lanka",
  "new zealand": "New Zealand",
  "south africa": "South Africa",
  "hong kong": "China",
  "puerto rico": "Puerto Rico",
};

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-zÀ-ɏ\s']/g, "")
    .trim();
}

/**
 * Resolve a free-text country label to its canonical world-atlas name, or null
 * when it cannot be confidently matched (the value still appears in the table).
 */
export function canonicalCountryName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalize(raw);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Title-case fallback (e.g. "malaysia" -> "Malaysia") which matches most
  // single-word world-atlas names directly.
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word,
    )
    .join(" ");
}
