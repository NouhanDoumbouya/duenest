"use client";

// Plan + usage card for CertaNest Portals. Shows the org's portal plan and a
// per-resource usage row (used / limit, a small progress bar, and a calm
// "near limit" chip). Unlimited limits read as "unlimited", never as a bar at
// 100%. This is informational only — no checkout, no Stripe.

import { Sparkles } from "lucide-react";

import {
  isNearLimit,
  limitLabel,
  planLabel,
  usagePercent,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type {
  PortalLimitResource,
  PortalLimits,
} from "@/types/portals";

/** Order the resource rows appear in the card. */
const RESOURCE_ORDER: PortalLimitResource[] = [
  "active_portal_cases",
  "portal_people",
  "active_document_requests",
  "active_sharing_rooms",
  "members",
];

function UsageRow({
  resource,
  used,
  limit,
}: {
  resource: PortalLimitResource;
  used: number;
  limit: number | null;
}) {
  const unlimited = limit === null;
  const percent = usagePercent(used, limit);
  const near = isNearLimit(used, limit);
  const atLimit = !unlimited && used >= (limit ?? 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          {limitLabel(resource)}
          {near && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                atLimit
                  ? "bg-destructive/10 text-destructive"
                  : "bg-brand-amber/15 text-brand-amber",
              )}
            >
              {atLimit ? "At limit" : "Near limit"}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {unlimited ? `${used} (unlimited)` : `${used} / ${limit}`}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${limitLabel(resource)} usage`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            unlimited
              ? "bg-primary/30"
              : atLimit
                ? "bg-destructive"
                : near
                  ? "bg-brand-amber"
                  : "bg-primary",
          )}
          style={{ width: unlimited ? "100%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function PlanUsageCard({ data }: { data: PortalLimits }) {
  return (
    <section
      aria-label="Plan and usage"
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold">Plan &amp; usage</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          {planLabel(data.plan)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        What this organization is using across its portal plan.
      </p>

      <div className="mt-4 space-y-3.5">
        {RESOURCE_ORDER.map((resource) => (
          <UsageRow
            key={resource}
            resource={resource}
            used={data.usage[resource]}
            limit={data.limits[resource]}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Calm banners shown when any resource is near or at its limit. Returns null
 * when there is nothing to warn about, so the caller can render it inline.
 */
export function LimitWarningBanners({ data }: { data: PortalLimits }) {
  const warnings = RESOURCE_ORDER.flatMap((resource) => {
    const limit = data.limits[resource];
    const used = data.usage[resource];
    if (limit === null) return [];
    if (!isNearLimit(used, limit)) return [];
    const atLimit = used >= limit;
    const label = limitLabel(resource).toLowerCase();
    return [
      {
        resource,
        atLimit,
        message: atLimit
          ? `This organization has reached its ${label} limit.`
          : `You're close to your ${label} limit.`,
      },
    ];
  });

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" role="status">
      {warnings.map((w) => (
        <p
          key={w.resource}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            w.atLimit
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
          )}
        >
          {w.message}
        </p>
      ))}
    </div>
  );
}
