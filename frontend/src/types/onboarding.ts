export interface OnboardingState {
  id: number;
  user: number;
  has_completed_document_onboarding: boolean;
  first_document_created_at: string | null;
  first_file_uploaded_at: string | null;
  first_expiry_date_added_at: string | null;
  first_reminder_created_at: string | null;
  first_share_link_created_at: string | null;
  first_checklist_created_at: string | null;
  checklist_completed_at: string | null;
  dismissed_onboarding_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UpdateOnboardingStateRequest {
  has_completed_document_onboarding?: boolean;
  metadata?: Record<string, unknown>;
}

export type SetupStepStatus = "completed" | "current" | "pending" | "optional";

export interface SetupChecklistStep {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  status: SetupStepStatus;
  is_required: boolean;
  href: string;
  metric: number | boolean | null;
}

export interface DocumentSetupChecklist {
  is_complete: boolean;
  percent: number;
  required_percent: number;
  completed_steps: number;
  total_steps: number;
  required_completed_steps: number;
  required_steps: number;
  counts: {
    documents: number;
    files: number;
    attention_needed: number;
    reminders: number;
    checklists: number;
    share_links: number;
  };
  steps: SetupChecklistStep[];
}

export interface DemoDataResponse {
  created?: boolean;
  demo_marker?: string;
  documents?: number[];
  file?: number;
  bundle?: number;
  checklist?: number;
  documents_deleted?: number;
  files_deleted?: number;
  related_records_deleted?: number;
}

export interface TrustCapability {
  key: string;
  label: string;
  enabled: boolean;
  detail: string;
}

export interface SecuritySummary {
  status: string;
  generated_at: string;
  capabilities: TrustCapability[];
  data_handling: Record<string, string | boolean>;
  limitations: string[];
}

export interface AccountDataSummary {
  generated_at: string;
  counts: {
    documents: number;
    trashed_documents: number;
    files: number;
    share_links: number;
    reminder_rules: number;
    checklists: number;
    bundles: number;
    proof_records: number;
    emergency_packs: number;
    export_requests: number;
  };
  latest_export: {
    id: number;
    status: string;
    export_type: string;
    requested_at: string;
    expires_at: string | null;
  } | null;
  active_deletion_request: {
    id: number;
    status: string;
    requested_at: string;
    scheduled_for: string | null;
    can_cancel: boolean;
  } | null;
}

export interface DocumentExportRequest {
  id: number;
  export_type: string;
  status: string;
  download_url: string | null;
  is_expired: boolean;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  error_message: string;
  metadata: Record<string, unknown>;
}

export interface AccountDeletionRequest {
  id: number;
  owner: number;
  status: "requested" | "processing" | "cancelled" | "completed";
  requested_at: string;
  scheduled_for: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  can_cancel: boolean;
  created_at: string;
  updated_at: string;
}
