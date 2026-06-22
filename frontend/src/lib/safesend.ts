// SafeSend — the safety + distribution layer that sits on top of SafeSend.
//
// Everything here is pure (no React, no DOM unless a function name makes that
// obvious) so it can be reasoned about and reused across the create flow, the
// share detail page, and the public viewer. The backend already supports
// purpose, share_method, arbitrary expiry, and every protection flag, so all of
// this is client-side UX on top of the existing API contract.

import type {
  QuickShareMethod,
  QuickSharePermission,
} from "@/types/quick-share";

// ---- Purpose ---------------------------------------------------------------

export type SharePurpose =
  | ""
  | "visa"
  | "scholarship"
  | "job"
  | "school"
  | "travel"
  | "insurance"
  | "family"
  | "organization"
  | "emergency"
  | "other";

export const PURPOSE_OPTIONS: { id: SharePurpose; label: string }[] = [
  { id: "visa", label: "Visa" },
  { id: "scholarship", label: "Scholarship" },
  { id: "job", label: "Job" },
  { id: "school", label: "School" },
  { id: "travel", label: "Travel" },
  { id: "insurance", label: "Insurance" },
  { id: "family", label: "Family" },
  { id: "organization", label: "Organization" },
  { id: "emergency", label: "Emergency" },
  { id: "other", label: "Other" },
];

export function purposeLabel(purpose: SharePurpose): string {
  return PURPOSE_OPTIONS.find((p) => p.id === purpose)?.label ?? "";
}

/** Purposes that almost always mean an official, sensitive document. */
const SENSITIVE_PURPOSES: SharePurpose[] = [
  "visa",
  "insurance",
  "emergency",
];

// ---- Share package ---------------------------------------------------------
//
// Every share always has a QR, a secure link, and a CertaNest code. The package
// is purely about what the sender wants to *lead with* / surface first; it maps
// down to a single `share_method` hint the backend already understands.

export type SharePackage =
  | "qr"
  | "link"
  | "code"
  | "qr_link"
  | "qr_code"
  | "link_code"
  | "all";

export interface SharePackageOption {
  id: SharePackage;
  label: string;
  helper: string;
  recommended?: boolean;
}

export function buildSharePackageOptions(): SharePackageOption[] {
  return [
    {
      id: "qr_link",
      label: "QR + secure link",
      helper: "Best all-rounder — scan in person, send the link in chat.",
      recommended: true,
    },
    {
      id: "qr",
      label: "QR only",
      helper: "Best in person — they scan it at a counter or across the table.",
    },
    {
      id: "link",
      label: "Link only",
      helper: "Best for chat apps — paste a secure link into any message.",
    },
    {
      id: "code",
      label: "CertaNest code only",
      helper: "Best for CertaNest users — they type a short code under Receive a code.",
    },
    {
      id: "qr_code",
      label: "QR + code",
      helper: "Scan in person, or read the code aloud as a fallback.",
    },
    {
      id: "link_code",
      label: "Link + code",
      helper: "Send a link, with a typable code as backup.",
    },
    {
      id: "all",
      label: "QR + link + code",
      helper: "Surface every option. Good when you are not sure how they will open it.",
    },
  ];
}

export function getSharePackageLabel(pkg: SharePackage): string {
  return buildSharePackageOptions().find((o) => o.id === pkg)?.label ?? "Share";
}

/** Which delivery methods a package surfaces. */
export function packageMethods(pkg: SharePackage): {
  qr: boolean;
  link: boolean;
  code: boolean;
} {
  return {
    qr: pkg === "qr" || pkg === "qr_link" || pkg === "qr_code" || pkg === "all",
    link:
      pkg === "link" || pkg === "qr_link" || pkg === "link_code" || pkg === "all",
    code:
      pkg === "code" || pkg === "qr_code" || pkg === "link_code" || pkg === "all",
  };
}

/**
 * The single `share_method` hint we persist. QR wins when present (best in
 * person), then link (best for chat), then code. This drives only what the
 * detail page leads with — all three are always available.
 */
export function packageLeadMethod(pkg: SharePackage): QuickShareMethod {
  const m = packageMethods(pkg);
  if (m.qr) return "qr";
  if (m.link) return "link";
  return "code";
}

// ---- Expiry ----------------------------------------------------------------

export type ExpiryPreset = "10m" | "1h" | "24h" | "3d" | "7d" | "custom";

export const EXPIRY_MS: Record<Exclude<ExpiryPreset, "custom">, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const EXPIRY_LABEL: Record<ExpiryPreset, string> = {
  "10m": "10 minutes",
  "1h": "1 hour",
  "24h": "24 hours",
  "3d": "3 days",
  "7d": "7 days",
  custom: "Custom",
};

/** Resolve a preset (or a custom ISO string) to a concrete expiry ISO string. */
export function resolveExpiry(
  preset: ExpiryPreset,
  customIso?: string,
): string {
  if (preset === "custom") {
    return customIso && customIso.length > 0
      ? new Date(customIso).toISOString()
      : new Date(Date.now() + EXPIRY_MS["24h"]).toISOString();
  }
  return new Date(Date.now() + EXPIRY_MS[preset]).toISOString();
}

/** True when an expiry is far enough out to deserve a gentle nudge. */
export function isLongExpiry(preset: ExpiryPreset, customIso?: string): boolean {
  if (preset === "7d") return true;
  if (preset === "custom" && customIso) {
    return new Date(customIso).getTime() - Date.now() > EXPIRY_MS["7d"];
  }
  return false;
}

// ---- Sensitivity detection -------------------------------------------------

/** Tokens that strongly hint at an official / sensitive document. */
const SENSITIVE_HINTS = [
  "passport",
  "license",
  "licence",
  "ssn",
  "social-security",
  "social security",
  "tax",
  "bank",
  "statement",
  "id-card",
  "id card",
  "national-id",
  "national id",
  "birth",
  "visa",
  "insurance",
  "medical",
  "certificate",
  "contract",
  "legal",
  "permit",
  "residence",
  "transcript",
];

export function looksSensitive(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_HINTS.some((hint) => lower.includes(hint));
}

export interface SensitiveSource {
  name: string;
}

/** Returns the subset of items whose name looks sensitive. */
export function detectSensitiveShareItems<T extends SensitiveSource>(
  items: T[],
): T[] {
  return items.filter((item) => looksSensitive(item.name));
}

// ---- SafeSend recommendation -----------------------------------------------

export type PermissionPreset = "strict" | "balanced" | "flexible" | "custom";

export interface PermissionPresetSpec {
  id: PermissionPreset;
  label: string;
  description: string;
  permission: QuickSharePermission;
  expiry: ExpiryPreset;
  watermark: boolean;
  accessCodeRecommended: boolean;
}

export const PERMISSION_PRESETS: Record<
  Exclude<PermissionPreset, "custom">,
  PermissionPresetSpec
> = {
  strict: {
    id: "strict",
    label: "Strict",
    description: "View only · 1 hour · watermark · code recommended.",
    permission: "view_only",
    expiry: "1h",
    watermark: true,
    accessCodeRecommended: true,
  },
  balanced: {
    id: "balanced",
    label: "Recommended",
    description: "View only · 24 hours · watermark · no download.",
    permission: "view_only",
    expiry: "24h",
    watermark: true,
    accessCodeRecommended: false,
  },
  flexible: {
    id: "flexible",
    label: "Flexible",
    description: "View + download · 7 days · for files they must submit.",
    permission: "download_allowed",
    expiry: "7d",
    watermark: false,
    accessCodeRecommended: false,
  },
};

export interface RecommendationInput {
  sensitive: boolean;
  purpose: SharePurpose;
  /** account_to_account = a CertaNest user, public = anyone with the link. */
  forDueNestUser: boolean;
  itemCount: number;
}

export interface SafeSendRecommendation {
  presetId: Exclude<PermissionPreset, "custom">;
  preset: PermissionPresetSpec;
  package: SharePackage;
  /** Short, calm explanation of why this is recommended. */
  reason: string;
}

/**
 * Rule-based (never AI) recommendation. Picks a protection preset and a share
 * package from the document sensitivity, the stated purpose, and who it is for.
 */
export function buildSafeSendRecommendation(
  input: RecommendationInput,
): SafeSendRecommendation {
  const sensitive =
    input.sensitive || SENSITIVE_PURPOSES.includes(input.purpose);

  // Purpose where the recipient typically needs to submit/upload the file.
  const needsDownload =
    input.purpose === "job" ||
    input.purpose === "scholarship" ||
    input.purpose === "school";

  let presetId: Exclude<PermissionPreset, "custom"> = "balanced";
  let reason =
    "We recommend view-only access with a 24-hour expiry for most secure sharing.";

  if (input.purpose === "emergency") {
    presetId = "balanced";
    reason =
      "Emergency shares stay view-only with a short expiry so access never lingers. Double-check the recipient.";
  } else if (sensitive) {
    presetId = "balanced";
    reason =
      "This looks like a sensitive share. We recommend view-only access, a watermark, and a 24-hour expiry.";
  } else if (needsDownload) {
    presetId = "flexible";
    reason =
      "For applications, the recipient often needs the file — download is allowed with a 7-day expiry.";
  }

  const pkg: SharePackage = input.forDueNestUser ? "all" : "qr_link";

  return {
    presetId,
    preset: PERMISSION_PRESETS[presetId],
    package: pkg,
    reason,
  };
}

export function getRecommendedExpiry(input: RecommendationInput): ExpiryPreset {
  return buildSafeSendRecommendation(input).preset.expiry;
}

export function getRecommendedPermissionPreset(
  input: RecommendationInput,
): PermissionPreset {
  return buildSafeSendRecommendation(input).presetId;
}

// ---- Readiness checks ------------------------------------------------------

export type ReadinessTone = "ok" | "warn";

export interface ReadinessCheck {
  tone: ReadinessTone;
  label: string;
}

export interface ReadinessInput {
  itemCount: number;
  hasExpiry: boolean;
  downloadDisabled: boolean;
  watermark: boolean;
  sensitiveCount: number;
  longExpiry: boolean;
  oneTime: boolean;
  accessCode: boolean;
  /** Selected files whose parent document is past its expiry date. */
  expiredCount?: number;
  /** Selected files whose parent document has no expiry date recorded. */
  missingExpiryCount?: number;
  /** Selected bundles that are not fully ready (some requirements lack a file). */
  incompleteBundleCount?: number;
}

/** Build a calm pre-flight checklist for the review step. Never blocks. */
export function buildShareReadinessChecks(
  input: ReadinessInput,
): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  checks.push({
    tone: input.itemCount > 0 ? "ok" : "warn",
    label:
      input.itemCount > 0
        ? `${input.itemCount} item${input.itemCount === 1 ? "" : "s"} attached`
        : "Nothing selected to share",
  });
  checks.push({
    tone: input.hasExpiry ? "ok" : "warn",
    label: input.hasExpiry
      ? "Access expires automatically"
      : "No expiry set — access stays open",
  });
  if (input.downloadDisabled) {
    checks.push({ tone: "ok", label: "Download disabled" });
  }
  if (input.watermark) {
    checks.push({ tone: "ok", label: "Watermark on" });
  }
  if (input.accessCode) {
    checks.push({ tone: "ok", label: "Access code required" });
  }
  if (input.oneTime) {
    checks.push({ tone: "ok", label: "One-time access" });
  }
  if (input.expiredCount && input.expiredCount > 0) {
    checks.push({
      tone: "warn",
      label: `${input.expiredCount} selected document${
        input.expiredCount === 1 ? " is" : "s are"
      } expired — you may be sharing an out-of-date file`,
    });
  }
  if (input.incompleteBundleCount && input.incompleteBundleCount > 0) {
    checks.push({
      tone: "warn",
      label: `${input.incompleteBundleCount} bundle${
        input.incompleteBundleCount === 1 ? "" : "s"
      } missing some files — the recipient won't see them`,
    });
  }
  if (input.missingExpiryCount && input.missingExpiryCount > 0) {
    checks.push({
      tone: "warn",
      label: `${input.missingExpiryCount} document${
        input.missingExpiryCount === 1 ? " has" : "s have"
      } no expiry date on file`,
    });
  }
  if (input.sensitiveCount > 0) {
    checks.push({
      tone: "warn",
      label: `${input.sensitiveCount} selected item${
        input.sensitiveCount === 1 ? "" : "s"
      } look sensitive — double-check the recipient`,
    });
  }
  if (input.longExpiry) {
    checks.push({
      tone: "warn",
      label: "Long expiry — access stays open for over a week",
    });
  }
  return checks;
}

// ---- CertaNest code formatting -----------------------------------------------

const DN_CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY3467";

/**
 * Canonicalize user-typed input into the stored ``DN-XXXX-XXXX`` form. Mirrors
 * the backend `normalize_dn_code`: tolerates lower-case, spaces, missing/extra
 * dashes, and an optional leading ``DN`` prefix. Returns "" when it cannot be a
 * valid code.
 */
export function normalizeDueNestCode(value: string): string {
  if (!value) return "";
  const cleaned = value
    .toUpperCase()
    .split("")
    .filter((ch) => /[A-Z0-9]/.test(ch))
    .join("");
  const body = cleaned.startsWith("DN") ? cleaned.slice(2) : cleaned;
  if (body.length !== 8) return "";
  if (body.split("").some((ch) => !DN_CODE_ALPHABET.includes(ch))) return "";
  return `DN-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Format raw keystrokes into a friendly, partially-grouped ``DN-XXXX-XXXX``
 * shape for display while typing — without rejecting in-progress input.
 */
export function formatDueNestCode(value: string): string {
  const upper = value.toUpperCase();
  const cleaned = upper
    .split("")
    .filter((ch) => /[A-Z0-9]/.test(ch))
    .join("");
  let body = cleaned;
  if (body.startsWith("DN")) body = body.slice(2);
  body = body.slice(0, 8);
  if (body.length === 0) return "";
  const parts = ["DN"];
  parts.push(body.slice(0, 4));
  if (body.length > 4) parts.push(body.slice(4, 8));
  return parts.join("-");
}

// ---- Status helpers --------------------------------------------------------

export type ShareStatusTone = "active" | "neutral" | "danger";

export interface ShareStatusFlags {
  is_active: boolean;
  is_expired: boolean;
  is_revoked: boolean;
}

export function getShareStatusLabel(s: ShareStatusFlags): string {
  if (s.is_revoked) return "Revoked";
  if (s.is_expired) return "Expired";
  if (s.is_active) return "Active";
  return "Closed";
}

export function getShareStatusTone(s: ShareStatusFlags): ShareStatusTone {
  if (s.is_revoked) return "danger";
  if (s.is_active) return "active";
  return "neutral";
}

// ---- Share message builder -------------------------------------------------

export type MessageTemplate =
  | "professional"
  | "friendly"
  | "formal"
  | "minimal"
  | "organization"
  | "family";

export const MESSAGE_TEMPLATES: { id: MessageTemplate; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "formal", label: "Formal" },
  { id: "minimal", label: "Minimal" },
  { id: "organization", label: "Organization" },
  { id: "family", label: "Family" },
];

export interface ShareMessageInput {
  template: MessageTemplate;
  link?: string;
  code?: string;
  permissionLabel: string;
  expiryLabel: string;
  title?: string;
}

/**
 * Build a ready-to-send message for chat apps / email. Never includes file
 * paths, internal IDs, or raw storage URLs — only the secure link and/or code.
 */
export function buildShareMessage(input: ShareMessageInput): string {
  const lines: string[] = [];
  const subject = input.title?.trim() ? ` (${input.title.trim()})` : "";

  switch (input.template) {
    case "professional":
      lines.push(
        `Hello, I'm sharing the requested document${subject} securely through CertaNest. The access link will expire automatically.`,
      );
      break;
    case "formal":
      lines.push(
        `Please find a document${subject} shared securely via CertaNest. Access is time-limited and controlled.`,
      );
      break;
    case "minimal":
      // Minimal is link-first and terse.
      if (input.link) return `Secure CertaNest share: ${input.link}`;
      if (input.code) return `Secure CertaNest share — code: ${input.code}`;
      return "Secure CertaNest share.";
    case "organization":
      lines.push(
        `Sharing a document${subject} securely through CertaNest on behalf of our organization. Access is logged and time-limited.`,
      );
      break;
    case "family":
      lines.push(
        `Hey — sharing this${subject} safely through CertaNest. It opens securely and closes on its own.`,
      );
      break;
    case "friendly":
    default:
      lines.push(`I'm sharing this${subject} securely through CertaNest.`);
      break;
  }

  lines.push("");
  lines.push(`Access: ${input.permissionLabel}`);
  lines.push(`Expires: ${input.expiryLabel}`);
  if (input.link) {
    lines.push("");
    lines.push(`Open here: ${input.link}`);
  }
  if (input.code) {
    lines.push("");
    lines.push(`CertaNest code: ${input.code}`);
  }
  lines.push("");
  lines.push("Shared securely through CertaNest.");
  return lines.join("\n");
}

export function buildEmailSubject(title?: string): string {
  const t = title?.trim();
  return t ? `Secure CertaNest share — ${t}` : "Secure CertaNest document share";
}

// ---- Distribution targets --------------------------------------------------

export function whatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function telegramUrl(link: string | undefined, message: string): string {
  // Telegram's share endpoint wants a url + text; fall back to a text-only
  // message URL when there is no link in the package.
  if (link) {
    return `https://t.me/share/url?url=${encodeURIComponent(
      link,
    )}&text=${encodeURIComponent(message)}`;
  }
  return `https://t.me/share/url?url=${encodeURIComponent(message)}`;
}

export function emailUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body,
  )}`;
}

export function smsUrl(message: string): string {
  // `?&body=` is the most broadly compatible form across iOS/Android.
  return `sms:?&body=${encodeURIComponent(message)}`;
}

// ---- Lightweight on-device persistence (localStorage) ----------------------
//
// Both helpers stay on the sender's own device — no recipient data or settings
// are ever sent to or stored on the server beyond what a share itself records.

const LAST_SETTINGS_KEY = "duenest.safesend.lastSettings";
const RECENT_RECIPIENTS_KEY = "duenest.safesend.recentRecipients";

export interface SavedShareSettings {
  pkg: SharePackage;
  preset: PermissionPreset;
  permission: QuickSharePermission;
  expiry: ExpiryPreset;
  watermark: boolean;
  accessCode: boolean;
}

export function saveLastShareSettings(settings: SavedShareSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode / quota) */
  }
}

export function loadLastShareSettings(): SavedShareSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedShareSettings;
    if (!parsed || typeof parsed.pkg !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadRecentRecipients(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_RECIPIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export function addRecentRecipient(label: string): void {
  if (typeof window === "undefined") return;
  const trimmed = label.trim();
  if (!trimmed) return;
  try {
    const existing = loadRecentRecipients().filter(
      (v) => v.toLowerCase() !== trimmed.toLowerCase(),
    );
    const next = [trimmed, ...existing].slice(0, 6);
    window.localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage failures */
  }
}

// ---- Browser capability + clipboard (DOM) ----------------------------------

export function canUseNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  );
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea + execCommand
 * for browsers/contexts where the async Clipboard API is unavailable. Resolves
 * to whether the copy succeeded — callers should surface a fallback message on
 * `false` rather than failing silently.
 */
export async function copyToClipboardWithFallback(
  text: string,
): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
