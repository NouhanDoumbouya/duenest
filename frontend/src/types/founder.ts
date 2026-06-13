export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FounderMe {
  is_founder: boolean;
  user_id: number;
  email: string;
}

export interface RecentActivitySummary {
  event_type: string;
  label: string;
  count: number;
  last_seen_at: string;
}

export interface FounderDashboard {
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  total_documents: number;
  documents_created_7d: number;
  total_files_uploaded: number;
  files_uploaded_7d: number;
  total_reminders: number;
  reminders_created_7d: number;
  total_share_links: number;
  share_links_created_7d: number;
  total_attention_needed_items: number;
  total_checklists: number;
  total_bundles: number;
  total_exports: number;
  total_emergency_packs: number;
  total_feedback_items: number;
  open_feedback_items: number;
  open_error_items: number;
  recent_activity_summary: RecentActivitySummary[];
}

export interface ActivationStep {
  step_id: string;
  label: string;
  count: number;
  conversion_from_previous: number | null;
  conversion_from_signup: number | null;
  optional?: boolean;
}

export interface ActivationFunnel {
  steps: ActivationStep[];
}

export interface FeatureMetric {
  feature_key: string;
  label: string;
  users_count: number;
  total_events_count: number;
  adoption_percent: number;
  last_7d_count: number;
  last_30d_count: number;
}

export interface FeatureAdoption {
  preview_used_count: number;
  secure_sharing_used_count: number;
  access_code_sharing_used_count: number;
  reminders_used_count: number;
  attention_needed_used_count: number;
  checklists_used_count: number;
  bundles_used_count: number;
  timeline_used_count: number;
  extraction_used_count: number;
  export_used_count: number;
  emergency_pack_used_count: number;
  proof_records_used_count: number;
  trash_restore_used_count: number;
  features: FeatureMetric[];
}

export type FeedbackCategory =
  | "bug"
  | "feature_request"
  | "confusion"
  | "complaint"
  | "praise"
  | "security_concern"
  | "pricing"
  | "other";

export type FeedbackStatus =
  | "new"
  | "reviewed"
  | "planned"
  | "in_progress"
  | "shipped"
  | "rejected"
  | "closed";

export type FeedbackPriority = "low" | "medium" | "high" | "urgent";

export interface FeedbackItem {
  id: number;
  user: number | null;
  user_email: string | null;
  email: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  source: string;
  related_path: string;
  related_feature: string;
  founder_notes: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  closed_at: string | null;
}

export interface SubmitFeedbackRequest {
  email?: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  related_path?: string;
  related_feature?: string;
}

export interface ChecklistTemplateItem {
  id?: number;
  title: string;
  description: string;
  is_required: boolean;
  sort_order: number;
  suggested_due_offset_days?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ChecklistTemplate {
  id: number;
  title: string;
  description: string;
  document_type: string;
  use_case: string;
  checklist_type: string;
  country: string;
  is_system_template: boolean;
  is_active: boolean;
  sort_order: number;
  slug: string;
  items: ChecklistTemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface AppErrorLog {
  id: number;
  user: number | null;
  user_email: string | null;
  severity: "info" | "warning" | "error" | "critical";
  source: "backend" | "frontend" | "worker" | "system";
  error_type: string;
  message: string;
  path: string;
  method: string;
  status_code: number | null;
  traceback: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface SecurityEvent {
  id: number;
  event_kind: string;
  label: string;
  object_type: string;
  country: string;
  created_at: string;
}

export interface SecurityOverview {
  failed_login_attempts_24h: number;
  wrong_share_code_attempts_24h: number;
  expired_link_access_attempts_24h: number;
  revoked_link_access_attempts_24h: number;
  suspicious_events_count_7d: number;
  high_download_accounts_count: number;
  recent_security_events: SecurityEvent[];
}

export interface FounderUserListItem {
  id: number;
  email: string;
  username: string;
  date_joined: string;
  last_login: string | null;
  is_staff: boolean;
  document_count: number;
  file_count: number;
  reminder_count: number;
  checklist_count: number;
  bundle_count: number;
  share_link_count: number;
  feedback_count: number;
  onboarding_completed: boolean;
}

export interface FounderUserSummary {
  user: {
    id: number;
    email: string;
    username: string;
    date_joined: string;
    last_login: string | null;
    is_staff: boolean;
  };
  onboarding: {
    has_state: boolean;
    has_completed_document_onboarding: boolean;
  };
  counts: {
    documents: number;
    files: number;
    reminders: number;
    checklists: number;
    bundles: number;
    share_links: number;
    exports: number;
    feedback: number;
    emergency_packs: number;
    proof_records: number;
  };
  account_deletion_request: null | {
    id: number;
    status: string;
    requested_at: string;
    scheduled_for: string | null;
  };
  plan: string;
  safe_recent_activity_summary: RecentActivitySummary[];
  privacy_note: string;
}
