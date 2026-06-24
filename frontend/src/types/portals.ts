// Types for CertaNest Portals (B2B Portals MVP). Organization-scoped.
//
// A Portal is an organization's workspace for managing the people it serves
// (clients, students, applicants, employees, family members) and the document
// "cases" attached to each of them — a visa file, a scholarship application, an
// onboarding pack, and so on.
//
// The whole feature sits behind the `b2b_portals` feature flag, is scoped to
// organization members, and writes require an org admin/owner role. Public
// links (`room_public_url`, request `upload_url`) are FRONTEND page routes —
// safe to show and copy. There are NO raw storage URLs anywhere in these
// shapes.

/** The kind of person an organization is serving. */
export type PortalPersonType =
  | "client"
  | "student"
  | "applicant"
  | "employee"
  | "family_member"
  | "other";

/** Where a person currently sits in their document journey. */
export type PortalPersonStatus =
  | "active"
  | "waiting_for_documents"
  | "under_review"
  | "completed"
  | "archived";

/** The kind of document case being worked. */
export type PortalCaseType =
  | "visa"
  | "scholarship"
  | "admission"
  | "employee_onboarding"
  | "compliance"
  | "client_file"
  | "general";

/** Lifecycle status of a case. */
export type PortalCaseStatus =
  | "draft"
  | "collecting_documents"
  | "waiting_for_review"
  | "ready"
  | "submitted"
  | "completed"
  | "blocked"
  | "archived";

/** Priority of a case. */
export type PortalCasePriority = "low" | "normal" | "high" | "urgent";

/** A person an organization serves through the portal. */
export interface PortalPerson {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  person_type: PortalPersonType;
  status: PortalPersonStatus;
  notes: string;
  active_cases: number;
  created_at: string;
  updated_at: string;
}

/** Lightweight person reference embedded on a case. */
export interface PortalCasePersonRef {
  id: number;
  full_name: string;
  email: string;
  person_type: PortalPersonType;
}

/**
 * Readiness snapshot for a case: how many requirements are satisfied, how many
 * requests have been uploaded/accepted, and what status the backend suggests
 * the case should move to.
 */
export interface PortalCaseProgress {
  total_requirements: number;
  satisfied_requirements: number;
  missing_requirements: number;
  readiness_score: number;
  requests_total: number;
  requests_uploaded: number;
  requests_accepted: number;
  requests_needs_replacement: number;
  uploads_needing_review: number;
  suggested_status: PortalCaseStatus;
}

/**
 * A document request linked to a case. `upload_url` is a FRONTEND page route
 * (`/document-request/{token}`) the recipient visits — safe to show and copy.
 * It is never a raw storage URL.
 */
export interface PortalCaseRequest {
  document_request_id: number;
  requested_document_title: string;
  status: string;
  recipient_name: string;
  can_upload: boolean;
  /** FRONTEND page route the recipient uploads through. Safe to show/copy. */
  upload_url: string | null;
  requirement_id: number | null;
}

/** A full case owned by an organization through the portal. */
export interface PortalCase {
  id: number;
  title: string;
  case_type: PortalCaseType;
  status: PortalCaseStatus;
  priority: PortalCasePriority;
  due_date: string | null;
  notes: string;
  person: PortalCasePersonRef;

  linked_bundle: number | null;
  linked_application: number | null;
  linked_room: number | null;
  /** FRONTEND public room route (`/room/{token}`). Safe to show/copy. */
  room_public_url: string | null;

  progress: PortalCaseProgress;
  requests: PortalCaseRequest[];

  created_at: string;
  updated_at: string;
}

/** Summary counts for the portal dashboard tiles. */
export interface PortalSummary {
  people_total: number;
  active_cases: number;
  people_waiting_for_documents: number;
  uploads_needing_review: number;
  overdue_cases: number;
  ready_cases: number;
  blocked_cases: number;
}

/** A single upload waiting for the organization to review. */
export interface PortalReviewItem {
  case_id: number;
  case_title: string;
  person_name: string;
  document_request_id: number;
  requested_document_title: string;
  status: string;
  uploaded_at: string;
}

// ---- Plan + limits ----------------------------------------------------------

/** The org's billing/entitlement plan as it relates to portal capacity. */
export type PortalPlan =
  | "free"
  | "pro"
  | "teams_beta"
  | "teams"
  | "enterprise";

/**
 * The set of capacity-limited portal resources. `null` anywhere in `limits`
 * or `remaining` means "unlimited" for that resource.
 */
export interface PortalLimitsBuckets {
  members: number | null;
  portal_people: number | null;
  active_portal_cases: number | null;
  active_document_requests: number | null;
  active_sharing_rooms: number | null;
}

/** Current usage counts. Always concrete numbers (never unlimited). */
export interface PortalUsageBuckets {
  members: number;
  portal_people: number;
  active_portal_cases: number;
  active_document_requests: number;
  active_sharing_rooms: number;
}

/**
 * The org's portal plan, limits, usage, and remaining headroom. Readable by any
 * org member even when the portal is not enabled — so the paywall can render.
 * `portal_enabled` decides whether the live portal (people/cases/requests) is
 * available; `false` means show the Teams paywall.
 */
export interface PortalLimits {
  plan: PortalPlan;
  portal_enabled: boolean;
  limits: PortalLimitsBuckets;
  usage: PortalUsageBuckets;
  remaining: PortalLimitsBuckets;
}

/** A capacity-limited portal resource key, used for labels and warnings. */
export type PortalLimitResource = keyof PortalLimitsBuckets;

// ---- List responses ---------------------------------------------------------

export interface PortalPeopleResponse {
  people: PortalPerson[];
  count: number;
}

export interface PortalCasesResponse {
  cases: PortalCase[];
  count: number;
}

export interface PortalReviewQueueResponse {
  items: PortalReviewItem[];
  count: number;
}

// ---- Request bodies ---------------------------------------------------------

/** Body for creating a person. Only `full_name` and `person_type` are required. */
export interface CreatePortalPersonBody {
  full_name: string;
  email?: string;
  phone?: string;
  person_type: PortalPersonType;
  status?: PortalPersonStatus;
  notes?: string;
}

/** Body for editing a person. */
export interface UpdatePortalPersonBody {
  full_name?: string;
  email?: string;
  phone?: string;
  person_type?: PortalPersonType;
  status?: PortalPersonStatus;
  notes?: string;
}

/** Body for creating a case. `person` and `title` are required. */
export interface CreatePortalCaseBody {
  person: number;
  title: string;
  case_type: PortalCaseType;
  priority?: PortalCasePriority;
  due_date?: string | null;
  notes?: string;
  requirements?: string[];
}

/** Body for editing a case. */
export interface UpdatePortalCaseBody {
  title?: string;
  case_type?: PortalCaseType;
  status?: PortalCaseStatus;
  priority?: PortalCasePriority;
  due_date?: string | null;
  notes?: string;
}

/** Filters for listing cases. */
export interface PortalCaseFilters {
  status?: PortalCaseStatus;
  person?: number;
  active?: boolean;
}

/** Body for turning a case's requirements into an application pack. */
export interface CreateCasePackBody {
  requirements?: string[];
}

/** Body for creating a document request from a case. */
export interface CreateCaseRequestBody {
  requested_document_title: string;
  instructions?: string;
  recipient_name?: string;
  recipient_email?: string;
  due_date?: string | null;
  requirement?: number;
}
