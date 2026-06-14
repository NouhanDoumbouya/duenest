// Types for DueNest Calendar V1.

export type CalendarEventType =
  | "document_expiry"
  | "renewal_due"
  | "last_safe_action"
  | "reminder"
  | "bundle_deadline"
  | "appointment"
  | "proof_submission"
  | "share_expiry"
  | "room_expiry"
  | "emergency_pack_expiry"
  | "subscription_renewal"
  | "subscription_cancellation_deadline"
  | "subscription_trial_ending";

export type CalendarUrgency =
  | "overdue"
  | "critical"
  | "soon"
  | "upcoming"
  | "normal";

export type CalendarCategory =
  | "documents"
  | "reminders"
  | "bundles"
  | "appointments"
  | "proofs"
  | "shares"
  | "rooms"
  | "emergency"
  | "subscriptions";

export interface CalendarEvent {
  id: string;
  source_type: string;
  source_id: number;
  title: string;
  description: string;
  event_type: CalendarEventType;
  date: string;
  end_date: string | null;
  status: string;
  urgency: CalendarUrgency;
  category: CalendarCategory;
  linked_resource_type: string;
  linked_resource_id: number | null;
  linked_resource_url: string;
  metadata: Record<string, unknown>;
}

export interface CalendarEventsSummary {
  total_events: number;
  overdue_count: number;
  due_today_count: number;
  due_this_week_count: number;
  expiring_this_month_count: number;
  document_events_count: number;
  reminder_events_count: number;
  bundle_events_count: number;
  share_events_count: number;
  room_events_count: number;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  summary: CalendarEventsSummary;
}

export interface CalendarSummary {
  due_today: number;
  overdue: number;
  next_7_days: number;
  next_30_days: number;
  next_expiry: string | null;
  next_renewal: string | null;
  next_bundle_deadline: string | null;
  next_share_expiry: string | null;
  next_room_expiry: string | null;
}

export interface CalendarFilters {
  start?: string;
  end?: string;
  type?: string;
  urgency?: string;
  search?: string;
}
