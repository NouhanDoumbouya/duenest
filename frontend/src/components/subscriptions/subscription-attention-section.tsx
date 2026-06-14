"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import {
  getSubscriptionAttention,
  markSubscriptionCancelled,
  markSubscriptionPaid,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import type { SubscriptionAttentionItem } from "@/types/subscriptions";

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

/**
 * Subscription contributions to the Attention Needed page. Renders nothing when
 * no subscriptions need attention, so it never adds noise to a clean inbox.
 */
export function SubscriptionAttentionSection() {
  const [items, setItems] = useState<SubscriptionAttentionItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    getSubscriptionAttention()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: number, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <SectionCard
      title={`Subscriptions: ${items.length}`}
      description="Renewals, cancellation deadlines, and trials that need a decision."
      action={
        <Link
          href="/dashboard/subscriptions"
          className="text-sm font-medium text-primary hover:underline"
        >
          All
        </Link>
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="size-3.5 text-brand-amber" />
        <span className="text-xs font-medium text-brand-amber">
          Act before the next charge
        </span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const canCancel = item.status === "active" || item.status === "trial";
          const overdue = item.urgency === "overdue";
          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/subscriptions/${item.id}`}
                  className="text-sm font-semibold hover:text-primary"
                >
                  {item.name}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.reasons.map((reason) => (
                    <Badge
                      key={reason}
                      variant="outline"
                      className={cn(
                        overdue
                          ? "border-destructive/25 bg-destructive/10 text-destructive"
                          : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
                      )}
                    >
                      {reason}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {money(item.amount, item.currency)}
                  {item.next_billing_date ? ` - renews ${item.next_billing_date}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === item.id}
                  onClick={() =>
                    runAction(item.id, () => markSubscriptionPaid(item.id))
                  }
                >
                  {busyId === item.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Mark paid"
                  )}
                </Button>
                {canCancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === item.id}
                    className="text-muted-foreground"
                    onClick={() =>
                      runAction(item.id, () => markSubscriptionCancelled(item.id))
                    }
                  >
                    Cancel
                  </Button>
                )}
                <Link
                  href={`/dashboard/subscriptions/${item.id}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
                >
                  Open
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
