"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { formatBytes, getPlanUsage, usagePercent } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { PlanResourceUsage, PlanUsage } from "@/types/plan";

const RESOURCE_ORDER: Array<keyof PlanUsage["resources"]> = [
  "documents",
  "files",
  "bundles",
  "reminders",
  "active_share_links",
  "emergency_packs",
];

function UsageRow({ usage }: { usage: PlanResourceUsage }) {
  const percent = usagePercent(usage.used, usage.limit);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize">{usage.label}</span>
        <span
          className={cn(
            "text-xs",
            usage.at_limit ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {usage.used}
          {usage.unlimited ? "" : ` / ${usage.limit}`}
          {usage.unlimited && " · Unlimited"}
        </span>
      </div>
      {percent !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              usage.at_limit
                ? "bg-destructive"
                : percent >= 80
                  ? "bg-amber-500"
                  : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Plan badge + per-resource usage with limit warnings and an upgrade
 * placeholder. There is no real billing yet — the upgrade button is a
 * deliberate placeholder.
 */
export function PlanUsageCard() {
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPlanUsage()
      .then((result) => active && setUsage(result))
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load plan usage.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const atLimit =
    usage && RESOURCE_ORDER.some((key) => usage.resources[key]?.at_limit);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Plan &amp; usage</CardTitle>
            <CardDescription>
              What you’re using on your current plan.
            </CardDescription>
          </div>
          {usage && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                usage.is_free
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              {usage.plan_label} plan
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        {usage === null && !error ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Loading usage…</span>
          </div>
        ) : usage ? (
          <>
            {atLimit && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You’ve reached a limit on the {usage.plan_label} plan. Remove some
                items or upgrade to add more.
              </p>
            )}

            <div className="space-y-3">
              {RESOURCE_ORDER.map((key) => (
                <UsageRow key={key} usage={usage.resources[key]} />
              ))}
            </div>

            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              Storage:{" "}
              {usage.storage.unlimited
                ? `${formatBytes(usage.storage.used_bytes)} used · Unlimited`
                : `${formatBytes(usage.storage.used_bytes)} of ${formatBytes(
                    usage.storage.limit_bytes ?? 0,
                  )} used`}
            </div>

            {usage.is_free && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-medium">Need more room?</p>
                  <p className="text-xs text-muted-foreground">
                    A paid plan is coming soon — billing isn’t available yet.
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled>
                  <Sparkles className="size-4" />
                  Upgrade (soon)
                </Button>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
