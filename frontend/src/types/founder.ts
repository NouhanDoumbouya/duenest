import type { WaitlistPersona, WaitlistStatus } from "@/types/private-beta";

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

export type FounderRange = "7d" | "30d" | "90d" | "all";

export interface RecentActivitySummary {
  event_type: string;
  label: string;
  count: number;
  last_seen_at: string;
}

export interface FounderDashboard {
  range_key: FounderRange;
  range_days: number | null;
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  new_users_in_range: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  active_users_in_range: number;
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
  total_organizations: number;
  active_organizations: number;
  average_members_per_organization: number;
  total_organization_documents: number;
  total_organization_document_requests: number;
  total_organization_campaigns: number;
  total_organization_secure_rooms: number;
  total_feedback_items: number;
  open_feedback_items: number;
  open_error_items: number;
  security_events_count: number;
  security_events_in_range: number;
  beta_users: number;
  active_beta_users: number;
  total_waitlist_entries: number;
  pending_waitlist_entries: number;
  accepted_waitlist_entries: number;
  active_invite_codes: number;
  invite_conversion_percent: number;
  launch_readiness_percent: number;
  feature_completion_percent: number;
  recent_activity_summary: RecentActivitySummary[];
}

export interface ChartPoint {
  date: string;
  count: number;
}

export interface FounderBreakdownItem {
  key: string;
  label: string;
  count: number;
}

export interface FounderAnalytics {
  range_key: FounderRange;
  range_days: number | null;
  series: {
    user_growth: ChartPoint[];
    active_users: ChartPoint[];
    documents_created: ChartPoint[];
    files_uploaded: ChartPoint[];
    errors: ChartPoint[];
    security_events: ChartPoint[];
  };
  attention_breakdown: FounderBreakdownItem[];
  feedback_categories: FounderBreakdownItem[];
  failure_breakdown: FounderBreakdownItem[];
  privacy_note: string;
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
  subscriptions_used_count: number;
  organization_workspace_used_count: number;
  features: FeatureMetric[];
}

export type FeatureCompletionStatus =
  | "not_started"
  | "in_progress"
  | "partial"
  | "ready"
  | "needs_polish"
  | "deferred";

export type FounderPriority = "low" | "medium" | "high" | "critical";

export interface LaunchGeneratedBlocker {
  id: number;
  key: string;
  feature_name: string;
  module: string;
  priority: FounderPriority;
  status: FeatureCompletionStatus;
  missing: string[];
}

export interface FounderSummary {
  total: number;
  ready?: number;
  complete?: number;
  percent: number;
  feature_completion_percent?: number;
  generated_blockers_count?: number;
  generated_blockers?: LaunchGeneratedBlocker[];
  private_beta_ready_percent?: number;
  public_launch_ready_percent?: number;
}

export interface FeatureCompletionItem {
  id: number;
  key: string;
  feature_name: string;
  module: string;
  backend_done: boolean;
  frontend_done: boolean;
  tests_done: boolean;
  docs_done: boolean;
  polished: boolean;
  status: FeatureCompletionStatus;
  priority: FounderPriority;
  notes: string;
  sort_order: number;
  completion_percent: number;
  created_at: string;
  updated_at: string;
}

export interface FeatureCompletionResponse {
  summary: FounderSummary;
  items: FeatureCompletionItem[];
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
export type FeedbackContactPreference = "email" | "in_app" | "no_reply";

export interface FeedbackItem {
  id: number;
  user: number | null;
  user_email: string | null;
  email: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  urgency: FeedbackPriority;
  contact_preference: FeedbackContactPreference;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  source: string;
  related_path: string;
  related_feature: string;
  founder_notes: string;
  founder_response: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  responded_at: string | null;
  closed_at: string | null;
}

export interface SubmitFeedbackRequest {
  email?: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  urgency?: FeedbackPriority;
  contact_preference?: FeedbackContactPreference;
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

export interface FounderAuditLog {
  id: number;
  actor: number | null;
  actor_email: string | null;
  action: string;
  object_type: string;
  object_id: string;
  path: string;
  method: string;
  metadata: Record<string, unknown>;
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

export type BetaInviteStatus =
  | "not_invited"
  | "invited"
  | "accepted"
  | "active"
  | "paused"
  | "churned";

export type BetaPersona =
  | "international_student"
  | "visa_holder"
  | "scholarship_applicant"
  | "freelancer"
  | "family_user"
  | "student_leader"
  | "traveler"
  | "other";

export interface BetaUserProfile {
  id: number;
  user: number;
  user_email: string;
  username: string;
  date_joined: string;
  last_login: string | null;
  invite_status: BetaInviteStatus;
  persona: BetaPersona;
  tags: string[];
  notes: string;
  invited_at: string | null;
  activated_at: string | null;
  last_contacted_at: string | null;
  document_count: number;
  file_count: number;
  reminder_count: number;
  bundle_count: number;
  feedback_count: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LaunchChecklistItem {
  id: number;
  key: string;
  label: string;
  description: string;
  is_complete: boolean;
  priority: FounderPriority;
  notes: string;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LaunchReadinessResponse {
  summary: FounderSummary;
  items: LaunchChecklistItem[];
}

export interface CountryActivityItem {
  country: string;
  active_users: number;
  new_signups: number;
  documents_created: number;
  share_access: number;
  security_events: number;
  total_events: number;
  waitlist_entries: number;
  beta_users: number;
  last_seen_at: string | null;
}

export interface CountryActivityResponse {
  range_key: FounderRange;
  range_days: number | null;
  countries: CountryActivityItem[];
  privacy_note: string;
}

export interface FounderWaitlistEntry {
  id: number;
  full_name: string;
  email: string;
  persona: WaitlistPersona;
  country: string;
  message: string;
  referral_source: string;
  status: WaitlistStatus;
  founder_notes: string;
  invite_code: number | null;
  invite_code_value: string;
  invited_by: number | null;
  invited_by_email: string | null;
  accepted_user: number | null;
  accepted_user_email: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InviteCodeStatus = "active" | "disabled" | "expired" | "used_up";

export interface FounderInviteCodeUse {
  id: number;
  user: number | null;
  user_email: string | null;
  waitlist_entry: number | null;
  email: string;
  used_at: string;
}

export interface FounderInviteCode {
  id: number;
  code: string;
  label: string;
  created_by: number | null;
  created_by_email: string | null;
  max_uses: number;
  used_count: number;
  remaining_uses: number;
  expires_at: string | null;
  is_active: boolean;
  is_expired: boolean;
  status_label: InviteCodeStatus;
  persona_target: WaitlistPersona | "";
  notes: string;
  uses: FounderInviteCodeUse[];
  created_at: string;
  updated_at: string;
}

export interface PrivateBetaMetrics {
  total_waitlist_entries: number;
  pending_waitlist_entries: number;
  invited_waitlist_entries: number;
  accepted_waitlist_entries: number;
  rejected_waitlist_entries: number;
  waitlist_by_persona: FounderBreakdownItem[];
  active_invite_codes: number;
  expired_invite_codes: number;
  disabled_invite_codes: number;
  used_invite_codes: number;
  total_invite_uses: number;
  invite_conversion_percent: number;
  recent_waitlist_entries: Pick<
    FounderWaitlistEntry,
    "id" | "full_name" | "email" | "persona" | "status" | "country" | "created_at"
  >[];
}

export type FeatureFlagVisibility =
  | "enabled"
  | "beta_only"
  | "founder_only"
  | "disabled";

export interface FeatureFlag {
  id: number;
  key: string;
  name: string;
  description: string;
  visibility: FeatureFlagVisibility;
  maintenance_message: string;
  updated_at: string;
}

export interface DeliveryRunSummary {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: "success" | "partial" | "failed";
  trigger: "scheduled" | "manual";
  evaluated: number;
  created: number;
  in_app_delivered: number;
  emails_sent: number;
  emails_skipped: number;
  emails_failed: number;
  skipped_preferences: number;
  error: string;
}

export interface NotificationDeliveryHealth {
  email: { provider: string; configured: boolean; from_email: string };
  today: {
    generated: number;
    in_app_delivered: number;
    emails_sent: number;
    emails_skipped: number;
    emails_failed: number;
  };
  pending_undelivered: number;
  last_run: DeliveryRunSummary | null;
  last_successful_run: DeliveryRunSummary | null;
  recent_runs: DeliveryRunSummary[];
  recent_failures: {
    type: string;
    created_at: string;
    email_attempts: number;
    email_last_error: string;
  }[];
  email_failure_rate_7d: number;
  emails_attempted_7d: number;
}

// ---- Reliability & Observability V1 ----------------------------------------

export type OperationalSeverity = "info" | "warning" | "error" | "critical";
export type OperationalStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "skipped"
  | "degraded";

/** A safe operational lifecycle event (metadata already scrubbed server-side). */
export interface OperationalEvent {
  id: number;
  created_at: string;
  severity: OperationalSeverity;
  category: string;
  source: string;
  status: OperationalStatus;
  user: number | null;
  organization: number | null;
  correlation_id: string;
  message: string;
  error_code: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  resolution_note: string;
}

export interface SystemStatusComponent {
  ok?: boolean;
  configured?: boolean;
  backend?: string;
  provider?: string;
  embeddings_configured?: boolean;
  loaded?: boolean;
  count?: number;
}

export interface ScheduledJobRunInfo {
  job_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  emails_sent: number | null;
  emails_failed: number | null;
  error: string;
}

export interface SystemStatus {
  generated_at: string;
  overall: "ok" | "degraded" | "down";
  components: Record<string, SystemStatusComponent>;
  scheduled_jobs: ScheduledJobRunInfo[];
  counts: {
    unresolved_critical_events: number;
    critical_events_24h: number;
    unresolved_app_errors: number;
  };
}

export interface AiHealth {
  configured: boolean;
  embeddings_configured: boolean;
  succeeded_24h: number;
  errored_24h: number;
  blocked_24h: number;
  recent_failures: Array<{
    feature: string;
    provider: string;
    model: string;
    status: string;
    reason: string;
    created_at: string;
  }>;
}

export interface ObservabilityOverview {
  system_status: SystemStatus;
  recent_critical_events: OperationalEvent[];
  upload_storage_issues: OperationalEvent[];
  public_link_issues: OperationalEvent[];
  ai_health: AiHealth;
  email_health: NotificationDeliveryHealth | null;
}

// ---- Scheduled Jobs & Background Operations V1 -----------------------------

export interface ScheduledJobRun {
  id: number;
  job_name: string;
  display_name?: string;
  category?: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  attempted_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  triggered_by: string;
  triggered_by_user: number | null;
  correlation_id: string;
  error_code: string;
  safe_message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ScheduledJobHealth =
  | "healthy"
  | "never_run"
  | "stale"
  | "failing"
  | "disabled";

export interface ScheduledJob {
  job_name: string;
  display_name: string;
  description: string;
  category: string;
  command_name: string;
  expected_frequency: string;
  expected_max_age_minutes: number | null;
  is_enabled: boolean;
  is_manual_run_allowed: boolean;
  supports_dry_run: boolean;
  is_destructive: boolean;
  is_idempotent: boolean;
  safe_to_retry: boolean;
  notes: string;
  health: ScheduledJobHealth;
  last_run: ScheduledJobRun | null;
}

export interface ScheduledJobDetail extends ScheduledJob {
  recent_runs: ScheduledJobRun[];
}

export interface ScheduledJobsSummary {
  scheduled_jobs_total: number;
  scheduled_jobs_healthy: number;
  scheduled_jobs_failing: number;
  scheduled_jobs_stale: number;
  scheduled_jobs_never_run: number;
  scheduled_jobs_disabled: number;
  last_failed_job: string | null;
}

export interface ScheduledJobRunResult {
  run_id?: number;
  status?: string;
  dry_run?: boolean;
  attempted?: number;
  succeeded?: number;
  skipped?: number;
  failed?: number;
  message?: string;
  reason?: string;
  error_code?: string;
}
