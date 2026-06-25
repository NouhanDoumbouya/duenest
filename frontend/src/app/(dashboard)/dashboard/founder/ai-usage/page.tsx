"use client";

// Founder support console — AI usage. Safe metering aggregates only: requests,
// tokens, cost, failures by reason, top users, budget caps. NEVER prompts,
// document text, OCR, or model responses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { getFounderAiUsage } from "@/lib/founder";
import type { AiUsageOverview } from "@/types/founder";

export default function FounderAiUsagePage() {
  const [data, setData] = useState<AiUsageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderAiUsage()
      .then((d) => active && (setData(d), setError(null)))
      .catch(
        (err) =>
          active && setError(err instanceof ApiError ? err.message : "Could not load."),
      );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="AI usage" description="AI cost and usage health." />
        <ErrorState description={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="AI usage" description="AI cost and usage health." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  const reasons = Object.entries(data.failures_by_reason);

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="AI usage"
        description="Metering only — requests, tokens, cost. No prompts, document text, or responses."
        actions={
          <Badge variant={data.configured ? "secondary" : "outline"} className={data.configured ? "bg-brand-success/15 text-brand-success" : undefined}>
            {data.configured ? "AI configured" : "AI not configured"}
          </Badge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FounderStatCard label="Requests today" value={data.today.requests} hint={`${data.month.requests} this month`} icon={Sparkles} tone="default" />
        <FounderStatCard label="Tokens today" value={data.today.tokens} hint={`${data.month.tokens} this month`} icon={Sparkles} tone="default" />
        <FounderStatCard label="Cost today" value={`$${data.today.cost_usd.toFixed(2)}`} hint={`$${data.month.cost_usd.toFixed(2)} this month`} icon={Sparkles} tone="default" />
        <FounderStatCard
          label="Monthly cap"
          value={data.caps.monthly_cost_limit_usd !== null ? `$${data.caps.monthly_cost_limit_usd}` : "—"}
          hint={`${data.caps.daily_token_cap_user ?? "—"} tokens/user/day`}
          icon={Sparkles}
          tone="default"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Failures by reason (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI failures this month.</p>
            ) : (
              <ul className="space-y-1.5">
                {reasons.map(([reason, n]) => (
                  <li key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{reason || "unknown"}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top AI users (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI usage this month.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.top_users.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/dashboard/founder/users/${u.user_id}`} className="truncate hover:underline">
                      {u.email || `user ${u.user_id}`}
                    </Link>
                    <span className="font-medium">
                      {u.tokens} tokens · {u.requests} req
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
