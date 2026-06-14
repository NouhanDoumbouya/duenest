export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type OrganizationType =
  | "student_association"
  | "ngo"
  | "club"
  | "small_team"
  | "company"
  | "community_group"
  | "scholarship_team"
  | "competition_team"
  | "other";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type OrganizationMemberStatus = "active" | "invited" | "suspended" | "left";
export type OrganizationInviteStatus = "pending" | "accepted" | "expired" | "revoked";
export type OrganizationRequestStatus =
  | "open"
  | "submitted"
  | "needs_changes"
  | "approved"
  | "rejected"
  | "cancelled"
  | "overdue";
export type OrganizationCampaignStatus =
  | "draft"
  | "active"
  | "completed"
  | "cancelled"
  | "archived";
export type OrganizationBundleStatus =
  | "draft"
  | "in_progress"
  | "ready"
  | "submitted"
  | "archived";
export type OrganizationRoomStatus = "draft" | "active" | "revoked" | "expired";
export type OrganizationReadinessStatus =
  | "healthy"
  | "needs_attention"
  | "at_risk"
  | "critical";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  description: string;
  website: string;
  country: string;
  organization_type: OrganizationType;
  created_by: number | null;
  archived_at: string | null;
  is_archived: boolean;
  user_role: OrganizationRole | "";
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationReadiness {
  score: number;
  status: OrganizationReadinessStatus;
  reasons: string[];
}

export interface OrganizationActivity {
  id: number;
  actor: number | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  safe_summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrganizationSummary {
  member_count: number;
  document_count: number;
  missing_files_count: number;
  expiring_soon_count: number;
  open_requests_count: number;
  overdue_requests_count: number;
  approved_submissions_count: number;
  rejected_or_needs_changes_count: number;
  active_campaigns_count: number;
  campaign_completion_percent: number;
  bundle_count: number;
  active_secure_rooms_count: number;
  upcoming_deadlines_count: number;
  readiness: OrganizationReadiness;
  recent_activity: OrganizationActivity[];
  next_recommended_action: string;
}

export interface OrganizationMembership {
  id: number;
  organization: number;
  user: number;
  user_name: string;
  user_email: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  joined_at: string | null;
  last_active_at: string | null;
  assigned_requests_count: number;
  overdue_requests_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvite {
  id: number;
  organization: number;
  email: string;
  role: OrganizationRole;
  status: OrganizationInviteStatus;
  token: string;
  invite_url: string;
  expires_at: string;
  expires_in_days: number;
  invited_by: number | null;
  invited_by_name: string;
  accepted_by: number | null;
  accepted_by_name: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInviteDetail {
  id: number;
  organization: number;
  organization_name: string;
  organization_type: OrganizationType;
  email: string;
  role: OrganizationRole;
  status: OrganizationInviteStatus;
  expires_at: string;
}

export interface OrganizationDocument {
  id: number;
  organization: number;
  created_by: number | null;
  assigned_to: number | null;
  assigned_to_name: string;
  title: string;
  document_type: string;
  issuer: string;
  country: string;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  status: string;
  notes: string;
  is_archived: boolean;
  archived_at: string | null;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationDocumentFile {
  id: number;
  organization: number;
  document: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  uploaded_by: number | null;
  created_at: string;
}

export interface DocumentRequestSubmission {
  id: number;
  organization: number;
  request: number;
  submitted_by_user: number | null;
  submitted_by_name: string;
  submitted_by_email: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  notes: string;
  status: "submitted" | "approved" | "rejected" | "needs_changes";
  reviewed_by: number | null;
  reviewed_by_name: string;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRequest {
  id: number;
  organization: number;
  requested_by: number | null;
  requested_by_name: string;
  assigned_to_member: number | null;
  assigned_to_name: string;
  recipient_email: string;
  campaign: number | null;
  title: string;
  description: string;
  required_file_type: string;
  deadline: string | null;
  status: OrganizationRequestStatus;
  linked_document: number | null;
  public_upload_token: string | null;
  public_upload_expires_at: string | null;
  public_upload_active: boolean;
  rejection_reason: string;
  internal_note: string;
  last_reminded_at: string | null;
  is_overdue: boolean;
  submissions: DocumentRequestSubmission[];
  created_at: string;
  updated_at: string;
}

export interface CampaignRequirement {
  id: number;
  campaign: number;
  title: string;
  description: string;
  required_file_type: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignTargetMember {
  id: number;
  campaign: number;
  member: number;
  member_name: string;
  member_email: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignProgress {
  target_count: number;
  submitted_count: number;
  approved_count: number;
  overdue_count: number;
  completion_percent: number;
}

export interface DocumentCollectionCampaign {
  id: number;
  organization: number;
  created_by: number | null;
  title: string;
  description: string;
  deadline: string | null;
  status: OrganizationCampaignStatus;
  target_all_members: boolean;
  instructions: string;
  requirements: CampaignRequirement[];
  targets: CampaignTargetMember[];
  progress: CampaignProgress;
  created_at: string;
  updated_at: string;
}

export interface OrganizationBundle {
  id: number;
  organization: number;
  created_by: number | null;
  title: string;
  description: string;
  target_date: string | null;
  status: OrganizationBundleStatus;
  readiness_score: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSecureRoomItem {
  id: number;
  room: number;
  document: number | null;
  file: number | null;
  notes: string;
  sort_order: number;
  created_at: string;
}

export interface OrganizationSecureRoom {
  id: number;
  organization: number;
  created_by: number | null;
  title: string;
  description: string;
  recipient_label: string;
  instructions: string;
  permission: "view_only" | "download_allowed";
  status: OrganizationRoomStatus;
  token: string | null;
  public_url: string;
  expires_at: string | null;
  revoked_at: string | null;
  items: OrganizationSecureRoomItem[];
  created_at: string;
  updated_at: string;
}

export interface OrganizationCalendarEvent {
  id: string;
  event_type: string;
  title: string;
  date: string;
  resource_type: string;
  resource_id: number;
  urgency: "overdue" | "soon" | "upcoming" | "normal";
}

export interface PublicDocumentRequest {
  id: number;
  organization_name: string;
  title: string;
  description: string;
  required_file_type: string;
  deadline: string | null;
  status: OrganizationRequestStatus;
  public_upload_active: boolean;
}

export interface PublicOrganizationSecureRoom {
  id: number;
  organization_name: string;
  title: string;
  description: string;
  recipient_label: string;
  instructions: string;
  permission: "view_only" | "download_allowed";
  status: OrganizationRoomStatus;
  expires_at: string | null;
  items: Array<{
    id: number;
    document_title: string;
    document_type: string;
    file_name: string;
    content_type: string;
    file_size: number;
    notes: string;
    sort_order: number;
  }>;
}
