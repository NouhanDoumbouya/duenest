// Vault — pure helpers that turn document data into a calm "control center"
// picture (health, risk, completeness, next action). No fetching, no React, so
// they stay fast and testable.

import type { DocumentRecord } from "@/types/documents";

export interface VaultCounts {
  total: number;
  needsAttention: number;
  expired: number;
  expiringSoon: number;
  missingFile: number;
  missingInfo: number;
}

export type VaultHealthTone = "good" | "warn" | "danger" | "neutral";

export interface VaultHealth {
  score: number;
  label: string;
  tone: VaultHealthTone;
}

/** "You have 24 documents. 3 need attention." (with calm variants). */
export function getVaultStatusSentence(
  total: number,
  needsAttention: number,
): string {
  if (total === 0) {
    return "Your vault is empty. Add the documents you can't afford to lose.";
  }
  const docs = `${total} ${total === 1 ? "document" : "documents"}`;
  if (needsAttention === 0) {
    return `You have ${docs}. Everything looks organized and up to date.`;
  }
  return `You have ${docs}. ${needsAttention} need${needsAttention === 1 ? "s" : ""} attention.`;
}

/** A calm 0–100 "how organized + safe is my vault" signal. */
export function computeVaultHealth(counts: VaultCounts): VaultHealth {
  if (counts.total === 0) {
    return { score: 100, label: "Ready", tone: "neutral" };
  }
  let score = 100;
  score -= counts.expired * 15;
  score -= counts.expiringSoon * 5;
  score -= counts.missingFile * 6;
  score -= counts.missingInfo * 3;
  score = Math.max(0, Math.min(100, score));

  let label = "Healthy";
  let tone: VaultHealthTone = "good";
  if (score < 60) {
    label = "At risk";
    tone = "danger";
  } else if (score < 85) {
    label = "Needs attention";
    tone = "warn";
  }
  return { score, label, tone };
}

export type ExpiryKind = "expired" | "soon" | "none" | "ok";

export interface ExpiryStatus {
  kind: ExpiryKind;
  label: string;
}

export function getDocumentExpiryStatus(doc: DocumentRecord): ExpiryStatus {
  if (doc.is_expired) {
    return { kind: "expired", label: formatDocumentCountdown(doc.days_until_expiry) };
  }
  if (doc.missing_expiry_date || doc.expiry_date === null) {
    return { kind: "none", label: "No expiry date" };
  }
  if (doc.is_expiring_soon) {
    return { kind: "soon", label: formatDocumentCountdown(doc.days_until_expiry) };
  }
  return { kind: "ok", label: formatDocumentCountdown(doc.days_until_expiry) };
}

/** "23 days left", "Expired 2 days ago", "Expires today", "No expiry date". */
export function formatDocumentCountdown(days: number | null | undefined): string {
  if (days === null || days === undefined) return "No expiry date";
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  if (days === -1) return "Expired yesterday";
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  return `${days} days left`;
}

const SENSITIVE_TERMS = [
  "passport",
  "visa",
  "national id",
  "identity",
  " id ",
  "residence",
  "insurance",
  "licence",
  "license",
  "birth",
  "marriage",
  "social security",
  "ssn",
  "bank",
  "tax",
];

/** Best-effort, privacy-conscious sensitivity heuristic from non-secret fields. */
export function isSensitiveDocument(doc: DocumentRecord): boolean {
  const haystack = ` ${doc.document_type} ${doc.category_name ?? ""} ${doc.title} `.toLowerCase();
  return SENSITIVE_TERMS.some((term) => haystack.includes(term));
}

export interface DocumentPrimaryAction {
  label: string;
  /** Relative href into the existing document detail/edit routes. */
  href: string;
}

export function getDocumentPrimaryAction(
  doc: DocumentRecord,
): DocumentPrimaryAction {
  const base = `/dashboard/documents/${doc.id}`;
  if (doc.missing_file) return { label: "Attach file", href: base };
  if (doc.is_expired) return { label: "Update document", href: `${base}/edit` };
  if (doc.missing_expiry_date) return { label: "Add expiry date", href: `${base}/edit` };
  if (doc.is_expiring_soon || doc.is_renewal_due)
    return { label: "Review", href: base };
  return { label: "Open", href: base };
}

/** Plain-language reason a document is on the attention list. */
export function getDocumentRiskReason(doc: DocumentRecord): string {
  if (doc.is_expired) return "This document may no longer be accepted.";
  if (doc.missing_file) return "This record exists, but no file is attached yet.";
  if (doc.missing_expiry_date)
    return "No expiry date set, so DueNest can't protect you.";
  if (doc.is_expiring_soon || doc.is_renewal_due)
    return "Renewal preparation may take time.";
  return doc.status_reason || "This document needs a quick review.";
}

export interface FileInboxStatus {
  title: string;
  description: string;
}

export function getFileInboxStatus(count: number): FileInboxStatus {
  if (count === 0) {
    return {
      title: "No loose files",
      description: "Everything is organized.",
    };
  }
  return {
    title: `${count} file${count === 1 ? "" : "s"} waiting to be organized`,
    description: "Turn uploads into complete documents.",
  };
}
