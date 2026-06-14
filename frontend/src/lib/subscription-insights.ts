// Centralized, pure, testable derivations for the Subscription Radar.
//
// These helpers never call the API — they operate on data already loaded by the
// page (the summary, computed server-side, and the current subscription list).
// Keeping the math here avoids duplicate calculations scattered across the UI.

import type { Subscription, SubscriptionSummary } from "@/types/subscriptions";

function num(value: string | null): number {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function isActiveish(s: Subscription): boolean {
  return s.status === "active" || s.status === "trial";
}

export interface RadarCheck {
  id: string;
  text: string;
}

/**
 * A calm 0–100 read on how "under control" subscription tracking is, derived
 * entirely from the server-computed summary (so it reflects ALL active
 * subscriptions, not just the loaded page). Higher is calmer.
 */
export function controlScore(summary: SubscriptionSummary): number {
  if (summary.active_count === 0) return 0;
  let score = 100;
  score -= summary.review_recommended_count * 8;
  score -= summary.cancellation_deadlines_soon * 12;
  score -= summary.trials_ending_soon * 6;
  score -= summary.renewals_this_week * 3;
  score -= summary.cost_unestimable_count * 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function controlScoreLabel(score: number): string {
  if (score >= 85) return "In good control";
  if (score >= 60) return "Mostly under control";
  if (score >= 35) return "Needs attention";
  return "Worth a review";
}

function plural(n: number, singular: string, many: string): string {
  return `${n} subscription${n === 1 ? "" : "s"} ${n === 1 ? singular : many}`;
}

/**
 * "What am I forgetting?" — missing or unknown metadata across the given active
 * subscriptions. Pass the full active list (e.g. the default unfiltered view)
 * for a complete picture.
 */
export function missingMetadataChecks(subs: Subscription[]): RadarCheck[] {
  const active = subs.filter(isActiveish);
  const checks: RadarCheck[] = [];
  const count = (pred: (s: Subscription) => boolean) => active.filter(pred).length;

  const noPrice = count((s) => num(s.amount) <= 0);
  if (noPrice) checks.push({ id: "price", text: plural(noPrice, "is missing a price", "are missing a price") });

  const noDate = count((s) => !s.next_billing_date);
  if (noDate) checks.push({ id: "date", text: plural(noDate, "is missing a renewal date", "are missing a renewal date") });

  const noCategory = count((s) => !s.category);
  if (noCategory) checks.push({ id: "category", text: plural(noCategory, "has no category", "have no category") });

  const noReminder = count((s) => !s.reminder_days_before);
  if (noReminder) checks.push({ id: "reminder", text: plural(noReminder, "has no renewal reminder", "have no renewal reminders") });

  return checks;
}

/** The most expensive active subscription by monthly-equivalent cost. */
export function biggestMonthly(subs: Subscription[]): Subscription | null {
  let top: Subscription | null = null;
  for (const s of subs.filter(isActiveish)) {
    if (!s.state.cost_is_estimable) continue;
    if (!top || num(s.state.monthly_equivalent_amount) > num(top.state.monthly_equivalent_amount)) {
      top = s;
    }
  }
  return top;
}

/**
 * Estimated monthly savings if review/cancel-candidate subscriptions were
 * dropped, grouped by currency (no fake cross-currency conversion).
 */
export function savingsEstimate(subs: Subscription[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const s of subs) {
    const flagged = s.cancel_candidate || s.state.review_status === "cancel_candidate";
    if (!flagged || !s.state.cost_is_estimable) continue;
    totals[s.currency] = (totals[s.currency] ?? 0) + num(s.state.monthly_equivalent_amount);
  }
  return totals;
}

/** Stable sort that floats pinned subscriptions to the top. */
export function pinnedFirst(subs: Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}
