import { apiFetch } from "./api";
import type {
  NotificationListParams,
  NotificationListResponse,
  NotificationPreferences,
  NotificationRecord,
  NotificationSeverity,
  NotificationSummary,
  NotificationType,
} from "@/types/notifications";

function toQueryString(params?: NotificationListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  document_expiry: "Document expiry",
  document_renewal: "Document renewal",
  document_missing_file: "Document missing file",
  document_review_needed: "Document review",
  subscription_renewal: "Subscription renewal",
  subscription_cancellation_deadline: "Cancellation deadline",
  subscription_trial_ending: "Trial ending",
  subscription_payment_due: "Payment due",
  subscription_payment_overdue: "Payment overdue",
  bundle_deadline: "Bundle deadline",
  bundle_incomplete: "Bundle incomplete",
  checklist_item_due: "Checklist item due",
  checklist_missing_file: "Checklist missing file",
  organization_request_due: "Organization request",
  organization_submission_review: "Submission review",
  organization_campaign_deadline: "Campaign deadline",
  organization_member_missing_document: "Member missing document",
  share_expiring: "Share expiring",
  room_expiring: "Room expiring",
  share_viewed: "Share viewed",
  emergency_review: "Emergency review",
  emergency_expiring: "Emergency expiring",
  emergency_viewed: "Emergency viewed",
  security_alert: "Security alert",
  failed_login_warning: "Failed login",
  storage_plan_warning: "Storage or plan",
  generic_reminder: "Reminder",
};

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: "Info",
  warning: "Warning",
  urgent: "Urgent",
  security: "Security",
  success: "Success",
};

export function listNotifications(
  params?: NotificationListParams,
): Promise<NotificationListResponse> {
  return apiFetch<NotificationListResponse>(
    `/notifications/${toQueryString(params)}`,
    { auth: true },
  );
}

export function getNotificationSummary(): Promise<NotificationSummary> {
  return apiFetch<NotificationSummary>("/notifications/summary/", { auth: true });
}

export function markNotificationRead(id: number): Promise<NotificationRecord> {
  return apiFetch<NotificationRecord>(`/notifications/${id}/mark-read/`, {
    method: "POST",
    auth: true,
  });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/notifications/mark-all-read/", {
    method: "POST",
    auth: true,
  });
}

export function dismissNotification(id: number): Promise<NotificationRecord> {
  return apiFetch<NotificationRecord>(`/notifications/${id}/dismiss/`, {
    method: "POST",
    auth: true,
  });
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/notifications/preferences/", {
    auth: true,
  });
}

export function updateNotificationPreferences(
  payload: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/notifications/preferences/", {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
