// Life Radar — pure helpers that turn already-fetched DueNest data into a ranked,
// human "what to fix first" picture. No fetching, no React: everything here is a
// pure function so it stays fast, testable, and predictable.
//
// Severity is rule-based (no AI), following docs in the sprint brief:
//   critical = expired / due now / deadline within 3 days / sensitive risk
//   soon     = due within ~30 days
//   review   = missing info / incomplete / stale / waiting
//   safe     = nothing to do

import type { CalendarSummary } from "@/types/calendar";
import type { DocumentRecord } from "@/types/documents";
import type { EmergencyPack } from "@/types/emergency";
import type { QuickShareListItem } from "@/types/quick-share";

export type Severity = "critical" | "soon" | "review" | "safe";
export type RiskType =
  | "document"
  | "share"
  | "emergency"
  | "bundle"
  | "organization"
  | "reminder";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 0,
  soon: 1,
  review: 2,
  safe: 3,
};

export interface FixFirstItem {
  id: string;
  type: RiskType;
  severity: Severity;
  title: string;
  reason: string;
  timeContext: string;
  href: string;
  actionLabel: string;
  /** Optional secondary action the UI can wire to a known, safe handler. */
  secondary?: { label: string; kind: "revoke-share"; targetId: number };
  /**
   * When set, the UI can offer a "snooze" action that hides this item from the
   * radar for a while (the underlying expiry/renewal facts are unchanged).
   */
  snooze?: { kind: "document"; targetId: number };
  /** Lower sorts first within a severity bucket (days until / age). */
  sortKey: number;
}

export interface EmergencyReadiness {
  ready: boolean;
  status: "ready" | "incomplete" | "disabled" | "none";
  label: string;
  stepsLeft: number;
  hasActivePack: boolean;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "Today", "Tomorrow", "in 23 days", "2 days ago", "—". */
export function formatRelativeDeadline(
  days: number | null | undefined,
): string {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

function daysBetweenNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((target - start.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export function computeDocumentSeverity(doc: DocumentRecord): Severity {
  if (doc.is_expired || doc.computed_status === "expired") return "critical";
  if (doc.urgency_level === "critical") return "critical";
  if (doc.days_until_expiry !== null && doc.days_until_expiry <= 1)
    return "critical";
  if (
    doc.is_expiring_soon ||
    doc.is_renewal_due ||
    doc.urgency_level === "high" ||
    doc.computed_status === "expiring_soon" ||
    doc.computed_status === "renewal_due"
  )
    return "soon";
  return "review";
}

/** Most severe wins across a list. */
export function computeAttentionSeverity(items: FixFirstItem[]): Severity {
  return items.reduce<Severity>((worst, item) => {
    return SEVERITY_WEIGHT[item.severity] < SEVERITY_WEIGHT[worst]
      ? item.severity
      : worst;
  }, "safe");
}

export function sortAttentionItems(items: FixFirstItem[]): FixFirstItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.sortKey - b.sortKey;
  });
}

// ---------------------------------------------------------------------------
// Item builders (one per domain) -> FixFirstItem[]
// ---------------------------------------------------------------------------

function documentReason(doc: DocumentRecord): string {
  if (doc.is_expired) return "This document may no longer be accepted.";
  if (doc.missing_file) return "A key file is still missing.";
  if (doc.missing_expiry_date)
    return "No expiry date set, so DueNest can't track it.";
  if (doc.is_expiring_soon || doc.is_renewal_due)
    return "Renewal preparation may take time.";
  return doc.status_reason || "This document needs a quick review.";
}

export function buildDocumentItems(docs: DocumentRecord[]): FixFirstItem[] {
  return docs.map((doc) => {
    const severity = computeDocumentSeverity(doc);
    return {
      id: `document-${doc.id}`,
      type: "document" as const,
      severity,
      title: doc.title,
      reason: documentReason(doc),
      timeContext:
        doc.days_until_expiry !== null
          ? `Expires ${formatRelativeDeadline(doc.days_until_expiry)}`
          : doc.status_label || "",
      href: `/dashboard/documents/${doc.id}`,
      actionLabel: doc.is_expired ? "Update document" : "Open document",
      snooze: { kind: "document", targetId: doc.id },
      sortKey: doc.days_until_expiry ?? 9_999,
    };
  });
}

export function buildShareItems(shares: QuickShareListItem[]): FixFirstItem[] {
  return shares
    .filter((s) => s.is_active && !s.is_revoked && !s.is_expired)
    .map((share) => {
      const expiryDays = daysBetweenNow(share.expires_at);
      const severity: Severity =
        expiryDays !== null && expiryDays >= 0 && expiryDays <= 3
          ? "soon"
          : "review";
      const title = share.title?.trim() || "Untitled share";
      return {
        id: `share-${share.id}`,
        type: "share" as const,
        severity,
        title: `${title} still active`,
        reason: "Sensitive document access is still open.",
        timeContext:
          expiryDays !== null
            ? `Expires ${formatRelativeDeadline(expiryDays)}`
            : "No expiry set",
        href: `/dashboard/quick-share/${share.id}`,
        actionLabel: "Review share",
        secondary: { label: "Revoke", kind: "revoke-share", targetId: share.id },
        sortKey: expiryDays ?? 9_999,
      };
    });
}

export function buildEmergencyItem(
  readiness: EmergencyReadiness,
): FixFirstItem | null {
  if (readiness.ready) return null;
  return {
    id: "emergency-readiness",
    type: "emergency",
    severity: "review",
    title: "Emergency access incomplete",
    reason: "Trusted people may not be able to help if needed.",
    timeContext: `${readiness.stepsLeft} step${readiness.stepsLeft === 1 ? "" : "s"} left`,
    href: "/dashboard/emergency",
    actionLabel: "Finish setup",
    sortKey: 50,
  };
}

// ---------------------------------------------------------------------------
// Domain summaries
// ---------------------------------------------------------------------------

export function getEmergencyReadiness(
  packs: EmergencyPack[],
): EmergencyReadiness {
  if (packs.length === 0) {
    return {
      ready: false,
      status: "none",
      label: "Not set up",
      stepsLeft: 2,
      hasActivePack: false,
    };
  }
  const active = packs.find((p) => p.status === "active");
  if (active) {
    // "Ready" = active pack that actually contains documents.
    const hasItems = active.item_count > 0;
    return {
      ready: hasItems,
      status: hasItems ? "ready" : "incomplete",
      label: hasItems ? "Ready" : "Incomplete",
      stepsLeft: hasItems ? 0 : 1,
      hasActivePack: true,
    };
  }
  const disabled = packs.some((p) => p.status === "disabled");
  return {
    ready: false,
    status: disabled ? "disabled" : "incomplete",
    label: disabled ? "Disabled" : "Incomplete",
    stepsLeft: 1,
    hasActivePack: false,
  };
}

export function getActiveShareRisk(shares: QuickShareListItem[]): {
  activeCount: number;
  sensitiveCount: number;
  expiringSoonCount: number;
} {
  const active = shares.filter(
    (s) => s.is_active && !s.is_revoked && !s.is_expired,
  );
  return {
    activeCount: active.length,
    // Any active share grants file access; treat all active shares as sensitive.
    sensitiveCount: active.filter((s) => s.file_count > 0).length,
    expiringSoonCount: active.filter((s) => {
      const d = daysBetweenNow(s.expires_at);
      return d !== null && d >= 0 && d <= 7;
    }).length,
  };
}

export interface NextDeadline {
  label: string;
  relative: string;
  href: string;
}

export function getNextDeadline(
  docs: DocumentRecord[],
  calendar: CalendarSummary | null,
): NextDeadline | null {
  // Prefer the nearest tracked document expiry (it carries a name + link).
  const upcoming = docs
    .filter((d) => d.days_until_expiry !== null && d.days_until_expiry >= 0)
    .sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0))[0];
  if (upcoming) {
    return {
      label: upcoming.title,
      relative: formatRelativeDeadline(upcoming.days_until_expiry),
      href: `/dashboard/documents/${upcoming.id}`,
    };
  }
  const calDays = daysBetweenNow(calendar?.next_expiry ?? null);
  if (calDays !== null) {
    return {
      label: "Next document expiry",
      relative: formatRelativeDeadline(calDays),
      href: "/dashboard/calendar",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Readiness score (0–100) — a calm "how in control am I" signal.
// ---------------------------------------------------------------------------

export function computeDashboardReadinessScore(input: {
  fixFirst: FixFirstItem[];
  totalDocuments: number;
  emergency: EmergencyReadiness;
}): number {
  let score = 100;
  for (const item of input.fixFirst) {
    if (item.severity === "critical") score -= 18;
    else if (item.severity === "soon") score -= 8;
    else if (item.severity === "review") score -= 4;
  }
  if (!input.emergency.ready) score -= 6;
  if (input.totalDocuments === 0) score = 100; // nothing to be at risk yet
  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Status sentence
// ---------------------------------------------------------------------------

const TYPE_NOUNS: Record<RiskType, [string, string]> = {
  document: ["document issue", "document issues"],
  share: ["active share", "active shares"],
  emergency: ["emergency setup step", "emergency setup steps"],
  bundle: ["bundle", "bundles"],
  organization: ["organization task", "organization tasks"],
  reminder: ["reminder", "reminders"],
};

export function buildLifeRadarStatusSentence(
  items: FixFirstItem[],
): string {
  if (items.length === 0) {
    return "You're clear this week. DueNest will keep watching your documents, renewals, shares, and emergency setup.";
  }
  const counts = new Map<RiskType, number>();
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  const parts: string[] = [];
  for (const [type, count] of counts) {
    const [one, many] = TYPE_NOUNS[type];
    parts.push(`${count} ${count === 1 ? one : many}`);
  }
  const total = items.length;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `${total} thing${total === 1 ? "" : "s"} need attention: ${list}.`;
}

// ---------------------------------------------------------------------------
// Top-level aggregation
// ---------------------------------------------------------------------------

export interface LifeRadarSummaryInput {
  attentionDocuments: DocumentRecord[];
  activeShares: QuickShareListItem[];
  emergency: EmergencyReadiness;
}

export function buildLifeRadarSummary(input: LifeRadarSummaryInput): {
  fixFirst: FixFirstItem[];
  statusSentence: string;
  criticalCount: number;
  worstSeverity: Severity;
} {
  const emergencyItem = buildEmergencyItem(input.emergency);
  const items = sortAttentionItems([
    ...buildDocumentItems(input.attentionDocuments),
    ...buildShareItems(input.activeShares),
    ...(emergencyItem ? [emergencyItem] : []),
  ]);
  return {
    fixFirst: items,
    statusSentence: buildLifeRadarStatusSentence(items),
    criticalCount: items.filter((i) => i.severity === "critical").length,
    worstSeverity: computeAttentionSeverity(items),
  };
}
