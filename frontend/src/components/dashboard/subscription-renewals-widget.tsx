"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubscriptionSummary } from "@/lib/subscriptions";
import type { SubscriptionSummary } from "@/types/subscriptions";

function money(amount: string, currency: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

function monthlyTotal(totals: Record<string, string>): string | null {
  const entries = Object.entries(totals);
  if (entries.length === 0) return null;
  return entries.map(([cur, amt]) => money(amt, cur)).join(" · ");
}

/**
 * Compact dashboard widget: upcoming subscription renewals, the monthly cost
 * summary (grouped by currency), and any cancellation deadlines coming up.
 */
export function SubscriptionRenewalsWidget() {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getSubscriptionSummary()
      .then((data) => active && setSummary(data))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;

  const monthly = summary ? monthlyTotal(summary.monthly_cost_by_currency) : null;

  return (
    <SectionCard
      title="Upcoming renewals"
      description={monthly ? `${monthly} / month` : undefined}
      action={
        <Link
          href="/dashboard/subscriptions"
          className="text-sm font-medium text-primary hover:underline"
        >
          All
        </Link>
      }
    >
      {summary === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : summary.top_upcoming_renewals.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No upcoming subscription renewals.{" "}
          <Link href="/dashboard/subscriptions/new" className="text-primary hover:underline">
            Add a subscription
          </Link>{" "}
          to track renewals here.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {summary.top_upcoming_renewals.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/subscriptions/${item.id}`}
                className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {money(item.amount, item.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {countdown(item.days_until_renewal)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {summary && summary.cancellation_deadlines_soon > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3.5" />
          {summary.cancellation_deadlines_soon} cancellation deadline
          {summary.cancellation_deadlines_soon === 1 ? "" : "s"} within 7 days
        </p>
      )}
    </SectionCard>
  );
}
