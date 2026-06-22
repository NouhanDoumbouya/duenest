// Pure, framework-free helpers for the Emergency Protocol experience. Kept free
// of React/network so they can be unit-tested in isolation (see
// emergency-protocol.test.ts).

import type {
  EmergencyPack,
  EmergencyUnlockMode,
  EmergencyUnlockStatus,
} from "@/types/emergency";

// ---- Readiness + checklist -------------------------------------------------

export type EmergencyReadinessStatus =
  | "not_started"
  | "incomplete"
  | "ready"
  | "disabled"
  | "needs_review";

export interface ChecklistStep {
  key: string;
  label: string;
  done: boolean;
  optional?: boolean;
}

export interface EmergencyReadiness {
  percent: number;
  completed: number;
  total: number;
  status: EmergencyReadinessStatus;
  steps: ChecklistStep[];
  nextStep: string | null;
}

const REVIEW_INTERVAL_DAYS = 180;

/**
 * Build the setup checklist for a pack. `contactsCount` is passed in because the
 * pack payload does not embed trusted contacts.
 */
export function buildEmergencyChecklist(
  pack: Pick<
    EmergencyPack,
    "item_count" | "status" | "unlock_mode" | "location_enabled" | "metadata"
  >,
  contactsCount: number,
): ChecklistStep[] {
  const tested = Boolean(
    pack.metadata && (pack.metadata as Record<string, unknown>).tested,
  );
  return [
    {
      key: "documents",
      label: "Select emergency documents",
      done: pack.item_count > 0,
    },
    {
      key: "contact",
      label: "Add a trusted contact",
      done: contactsCount > 0,
    },
    {
      key: "unlock_rule",
      label: "Choose an unlock rule",
      done: Boolean(pack.unlock_mode),
    },
    {
      key: "activate",
      label: "Generate emergency QR / activate",
      done: pack.status === "active",
    },
    {
      key: "test",
      label: "Test emergency access",
      done: tested,
    },
    {
      key: "location",
      label: "Enable emergency location",
      done: pack.location_enabled,
      optional: true,
    },
  ];
}

export function computeEmergencyReadiness(
  pack: Pick<
    EmergencyPack,
    | "item_count"
    | "status"
    | "unlock_mode"
    | "location_enabled"
    | "metadata"
    | "last_reviewed_at"
  >,
  contactsCount: number,
  now: Date = new Date(),
): EmergencyReadiness {
  const steps = buildEmergencyChecklist(pack, contactsCount);
  const core = steps.filter((s) => !s.optional);
  const completed = core.filter((s) => s.done).length;
  const total = core.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  // "Started" means a meaningful action was taken — the unlock rule always has
  // a default value, so it does not count toward starting.
  const meaningfulDone = core.some((s) => s.key !== "unlock_rule" && s.done);

  let status: EmergencyReadinessStatus;
  if (pack.status === "disabled") {
    status = "disabled";
  } else if (!meaningfulDone) {
    status = "not_started";
  } else if (completed < total) {
    status = "incomplete";
  } else {
    status = "ready";
    // Surface a gentle review prompt once the setup is stale.
    if (pack.last_reviewed_at) {
      const reviewed = new Date(pack.last_reviewed_at).getTime();
      const ageDays = (now.getTime() - reviewed) / (1000 * 60 * 60 * 24);
      if (ageDays > REVIEW_INTERVAL_DAYS) status = "needs_review";
    }
  }

  const firstIncomplete = core.find((s) => !s.done);
  return {
    percent,
    completed,
    total,
    status,
    steps,
    nextStep: firstIncomplete ? firstIncomplete.label : null,
  };
}

export const READINESS_LABELS: Record<EmergencyReadinessStatus, string> = {
  not_started: "Not started",
  incomplete: "Incomplete",
  ready: "Ready",
  disabled: "Disabled",
  needs_review: "Needs review",
};

export function getReadinessTone(status: EmergencyReadinessStatus): string {
  switch (status) {
    case "ready":
      return "bg-brand-success/10 text-brand-success";
    case "needs_review":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "disabled":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ---- Unlock modes ----------------------------------------------------------

export interface UnlockModeInfo {
  value: EmergencyUnlockMode;
  label: string;
  description: string;
  bestFor: string;
  tone: "calm" | "warning";
}

export const UNLOCK_MODES: UnlockModeInfo[] = [
  {
    value: "delayed",
    label: "Delayed unlock",
    description:
      "Access unlocks after the selected delay unless you deny the request.",
    bestFor: "Use delayed unlock if you may be unavailable during an emergency.",
    tone: "calm",
  },
  {
    value: "owner_approval",
    label: "Owner approval only",
    description: "Access opens only if you approve the request.",
    bestFor: "Best for everyday trusted sharing and non-urgent access.",
    tone: "calm",
  },
  {
    value: "instant_code",
    label: "Instant with code",
    description:
      "Anyone with the QR and code can open selected documents immediately.",
    bestFor: "Use only with people you deeply trust — this is less private.",
    tone: "warning",
  },
  {
    value: "disabled_until_activated",
    label: "Disabled until activated",
    description: "The QR is prepared, but access stays closed until you activate it.",
    bestFor: "Prepare everything now and open access only when needed.",
    tone: "calm",
  },
];

export function buildUnlockModeDescription(
  mode: EmergencyUnlockMode,
): UnlockModeInfo {
  return UNLOCK_MODES.find((m) => m.value === mode) ?? UNLOCK_MODES[0];
}

export const UNLOCK_DELAY_OPTIONS = [1, 6, 12, 24, 48] as const;

export const UNLOCK_STATUS_LABELS: Record<EmergencyUnlockStatus, string> = {
  pending: "Waiting for approval",
  countdown: "Counting down",
  unlocked: "Unlocked",
  denied: "Denied",
  revoked: "Revoked",
  expired: "Expired",
};

// ---- Countdown formatting --------------------------------------------------

/** Human "in 23h 5m" / "in 4m" / "now" for a future unlock time. */
export function formatUnlockCountdown(
  unlockAtISO: string | null,
  now: Date = new Date(),
): string {
  if (!unlockAtISO) return "";
  const target = new Date(unlockAtISO).getTime();
  const diffMs = target - now.getTime();
  if (diffMs <= 0) return "now";
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return `in ${parts.join(" ")}`;
}

// ---- Access codes ----------------------------------------------------------

/** Strip formatting to a comparable canonical code (uppercase alphanumerics). */
export function normalizeEmergencyCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Present a code as DN-482913 style for printed cards (display only). */
export function formatEmergencyCode(value: string): string {
  const clean = normalizeEmergencyCode(value);
  if (!clean) return "";
  const withPrefix = clean.startsWith("DN") ? clean : `DN${clean}`;
  return `${withPrefix.slice(0, 2)}-${withPrefix.slice(2)}`;
}

// ---- Printable card formats ------------------------------------------------

export type PrintFormat =
  | "wallet"
  | "passport"
  | "a6"
  | "a5"
  | "full_sheet";

export interface PrintFormatInfo {
  value: PrintFormat;
  label: string;
  description: string;
  widthMm: number;
  heightMm: number;
}

export const PRINT_FORMATS: PrintFormatInfo[] = [
  {
    value: "wallet",
    label: "Wallet card",
    description: "Small card for a wallet, passport holder, or travel pouch.",
    widthMm: 85.6,
    heightMm: 53.98,
  },
  {
    value: "passport",
    label: "Passport insert",
    description: "Designed to sit with your travel documents.",
    widthMm: 88,
    heightMm: 125,
  },
  {
    value: "a6",
    label: "A6 card",
    description: "Compact print with more readable instructions.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    value: "a5",
    label: "A5 emergency sheet",
    description: "Good for a document folder.",
    widthMm: 148,
    heightMm: 210,
  },
  {
    value: "full_sheet",
    label: "Full emergency sheet",
    description: "Best for a home or family emergency binder.",
    widthMm: 210,
    heightMm: 297,
  },
];

export function getPrintFormatDimensions(format: PrintFormat): PrintFormatInfo {
  return PRINT_FORMATS.find((f) => f.value === format) ?? PRINT_FORMATS[0];
}

export interface PrintableCardOptions {
  includeQr: boolean;
  includeCode: boolean;
  includeName: boolean;
  includeContactName: boolean;
  includeContactPhone: boolean;
  includeNote: boolean;
  includeDocumentList: boolean;
}

/** Privacy-safe defaults: QR + selected-only message; no sensitive data. */
export const DEFAULT_CARD_OPTIONS: PrintableCardOptions = {
  includeQr: true,
  includeCode: false,
  includeName: false,
  includeContactName: false,
  includeContactPhone: false,
  includeNote: false,
  includeDocumentList: false,
};

export interface PrintableCardData {
  heading: string;
  instruction: string;
  lockedMessage: string;
  selectedOnlyMessage: string;
  code: string | null;
  name: string | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
}

export function buildPrintableCardData(
  pack: Pick<EmergencyPack, "title" | "unlock_mode">,
  options: PrintableCardOptions,
  extras: {
    code?: string;
    name?: string;
    contactName?: string;
    contactPhone?: string;
    note?: string;
  } = {},
): PrintableCardData {
  const instant = pack.unlock_mode === "instant_code";
  return {
    heading: "CertaNest Emergency Access",
    instruction: "If I need help, scan this QR.",
    lockedMessage: instant
      ? "This QR opens selected documents with the access code."
      : "Access is locked by default. This QR only starts an emergency request.",
    selectedOnlyMessage: "Selected documents only. My full vault is never exposed.",
    code: options.includeCode && extras.code ? formatEmergencyCode(extras.code) : null,
    name: options.includeName && extras.name ? extras.name : null,
    contactName:
      options.includeContactName && extras.contactName ? extras.contactName : null,
    contactPhone:
      options.includeContactPhone && extras.contactPhone ? extras.contactPhone : null,
    note: options.includeNote && extras.note ? extras.note : null,
  };
}

// ---- Recommended emergency documents ---------------------------------------

export interface RecommendedDocGroup {
  category: string;
  examples: string[];
}

export function getRecommendedEmergencyDocuments(): RecommendedDocGroup[] {
  return [
    { category: "Identity", examples: ["Passport", "National ID", "Birth certificate"] },
    { category: "Travel", examples: ["Visa / residence permit", "Travel insurance"] },
    { category: "Insurance", examples: ["Health insurance", "Home / contents policy"] },
    { category: "Medical", examples: ["Allergy / medication note", "Vaccination record"] },
    { category: "Work / School", examples: ["Student card", "Employment letter"] },
    { category: "Family", examples: ["Emergency contact note", "Guardianship letter"] },
    { category: "Legal", examples: ["Power of attorney", "Will reference"] },
  ];
}

// ---- Document completeness -------------------------------------------------

export interface IncompleteDocInput {
  has_file?: boolean;
  is_expired?: boolean;
  missing_expiry_date?: boolean;
}

export interface IncompleteResult {
  incomplete: boolean;
  warnings: string[];
}

/** Surface gentle, non-blocking warnings for a document in the emergency pack. */
export function isEmergencyDocumentIncomplete(
  doc: IncompleteDocInput,
): IncompleteResult {
  const warnings: string[] = [];
  if (doc.has_file === false) warnings.push("No file attached");
  if (doc.is_expired) warnings.push("Expired");
  if (doc.missing_expiry_date) warnings.push("No expiry date");
  return { incomplete: warnings.length > 0, warnings };
}
