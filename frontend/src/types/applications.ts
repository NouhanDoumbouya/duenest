// Application Tracker V1 — deterministic application/renewal lifecycle.
// Mirrors apps/documents/application_tracker.py payloads.

export type ApplicationType =
  | "scholarship"
  | "university"
  | "visa"
  | "job"
  | "internship"
  | "grant"
  | "permit"
  | "renewal"
  | "other";

export type ApplicationStatus =
  | "planning"
  | "checklist_created"
  | "documents_missing"
  | "ready_to_submit"
  | "submitted"
  | "under_review"
  | "interview"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "renewal_needed";

export type ApplicationPriority = "low" | "medium" | "high";

export type DeadlineState =
  | "no_deadline"
  | "upcoming"
  | "soon"
  | "urgent"
  | "overdue"
  | "completed";

export interface ApplicationLinkedPack {
  id: number;
  name: string;
  readiness_score: number;
  has_checklist: boolean;
  is_ready_to_share: boolean;
  missing_count: number;
  warning_count: number;
}

export interface ApplicationNextAction {
  type: string;
  label: string;
  description: string;
  priority: ApplicationPriority;
  bundle_id?: number;
}

/** Full deterministic payload from the list/detail endpoints. */
export interface TrackedApplication {
  id: number;
  title: string;
  type: ApplicationType;
  status: ApplicationStatus;
  status_label: string;
  suggested_status: ApplicationStatus;
  suggested_status_label: string;
  priority: ApplicationPriority;
  source_url: string | null;
  organization_name: string | null;
  deadline_date: string | null;
  days_until_deadline: number | null;
  deadline_state: DeadlineState;
  submitted_at: string | null;
  decision_date: string | null;
  target_start_date: string | null;
  linked_pack: ApplicationLinkedPack | null;
  next_actions: ApplicationNextAction[];
  notes: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationListResponse {
  count: number;
  items: TrackedApplication[];
}

export interface ApplicationSummary {
  total_active: number;
  urgent: number;
  ready_to_submit: number;
  submitted: number;
  overdue: number;
  completed: number;
  archived: number;
}

export interface CreateApplicationRequest {
  title: string;
  application_type?: ApplicationType;
  status?: ApplicationStatus;
  linked_bundle?: number | null;
  source_url?: string;
  organization_name?: string;
  deadline_date?: string | null;
  notes?: string;
  priority?: ApplicationPriority;
}

export type UpdateApplicationRequest = Partial<
  CreateApplicationRequest & {
    submitted_at: string | null;
    decision_date: string | null;
    target_start_date: string | null;
    is_archived: boolean;
  }
>;
