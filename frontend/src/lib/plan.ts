// Plan limits API helpers (GET /api/v1/plan/usage/) plus small utilities for
// rendering usage and detecting plan-limit errors raised by the backend.

import { ApiError, apiFetch } from "./api";
import type { PlanLimitError, PlanUsage } from "@/types/plan";

/** Read-only plan + usage snapshot for the current user. */
export function getPlanUsage(): Promise<PlanUsage> {
  return apiFetch<PlanUsage>("/plan/usage/", { auth: true });
}

/**
 * Type guard for the structured 403 the backend returns when a free-tier limit
 * is reached. Lets callers show an upgrade prompt instead of a generic error.
 */
export function isPlanLimitError(
  err: unknown,
): err is ApiError & { data: PlanLimitError } {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const data = err.data as Record<string, unknown> | null;
  return !!data && data.code === "plan_limit_exceeded";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Percentage used (0–100), or null when the resource is unlimited. */
export function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(Math.round((used / limit) * 100), 100);
}
