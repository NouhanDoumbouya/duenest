// Types for Audit Logs V1 (apps.audit_logs). Owner-scoped, read-only.
//
// An audit log entry records an important document or sharing event — who did
// it, what it touched, and when. The owner reviews this history to understand
// activity around their documents, requests, sharing rooms, and protected
// copies.
//
// SECURITY: the API deliberately returns only SAFE fields. There are no raw
// file URLs, tokens, IP addresses, or user-agent strings in the payload. The UI
// must never construct any such value either.

/** The area of the product an event belongs to. */
export type AuditLogCategory =
  | "document"
  | "file"
  | "document_request"
  | "sharing_room"
  | "protected_copy"
  | "application"
  | "pack"
  | "security"
  | "system";

/** How much attention an event deserves. */
export type AuditLogSeverity = "info" | "warning" | "critical";

/** Who (or what) performed the action. */
export type AuditLogActorType =
  | "owner"
  | "authenticated_user"
  | "public_link"
  | "system";

/**
 * Metadata values are scalar or a list of strings. The backend keeps this
 * intentionally narrow — no nested objects, no raw URLs/tokens.
 */
export type AuditLogMetadataValue =
  | string
  | number
  | boolean
  | null
  | string[];

/**
 * A single audit log entry. These are ALL the fields the API returns. There are
 * NO ip/user-agent/url/token fields — do not expect or render any.
 */
export interface AuditLogEntry {
  id: number;
  /** Machine event name, e.g. "sharing_room_file_downloaded". */
  event_type: string;
  category: AuditLogCategory;
  severity: AuditLogSeverity;
  actor_type: AuditLogActorType;
  /** Human-safe label for the actor (no email/identity leak by design). */
  actor_label: string;
  /** Model class name of the primary object, e.g. "SharingRoom". */
  object_type: string;
  object_id: string;
  object_label: string;
  /** Optional secondary object (e.g. the file inside a room). */
  related_object_type: string;
  related_object_id: string;
  related_object_label: string;
  /** ISO 3166 alpha-2 country code, or empty when unknown. */
  country_code: string;
  metadata: Record<string, AuditLogMetadataValue>;
  created_at: string;
}

/** Standard paginated list response (StandardResultsSetPagination). */
export interface AuditLogListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditLogEntry[];
}

/** 30-day rollup counts for the summary strip. */
export interface AuditLogSummary {
  total_events_30d: number;
  public_link_events_30d: number;
  downloads_30d: number;
  uploads_30d: number;
  critical_events_30d: number;
}

/** Query filters for the list endpoint. All optional; combine freely. */
export interface AuditLogFilters {
  category?: AuditLogCategory;
  event_type?: string;
  severity?: AuditLogSeverity;
  object_type?: string;
  object_id?: string;
  /** ISO datetime string. */
  date_from?: string;
  /** ISO datetime string. */
  date_to?: string;
  /** Free-text search over safe labels / event_type. */
  search?: string;
  page?: number;
  page_size?: number;
}
