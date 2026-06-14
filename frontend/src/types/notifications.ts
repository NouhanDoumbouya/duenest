import type { Paginated } from "@/types/documents";

export type NotificationType =
  | "document_expiry"
  | "document_renewal"
  | "document_missing_file"
  | "document_review_needed"
  | "subscription_renewal"
  | "subscription_cancellation_deadline"
  | "subscription_trial_ending"
  | "subscription_payment_due"
  | "subscription_payment_overdue"
  | "bundle_deadline"
  | "bundle_incomplete"
  | "checklist_item_due"
  | "checklist_missing_file"
  | "organization_request_due"
  | "organization_submission_review"
  | "organization_campaign_deadline"
  | "organization_member_missing_document"
  | "share_expiring"
  | "room_expiring"
  | "share_viewed"
  | "emergency_review"
  | "emergency_expiring"
  | "emergency_viewed"
  | "security_alert"
  | "failed_login_warning"
  | "storage_plan_warning"
  | "generic_reminder";

export type NotificationSeverity =
  | "info"
  | "warning"
  | "urgent"
  | "security"
  | "success";

export type NotificationStatus =
  | "pending"
  | "delivered"
  | "read"
  | "dismissed"
  | "failed"
  | "cancelled";

export interface NotificationRecord {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  source_type: string;
  source_id: string;
  action_url: string;
  scheduled_for: string;
  delivered_in_app_at: string | null;
  delivered_email_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_unread: boolean;
}

export interface NotificationSummary {
  unread_count: number;
  urgent_count: number;
  latest: NotificationRecord[];
}

export interface NotificationPreferences {
  in_app_enabled: boolean;
  email_enabled: boolean;
  document_reminders_enabled: boolean;
  subscription_reminders_enabled: boolean;
  checklist_bundle_reminders_enabled: boolean;
  organization_reminders_enabled: boolean;
  emergency_reminders_enabled: boolean;
  security_alerts_enabled: boolean;
  activity_notifications_enabled: boolean;
  reminder_digest_enabled: boolean;
  default_reminder_lead_days: number[];
  timezone: string;
  created_at: string;
  updated_at: string;
}

export type NotificationListResponse = Paginated<NotificationRecord>;

export interface NotificationListParams {
  unread?: boolean;
  status?: NotificationStatus;
  type?: NotificationType | "";
  severity?: NotificationSeverity | "";
  include_dismissed?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}
