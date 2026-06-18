"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FixFirstItem as FixFirstItemData } from "@/lib/life-radar";
import { RiskTypeBadge, RiskTypeIcon, SeverityBadge } from "./badges";

const TOP_LIMIT = 5;

export function FixFirstItem({
  item,
  onRevoke,
  revoking,
}: {
  item: FixFirstItemData;
  onRevoke?: (id: number) => void;
  revoking?: boolean;
}) {
  return (
    <li className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <RiskTypeIcon type={item.type} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{item.title}</span>
            <SeverityBadge severity={item.severity} />
            <RiskTypeBadge type={item.type} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
          {item.timeContext && (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              {item.timeContext}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Link
              href={item.href}
              className={cn(buttonVariants({ size: "sm" }), "h-8")}
            >
              {item.actionLabel}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            {item.secondary?.kind === "revoke-share" && onRevoke && (
              <button
                type="button"
                disabled={revoking}
                onClick={() => onRevoke(item.secondary!.targetId)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 disabled:opacity-60",
                )}
              >
                {revoking ? "Revoking…" : item.secondary.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function FixFirstSection({
  items,
  onRevoke,
  revokingId,
}: {
  items: FixFirstItemData[];
  onRevoke?: (id: number) => void;
  revokingId?: number | null;
}) {
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-success/25 bg-brand-success/5 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-success/10 text-brand-success">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">Nothing urgent right now.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            DueNest will keep watching your documents, renewals, shares, and
            emergency setup.
          </p>
        </div>
      </div>
    );
  }

  const visible = showAll ? items : items.slice(0, TOP_LIMIT);

  return (
    <div>
      <ul className="space-y-2.5">
        {visible.map((item) => (
          <FixFirstItem
            key={item.id}
            item={item}
            onRevoke={onRevoke}
            revoking={revokingId === item.secondary?.targetId}
          />
        ))}
      </ul>
      {items.length > TOP_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-expanded={showAll}
        >
          {showAll
            ? "Show fewer"
            : `View all risks (${items.length})`}
        </button>
      )}
    </div>
  );
}
