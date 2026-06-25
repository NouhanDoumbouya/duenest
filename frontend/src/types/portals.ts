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
 * Where an uploaded document sits in the org's review workflow.
 * - `pending_upload`: nothing uploaded yet.
 * - `uploaded`: a file is in, waiting for an admin to start reviewing.
 * - `under_review`: an admin has opened the review.
 * - `accepted` / `rejected` / `needs_replacement`: a decision was made.
 * - `cancelled`: the request was cancelled.
 */
export type PortalReviewStatus =
  | "pending_upload"
  | "uploaded"
  | "under_review"
  | "accepted"
  | "rejected"
  | "needs_replacement"
  | "cancelled";

/** A review decision an admin can take on an uploaded document. */
export type PortalReviewDecision = "accepted" | "rejected" | "needs_replacement";

/**
 * The uploaded file behind a review item. `preview_url`/`download_url` are
 * ORG-SCOPED PROXY paths (relative `/api/v1/...`) that must be fetched as an
 * authenticated blob — they are NEVER raw storage URLs and must not be rendered
 * directly as an href/src.
 */
export interface PortalReviewUploadedFile {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  is_previewable: boolean;
  /** Authenticated org-scoped proxy path. Fetch as a blob; never render raw. */
  preview_url: string;
  /** Authenticated org-scoped proxy path. Fetch as a blob; never render raw. */
  download_url: string;
}

/**
 * A document request linked to a case, enriched with its review state.
 * `upload_url` is a FRONTEND page route (`/document-request/{token}`) the
 * recipient visits — safe to show and copy. It is never a raw storage URL.
 */
export interface PortalCaseRequest {
  case_request_id: number;
  document_request_id: number;
  requested_document_title: string;
  status: string;
  /** The underlying DocumentRequest status string (informational). */
  document_request_status: string;
  recipient_name: string;
  has_recipient_email: boolean;
  can_upload: boolean;
  /** FRONTEND page route the recipient uploads through. Safe to show/copy. */
  upload_url: string | null;
  requirement_id: number | null;

  // ---- Review workflow fields ----
  review_status: PortalReviewStatus;
  uploaded_at: string | null;
  due_date: string | null;
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  rejection_reason: string;
  decision_count: number;
  uploaded_file: PortalReviewUploadedFile | null;
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

/**
 * An enriched review-queue item: one document request seen through the review
 * workflow, carrying its person/case context, review state, and (when present)
 * the uploaded file behind org-scoped proxy paths. `uploaded_file.preview_url`
 * / `download_url` are authenticated proxy paths — never raw storage URLs.
 */
export interface PortalReviewItem {
  case_request_id: number;
  case_id: number;
  case_title: string;
  person_name: string;
  person_id: number;
  document_request_id: number;
  requested_document_title: string;
  review_status: PortalReviewStatus;
  document_request_status: string;
  recipient_name: string;
  has_recipient_email: boolean;
  can_upload: boolean;
  uploaded_at: string | null;
  due_date: string | null;
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  rejection_reason: string;
  decision_count: number;
  requirement_id: number | null;
  uploaded_file: PortalReviewUploadedFile | null;
}

/** A single recorded review decision in a request's audit trail. */
export interface ReviewDecision {
  id: number;
  decision: string;
  note: string;
  decided_by: string;
  decided_at: string;
  previous_status: string;
  new_status: string;
  notified_recipient: boolean;
}

// ---- Organization dashboard -------------------------------------------------

/**
 * The full set of operational metrics for the org dashboard. Every value is a
 * concrete count except `readiness_average`, which is `null` when there are no
 * cases to average over. `percent_*` values are whole-number percentages.
 */
export interface DashboardMetrics {
  total_people: number;
  active_people: number;
  total_cases: number;
  active_cases: number;
  draft_cases: number;
  collecting_documents_cases: number;
  waiting_for_review_cases: number;
  ready_cases: number;
  submitted_cases: number;
  completed_cases: number;
  blocked_cases: number;
  archived_cases: number;
  overdue_cases: number;
  due_soon_cases: number;
  active_document_requests: number;
  uploaded_requests_needing_review: number;
  accepted_requests: number;
  rejected_requests: number;
  needs_replacement_requests: number;
  active_sharing_rooms: number;
  expiring_sharing_rooms: number;
  missing_required_documents: number;
  readiness_average: number | null;
  percent_cases_ready: number;
  percent_cases_blocked_or_overdue: number;
}

/**
 * A review-queue item on the dashboard: one uploaded document request waiting
 * for an admin decision. `action_url` is a RELATIVE app route (deep-link to the
 * request on its case page) — safe to use directly with `next/link`. There are
 * no file URLs or tokens here.
 */
export interface DashboardReviewItem {
  case_request_id: number;
  case_id: number;
  case_title: string;
  person_name: string;
  requested_document_title: string;
  status: string;
  uploaded_at: string | null;
  /** RELATIVE app route. Never a raw storage URL. */
  action_url: string;
}

/**
 * A case row on a dashboard queue (overdue / missing documents / ready).
 * `action_url` is a RELATIVE app route. `missing_document_titles` is present on
 * the missing-documents queue; other queues may omit the optional enrichment
 * fields.
 */
export interface DashboardCaseItem {
  case_id: number;
  case_title: string;
  person_name: string;
  person_id: number;
  status: PortalCaseStatus;
  priority: PortalCasePriority;
  due_date: string | null;
  is_overdue: boolean;
  updated_at: string;
  /** RELATIVE app route. Never a raw storage URL. */
  action_url: string;
  missing_requirements?: number;
  uploads_needing_review?: number;
  readiness_score?: number;
  /** Present on the missing-documents queue: the titles still outstanding. */
  missing_document_titles?: string[];
}

/**
 * A needs-replacement request on the dashboard: an upload the team asked the
 * recipient to redo. `action_url` is a RELATIVE app route.
 */
export interface DashboardNeedsReplacementItem {
  case_request_id: number;
  case_id: number;
  case_title: string;
  person_name: string;
  requested_document_title: string;
  status: string;
  /** RELATIVE app route. Never a raw storage URL. */
  action_url: string;
}

/**
 * A recent portal activity entry. `event_type` is a stable machine key (mapped
 * to a human label by `dashboardActivityLabel`); the `*_label` fields are
 * pre-formatted, safe display strings — they never contain raw tokens, file
 * URLs, or document content.
 */
export interface DashboardActivityItem {
  id: number;
  event_type: string;
  severity: string;
  object_label: string;
  related_object_label: string;
  actor_label: string;
  created_at: string;
}

/** The action queues that drive the dashboard's "what needs doing" lists. */
export interface DashboardQueues {
  review_now: DashboardReviewItem[];
  overdue_cases: DashboardCaseItem[];
  missing_documents: DashboardCaseItem[];
  needs_replacement: DashboardNeedsReplacementItem[];
  ready_cases: DashboardCaseItem[];
  recent_activity: DashboardActivityItem[];
}

/**
 * The Organization Dashboard payload: a single read-only snapshot of the org's
 * portal — its plan/limits (same shape as `PortalLimits`), operational metrics,
 * action queues, and recent activity. Behind the `b2b_portals` flag + Teams
 * entitlement. Readable by any active org member.
 */
export interface OrganizationDashboard {
  organization: { id: number; name: string };
  plan: PortalLimits;
  metrics: DashboardMetrics;
  queues: DashboardQueues;
  generated_at: string;
}

// ---- Bulk reminder emails ---------------------------------------------------

/**
 * The kind of reminder a bulk batch nudges recipients about. Each maps to a
 * preview query and a subject line the backend owns; the six values are the
 * only ones the reminder preview/batch endpoints accept.
 */
export type ReminderType =
  | "missing_documents"
  | "overdue_requests"
  | "needs_replacement"
  | "rejected_documents"
  | "due_soon_cases"
  | "collecting_documents";

/**
 * A single potential recipient in a reminder preview. `action_url` may carry a
 * recipient's own public upload link (a token-bearing route) — it is the
 * recipient's link, NOT something to render in the staff UI. Do not display it.
 * `eligible` decides whether the row can be selected/sent; `skip_reason`
 * explains why an ineligible row is held back.
 */
export interface ReminderCandidate {
  candidate_id: string;
  reminder_type: ReminderType;
  case_id: number;
  case_title: string;
  person_id: number | null;
  person_name: string;
  case_request_id: number | null;
  document_request_id: number | null;
  recipient_email: string;
  recipient_name: string;
  document_title: string;
  missing_titles: string[];
  due_date: string | null;
  status: string;
  reason: string;
  /** Recipient's own link (may contain a token). NEVER render this in the UI. */
  action_url: string;
  has_email: boolean;
  recently_reminded: boolean;
  eligible: boolean;
  skip_reason: "" | "no_email" | "recently_reminded";
}

/** The preview of who a reminder batch would reach, before anything is sent. */
export interface ReminderPreview {
  reminder_type: ReminderType;
  /** Read-only subject line the backend will use. Safe to display. */
  subject: string;
  count: number;
  eligible_count: number;
  candidates: ReminderCandidate[];
}

/** Lifecycle status of a reminder batch. */
export type ReminderBatchStatus =
  | "draft"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed"
  | "cancelled";

/** A recipient that was skipped when a batch was sent (email + a reason key). */
export interface ReminderSkip {
  email: string;
  reason: string;
}

/**
 * A reminder batch as returned on create/send/detail. `skipped` lists who was
 * held back and why; `recipients` is the per-recipient breakdown (present on
 * detail). No raw tokens or upload URLs are carried here.
 */
export interface ReminderBatch {
  batch_id: number;
  reminder_type: ReminderType;
  reminder_label: string;
  status: ReminderBatchStatus;
  subject: string;
  message_intro: string;
  case_id: number | null;
  recipient_count: number;
  sent_count: number;
  skipped_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
  sent_at: string | null;
  skipped: ReminderSkip[];
  recipients?: ReminderBatchRecipient[];
}

/** One recipient row inside a batch detail. Safe display fields only. */
export interface ReminderBatchRecipient {
  recipient_email: string;
  recipient_name: string;
  case_id: number | null;
  case_title: string;
  document_title: string;
  status: string;
}

/** Response from listing reminder batches. */
export interface ReminderBatchesResponse {
  batches: ReminderBatch[];
  count: number;
}

/** Query for the reminder preview endpoint. */
export interface ReminderPreviewQuery {
  reminder_type: ReminderType;
  case_id?: number;
  person_id?: number;
  include_recently_reminded?: boolean;
}

/** Body for creating a reminder batch. */
export interface CreateReminderBatchBody {
  reminder_type: ReminderType;
  selected_candidate_ids?: string[];
  message_intro?: string;
  case_id?: number;
  send_now?: boolean;
  override_recent_reminders?: boolean;
}

/** Body for sending a draft reminder batch. */
export interface SendReminderBatchBody {
  override_recent_reminders?: boolean;
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

/** Filters for the review queue listing. */
export interface PortalReviewQueueFilters {
  status?: PortalReviewStatus;
  case_id?: number;
  person_id?: number;
  search?: string;
}

/** Response from listing a case's review items (all statuses). */
export interface PortalCaseReviewItemsResponse {
  items: PortalReviewItem[];
  count: number;
}

/** Body for an admin review decision on a case request's upload. */
export interface ReviewCaseRequestBody {
  decision: PortalReviewDecision;
  note?: string;
  notify_recipient?: boolean;
}

/** Response from a review decision: the updated item, status, and progress. */
export interface ReviewCaseRequestResponse {
  case_request: PortalReviewItem;
  document_request_status: string;
  progress: PortalCaseProgress;
  notified_recipient: boolean;
}

/** Response from listing a case request's decision history. */
export interface ReviewDecisionsResponse {
  decisions: ReviewDecision[];
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

// ---- Organization case templates --------------------------------------------
//
// A reusable blueprint an org saves once and spins new cases from. It carries
// the case defaults (type, title pattern, priority, due window) plus the
// auto-create toggles (pack / room / requests) and an ordered list of document
// requirements. Templates support a 10-value `CaseType` — a superset of the
// `PortalCaseType` the live cases use today (it adds `insurance_claim`, `grant`,
// and `internship`). Managing templates is admin/owner only; any member may
// read them. Behind the `b2b_portals` flag + Teams entitlement.

/**
 * The kind of case a template produces. A superset of `PortalCaseType` — the
 * three extra values (`insurance_claim`, `grant`, `internship`) are valid on a
 * template and on a case created from one.
 */
export type CaseType =
  | "visa"
  | "scholarship"
  | "admission"
  | "employee_onboarding"
  | "compliance"
  | "client_file"
  | "insurance_claim"
  | "grant"
  | "internship"
  | "general";

/** Lifecycle status of a template. Archived templates are hidden by default. */
export type OrgCaseTemplateStatus = "active" | "archived";

/**
 * One document requirement on a template. `sort_order` is the position used to
 * order rows; the UI sets it from each row's index on submit. `due_days_offset`
 * is a per-requirement due window relative to the case's start (null = none).
 */
export interface OrgTemplateRequirement {
  id?: number;
  title: string;
  instructions?: string;
  required: boolean;
  sort_order: number;
  request_message?: string;
  due_days_offset?: number | null;
  accepted_file_types?: string[];
}

/**
 * The shared fields of a template — the base for both the list summary and the
 * full detail. `default_case_title` may contain the literal `{person_name}`
 * placeholder, expanded by `renderTemplateTitlePreview` when a case is created.
 */
export interface OrgCaseTemplateBase {
  id?: number;
  name: string;
  description?: string;
  case_type: CaseType;
  default_case_title?: string;
  default_priority: PortalCasePriority;
  default_due_days?: number | null;
  auto_create_pack: boolean;
  auto_create_room: boolean;
  auto_create_requests: boolean;
  default_room_title?: string;
  default_room_description?: string;
  status: OrgCaseTemplateStatus;
  requirement_count: number;
}

/** A full template, including its ordered requirements (detail response). */
export interface OrgCaseTemplate extends OrgCaseTemplateBase {
  id: number;
  requirements: OrgTemplateRequirement[];
}

/** A list-row template — no `requirements` array, just the `requirement_count`. */
export type OrgCaseTemplateSummary = OrgCaseTemplateBase & { id: number };

/** Response from listing templates. */
export interface OrgCaseTemplatesResponse {
  templates: OrgCaseTemplateSummary[];
  count: number;
}

/**
 * Body for creating or editing a template. Include `requirements` to replace the
 * full set (a PATCH that omits it leaves the existing requirements untouched).
 */
export interface OrgCaseTemplateBody {
  name: string;
  description?: string;
  case_type: CaseType;
  default_case_title?: string;
  default_priority: PortalCasePriority;
  default_due_days?: number | null;
  auto_create_pack: boolean;
  auto_create_room: boolean;
  auto_create_requests: boolean;
  default_room_title?: string;
  default_room_description?: string;
  status?: OrgCaseTemplateStatus;
  requirements?: OrgTemplateRequirement[];
}

/**
 * Body for creating a case from a template. Omitted `create_*` toggles fall back
 * to the template's `auto_create_*` defaults. `selected_requirement_ids` narrows
 * which of the template's requirements become requests/pack items; omit to use
 * them all. `send_request_emails` is opt-in (off by default).
 */
export interface CreateCaseFromTemplateBody {
  person_id: number;
  title?: string;
  due_date?: string | null;
  create_pack?: boolean;
  create_room?: boolean;
  create_requests?: boolean;
  send_request_emails?: boolean;
  selected_requirement_ids?: number[];
}

/**
 * A non-blocking warning a create-from-template can carry. Room/request limit
 * hits are NOT errors — they come back here so the case is still created and the
 * UI can explain what was skipped.
 */
export type CreateCaseFromTemplateWarning =
  | "room_limit_reached"
  | "request_limit_reached"
  | "room_not_created";

/**
 * Result of creating a case from a template: the new case (same shape as
 * `getPortalCase`), what was auto-created, which requirements were skipped, any
 * non-blocking warnings, and the fresh progress snapshot.
 */
export interface CreateCaseFromTemplateResult {
  case: PortalCase;
  pack_created: boolean;
  room_created: boolean;
  created_requests_count: number;
  skipped_requirements: string[];
  warnings: CreateCaseFromTemplateWarning[];
  progress: PortalCaseProgress;
}
