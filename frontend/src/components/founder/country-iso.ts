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

// ISO-3166 alpha-2 codes (as emitted by CDN country headers) → canonical
// world-atlas names. Covers the common set; unknown codes fall through to the
// name-based resolution below.
const ISO2_TO_NAME: Record<string, string> = {
  AE: "United Arab Emirates",
  AF: "Afghanistan",
  AO: "Angola",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  AZ: "Azerbaijan",
  BD: "Bangladesh",
  BE: "Belgium",
  BF: "Burkina Faso",
  BG: "Bulgaria",
  BI: "Burundi",
  BJ: "Benin",
  BO: "Bolivia",
  BR: "Brazil",
  BW: "Botswana",
  BY: "Belarus",
  CA: "Canada",
  CD: "Dem. Rep. Congo",
  CF: "Central African Rep.",
  CG: "Congo",
  CH: "Switzerland",
  CI: "Côte d'Ivoire",
  CL: "Chile",
  CM: "Cameroon",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  CU: "Cuba",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  DO: "Dominican Rep.",
  DZ: "Algeria",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  ER: "Eritrea",
  ES: "Spain",
  ET: "Ethiopia",
  FI: "Finland",
  FR: "France",
  GA: "Gabon",
  GB: "United Kingdom",
  GE: "Georgia",
  GH: "Ghana",
  GL: "Greenland",
  GN: "Guinea",
  GR: "Greece",
  GT: "Guatemala",
  GY: "Guyana",
  HN: "Honduras",
  HR: "Croatia",
  HT: "Haiti",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IQ: "Iraq",
  IR: "Iran",
  IS: "Iceland",
  IT: "Italy",
  JM: "Jamaica",
  JO: "Jordan",
  JP: "Japan",
  KE: "Kenya",
  KG: "Kyrgyzstan",
  KH: "Cambodia",
  KP: "North Korea",
  KR: "South Korea",
  KW: "Kuwait",
  KZ: "Kazakhstan",
  LA: "Laos",
  LB: "Lebanon",
  LK: "Sri Lanka",
  LR: "Liberia",
  LS: "Lesotho",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  LY: "Libya",
  MA: "Morocco",
  MD: "Moldova",
  ME: "Montenegro",
  MG: "Madagascar",
  MK: "Macedonia",
  ML: "Mali",
  MM: "Myanmar",
  MN: "Mongolia",
  MR: "Mauritania",
  MW: "Malawi",
  MX: "Mexico",
  MY: "Malaysia",
  MZ: "Mozambique",
  NA: "Namibia",
  NE: "Niger",
  NG: "Nigeria",
  NI: "Nicaragua",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama",
  PE: "Peru",
  PG: "Papua New Guinea",
  PH: "Philippines",
  PK: "Pakistan",
  PL: "Poland",
  PR: "Puerto Rico",
  PT: "Portugal",
  PY: "Paraguay",
  QA: "Qatar",
  RO: "Romania",
  RS: "Serbia",
  RU: "Russia",
  RW: "Rwanda",
  SA: "Saudi Arabia",
  SD: "Sudan",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
  SL: "Sierra Leone",
  SN: "Senegal",
  SO: "Somalia",
  SR: "Suriname",
  SS: "S. Sudan",
  SV: "El Salvador",
  SY: "Syria",
  SZ: "eSwatini",
  TD: "Chad",
  TG: "Togo",
  TH: "Thailand",
  TJ: "Tajikistan",
  TL: "Timor-Leste",
  TM: "Turkmenistan",
  TN: "Tunisia",
  TR: "Turkey",
  TT: "Trinidad and Tobago",
  TW: "Taiwan",
  TZ: "Tanzania",
  UA: "Ukraine",
  UG: "Uganda",
  US: "United States of America",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VE: "Venezuela",
  VN: "Vietnam",
  YE: "Yemen",
  ZA: "South Africa",
  ZM: "Zambia",
  ZW: "Zimbabwe",
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
 * Resolve a country label (a free-text name OR an ISO-3166 alpha-2 code) to its
 * canonical world-atlas name, or null when it cannot be confidently matched
 * (the value still appears in the table).
 */
export function canonicalCountryName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // ISO alpha-2 code (e.g. "MY" from a CDN country header).
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const byCode = ISO2_TO_NAME[trimmed.toUpperCase()];
    if (byCode) return byCode;
  }
  const key = normalize(trimmed);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Title-case fallback (e.g. "malaysia" -> "Malaysia") which matches most
  // single-word world-atlas names directly.
  return trimmed
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word,
    )
    .join(" ");
}

/**
 * A friendly display label for a country value (resolves ISO codes to names),
 * falling back to the original string when unknown.
 */
export function displayCountryLabel(raw: string): string {
  return canonicalCountryName(raw) ?? raw;
}
