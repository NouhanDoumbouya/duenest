// Client for Audit Logs V1 (apps.audit_logs). Owner-only, read-only.
//
// One surface: authenticated owner endpoints, reusing the shared `apiFetch`
// (cookie auth + CSRF + error handling). There are NO public endpoints and NO
// mutations — the audit log is a record the owner reads, never edits.
//
// SECURITY: the API returns only safe fields (no raw URLs, tokens, IPs, or
// user-agent strings). The pure helpers below only ever read those safe fields;
// they never construct a URL or expose an identifier beyond the safe labels the
// backend already chose to share.

import { apiFetch } from "./api";
import type {
  AuditLogActorType,
  AuditLogCategory,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogListResponse,
  AuditLogSeverity,
  AuditLogSummary,
} from "@/types/audit-logs";
import type { StatusTone } from "./status-badge";

// ---- Owner API (authenticated, read-only) ----------------------------------

/** Build a `?key=value` query string from the filter object (skips empties). */
function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  const append = (key: string, value: string | number | undefined) => {
    if (value === undefined) return;
    const str = String(value).trim();
    if (str.length > 0) params.set(key, str);
  };
  append("category", filters.category);
  append("event_type", filters.event_type);
  append("severity", filters.severity);
  append("object_type", filters.object_type);
  append("object_id", filters.object_id);
  append("date_from", filters.date_from);
  append("date_to", filters.date_to);
  append("search", filters.search);
  append("page", filters.page);
  append("page_size", filters.page_size);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** List audit log entries (paginated), optionally filtered. */
export function getAuditLogs(
  filters: AuditLogFilters = {},
): Promise<AuditLogListResponse> {
  return apiFetch<AuditLogListResponse>(`/audit-logs/${buildQuery(filters)}`);
}

/** Read a single audit log entry. */
export function getAuditLogEntry(id: number): Promise<AuditLogEntry> {
  return apiFetch<AuditLogEntry>(`/audit-logs/${id}/`);
}

/** Read the 30-day summary counts. */
export function getAuditLogSummary(): Promise<AuditLogSummary> {
  return apiFetch<AuditLogSummary>("/audit-logs/summary/");
}

// ---- Pure helpers (no DOM — unit-testable in the Node env) ------------------

/** Friendly labels for each category. */
export const CATEGORY_LABELS: Record<AuditLogCategory, string> = {
  document: "Document",
  file: "File",
  document_request: "Document request",
  sharing_room: "Sharing room",
  protected_copy: "Protected copy",
  application: "Application",
  pack: "Application pack",
  security: "Security",
  system: "System",
};

/** Friendly labels for each severity. */
export const SEVERITY_LABELS: Record<AuditLogSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

/** Severity tone for the canonical StatusBadge. */
export const SEVERITY_TONE: Record<AuditLogSeverity, StatusTone> = {
  info: "info",
  warning: "warning",
  critical: "danger",
};

/** Friendly labels for each actor type (the noun used in sentences). */
export const ACTOR_TYPE_LABELS: Record<AuditLogActorType, string> = {
  owner: "You",
  authenticated_user: "A signed-in user",
  public_link: "A public visitor",
  system: "CertaNest",
};

/** Order categories appear in the filter select. */
export const CATEGORY_ORDER: AuditLogCategory[] = [
  "document",
  "file",
  "document_request",
  "sharing_room",
  "protected_copy",
  "application",
  "pack",
  "security",
  "system",
];

/** Order severities appear in the filter select (calmest first). */
export const SEVERITY_ORDER: AuditLogSeverity[] = [
  "info",
  "warning",
  "critical",
];

/**
 * The subject for a sentence, derived from who acted. Slightly more specific
 * than the bare actor label so the sentence reads naturally — e.g. a public
 * link that opened a *room* reads as "Room visitor", but we fall back to the
 * generic "Public visitor" for downloads/previews.
 */
function actorSubject(entry: AuditLogEntry): string {
  switch (entry.actor_type) {
    case "owner":
      return "You";
    case "authenticated_user":
      return "A signed-in user";
    case "public_link":
      // A visitor who *opened* a room reads naturally as "Room visitor"; a
      // file action (preview/download) reads better as the generic "Public
      // visitor" so the sentence focuses on the file, not the room.
      return entry.category === "sharing_room" &&
        !FILE_LEVEL_PUBLIC_EVENTS.has(entry.event_type)
        ? "Room visitor"
        : "Public visitor";
    case "system":
      return "CertaNest";
    default:
      return entry.actor_label || "Someone";
  }
}

/**
 * Sharing-room events that act on a file rather than the room itself. For these
 * a public actor reads as "Public visitor" (focused on the file).
 */
const FILE_LEVEL_PUBLIC_EVENTS = new Set<string>([
  "sharing_room_file_previewed",
  "sharing_room_file_downloaded",
]);

/**
 * Verb phrase for a known event type. `{name}` is replaced with the object
 * label by the caller. Each phrase is a complete predicate so the sentence is
 * "<subject> <phrase>" — e.g. "You" + "revoked {name}".
 */
const EVENT_VERB: Record<string, string> = {
  // Document requests
  document_request_created: "created the request {name}",
  document_request_email_sent: "emailed the request {name}",
  document_request_opened: "opened the request {name}",
  document_request_file_uploaded: "uploaded a file to {name}",
  document_request_accepted: "accepted the upload for {name}",
  document_request_rejected: "rejected the upload for {name}",
  document_request_needs_replacement: "asked for a replacement on {name}",
  document_request_cancelled: "cancelled the request {name}",
  // Sharing rooms
  sharing_room_created: "created {name}",
  sharing_room_opened: "opened {name}",
  sharing_room_file_previewed: "previewed {name}",
  sharing_room_file_downloaded: "downloaded {name}",
  sharing_room_item_added: "added {name}",
  sharing_room_item_removed: "removed {name}",
  sharing_room_revoked: "revoked {name}",
  sharing_room_archived: "archived {name}",
  // Protected copies
  protected_copy_created: "started a protected copy {name}",
  protected_copy_generated: "generated protected copy {name}",
  protected_copy_failed: "had a protected copy fail: {name}",
  protected_copy_added_to_room: "added protected copy {name} to a room",
  protected_copy_archived: "archived protected copy {name}",
  // Applications & packs
  application_created: "created the application {name}",
  application_status_changed: "changed the status of {name}",
  pack_created: "created the pack {name}",
  pack_requirement_satisfied: "completed a requirement in {name}",
  // Documents
  document_saved_to_vault: "saved {name} to the vault",
};

/**
 * Turn a machine event_type into a readable verb phrase for unknown events.
 * "sharing_room_thing_happened" → "thing happened". Strips a known category
 * prefix when present so the phrase doesn't repeat the category, then
 * humanizes the rest. Always ends with the object label.
 */
function humanizeUnknownEvent(entry: AuditLogEntry): string {
  const prefixes = [
    "document_request_",
    "sharing_room_",
    "protected_copy_",
    "application_",
    "document_",
    "pack_",
    "file_",
    "security_",
    "system_",
  ];
  let rest = entry.event_type;
  for (const prefix of prefixes) {
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length);
      break;
    }
  }
  const phrase = rest.replace(/_/g, " ").trim() || "did something";
  const name = objectName(entry);
  return name ? `${phrase} ${name}` : phrase;
}

/** The best human label for the entry's primary object. */
function objectName(entry: AuditLogEntry): string {
  return (entry.object_label || entry.related_object_label || "").trim();
}

/**
 * Turn an audit entry into a single human sentence describing what happened —
 * the key, tested helper. Combines the actor subject ("You" / "Public visitor"
 * / etc.) with an event-type verb phrase and the safe object label.
 *
 * Examples:
 *   "Room visitor opened Scholarship Submission Room"
 *   "You generated protected copy Passport (protected)"
 *   "You revoked Visa Renewal Room"
 *   "Public visitor downloaded transcript.png"
 *
 * Falls back to a humanized event_type for unknown events so it never throws or
 * returns an empty string. Reads only safe fields — never a URL or token.
 */
export function describeAuditEvent(entry: AuditLogEntry): string {
  const subject = actorSubject(entry);
  const template = EVENT_VERB[entry.event_type];

  if (template) {
    const name = objectName(entry);
    const phrase = template.includes("{name}")
      ? // Drop a now-orphaned label placeholder when there's nothing to fill it.
        template.replace(/\s*\{name\}/g, name ? ` ${name}` : "").trim()
      : template;
    return `${subject} ${phrase}`.replace(/\s+/g, " ").trim();
  }

  return `${subject} ${humanizeUnknownEvent(entry)}`.replace(/\s+/g, " ").trim();
}

/**
 * A short, safe one-line summary of an entry's metadata for the list row.
 * Renders a few key=value pairs; arrays are joined; objects/URLs never appear
 * (the metadata shape forbids them by type). Returns "" when there's nothing
 * worth showing.
 */
export function summarizeMetadata(
  metadata: AuditLogEntry["metadata"],
  maxPairs = 3,
): string {
  if (!metadata) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${humanizeKey(key)}: ${value.join(", ")}`);
    } else {
      const str = String(value).trim();
      if (str.length === 0) continue;
      parts.push(`${humanizeKey(key)}: ${str}`);
    }
    if (parts.length >= maxPairs) break;
  }
  return parts.join(" · ");
}

/** "file_name" → "File name". Used for metadata keys in the UI. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
