// Types for the plan limits foundation (GET /api/v1/plan/usage/).
// Mirrors apps.documents.plan_usage.compute_plan_usage.

import type { UserPlan } from "./auth";

export type PlanResourceKey =
  | "documents"
  | "files"
  | "bundles"
  | "reminders"
  | "active_share_links"
  | "emergency_packs"
  | "subscriptions";

export interface PlanResourceUsage {
  resource: PlanResourceKey;
  label: string;
  used: number;
  /** Null means unlimited. */
  limit: number | null;
  remaining: number | null;
  at_limit: boolean;
  unlimited: boolean;
}

export interface PlanStorageUsage {
  used_bytes: number;
  limit_bytes: number | null;
  remaining_bytes: number | null;
  unlimited: boolean;
}

export interface PlanUsage {
  plan: UserPlan;
  plan_label: string;
  is_free: boolean;
  resources: Record<PlanResourceKey, PlanResourceUsage>;
  storage: PlanStorageUsage;
}

/** Shape of the 403 body raised by PlanLimitExceeded. */
export interface PlanLimitError {
  detail: string;
  code: "plan_limit_exceeded";
  resource: PlanResourceKey;
  limit: number;
  plan: UserPlan;
}
