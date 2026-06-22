/**
 * Canonical document-status vocabulary for CertaNest.
 *
 * One source of truth that maps every lifecycle status to a calm visual "tone"
 * and a default human label, so status badges stop drifting in colour and
 * wording across Vault, Bundles/Application Packs, SafeSend, and
 * Document Requests. See `docs/design/design-system.md` (status colour map) and
 * `docs/design/microcopy-patterns.md` (status labels).
 *
 * This module is intentionally pure (no React, no DOM) so it can be unit-tested
 * in the Node test environment, mirroring `lib/navigation.ts`.
 */

export const STATUS_TONES = [
  "success", // Ready / complete / submitted — positive, done
  "warning", // Expiring soon / due / missing — attention, never panic (Due Amber)
  "danger", // Overdue / revoked / expired / error — action required
  "info", // Shared / active link — informational, live
  "trust", // Private / original / prepared copy — safety, preserved (Nest Teal)
  "neutral", // Draft / archived — pending, low urgency
] as const;

export type StatusTone = (typeof STATUS_TONES)[number];

/**
 * Tailwind classes per tone. A soft tinted background carries calm context, a
 * saturated dot carries the colour signal, and the label text stays in a
 * high-contrast foreground colour so meaning never depends on colour alone
 * (the label words also name the status). Keeps WCAG contrast safe.
 */
export const TONE_CLASS: Record<StatusTone, { badge: string; dot: string }> = {
  success: { badge: "bg-brand-success/12 text-foreground", dot: "bg-brand-success" },
  warning: { badge: "bg-brand-amber/12 text-foreground", dot: "bg-brand-amber" },
  danger: { badge: "bg-destructive/10 text-foreground", dot: "bg-destructive" },
  info: { badge: "bg-primary/10 text-foreground", dot: "bg-primary" },
  trust: { badge: "bg-brand-teal/12 text-foreground", dot: "bg-brand-teal" },
  neutral: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

/**
 * Known lifecycle statuses → tone + default label. Callers can override the
 * label (e.g. "In 2 packs") via the component's children, or pass a bare `tone`
 * for one-off badges.
 */
export const STATUS_MAP = {
  ready: { tone: "success", label: "Ready" },
  complete: { tone: "success", label: "Complete" },
  "ready-to-share": { tone: "success", label: "Ready to share" },
  submitted: { tone: "success", label: "Submitted" },

  "expiring-soon": { tone: "warning", label: "Expiring soon" },
  due: { tone: "warning", label: "Due soon" },
  missing: { tone: "warning", label: "Missing documents" },
  "needs-review": { tone: "warning", label: "Needs review" },

  overdue: { tone: "danger", label: "Overdue" },
  revoked: { tone: "danger", label: "Revoked" },
  expired: { tone: "danger", label: "Expired" },
  error: { tone: "danger", label: "Error" },

  shared: { tone: "info", label: "Shared" },
  active: { tone: "info", label: "Active" },
  "ready-to-review": { tone: "info", label: "Ready to review" },

  private: { tone: "trust", label: "Private" },
  original: { tone: "trust", label: "Original" },
  "prepared-copy": { tone: "trust", label: "Prepared copy" },

  draft: { tone: "neutral", label: "Draft" },
  archived: { tone: "neutral", label: "Archived" },
} satisfies Record<string, { tone: StatusTone; label: string }>;

export type StatusKey = keyof typeof STATUS_MAP;

export function resolveStatus(key: StatusKey): { tone: StatusTone; label: string } {
  return STATUS_MAP[key];
}

export function isStatusKey(value: string): value is StatusKey {
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, value);
}
