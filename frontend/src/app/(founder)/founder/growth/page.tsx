"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LinkIcon, ListChecks, Megaphone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyGrowthState,
  GrowthFunnelChart,
  GrowthInsightCard,
  GrowthKpiCard,
  GrowthPageHeader,
  GrowthRangeSelect,
} from "@/components/founder/growth/growth-ui";
import {
  getGrowthFunnel,
  getGrowthOverview,
  type GrowthFunnel,
  type GrowthOverview,
  type GrowthRange,
} from "@/lib/founder-growth";

const KPI_LAYOUT: { key: string; title: string }[] = [
  { key: "signups", title: "Signups" },
  { key: "activated_users", title: "Activated users" },
  { key: "activation_rate", title: "Activation rate" },
  { key: "active_users_7d", title: "Active (7d)" },
  { key: "free_users", title: "Free users" },
  { key: "pro_users", title: "Pro users" },
];

const QUICK_LINKS = [
  { href: "/founder/growth/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/founder/growth/utm-builder", label: "UTM Builder", icon: LinkIcon },
  { href: "/founder/growth/actions", label: "Action Center", icon: ListChecks },
];

export default function GrowthOverviewPage() {
  const [range, setRange] = useState<GrowthRange>("30d");
  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [funnel, setFunnel] = useState<GrowthFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getGrowthOverview(range), getGrowthFunnel(range)])
      .then(([o, f]) => {
        if (!active) return;
        setOverview(o);
        setFunnel(f);
        setError(null);
      })
      .catch(() => active && setError("Could not load growth data."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range]);

  return (
    <div className="space-y-6">
      <GrowthPageHeader
        title="Growth Command Center"
        subtitle="What's happening, why, and what to do next."
      >
        <GrowthRangeSelect value={range} onChange={setRange} />
      </GrowthPageHeader>

      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            <l.icon className="size-4 text-muted-foreground" aria-hidden="true" />
            {l.label}
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <GrowthOverviewSkeleton />
      ) : overview ? (
        <>
          {overview.recommended_action && (
            <GrowthInsightCard insight={overview.recommended_action} hero />
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {KPI_LAYOUT.map((k) =>
              overview.kpis[k.key] ? (
                <GrowthKpiCard key={k.key} title={k.title} kpi={overview.kpis[k.key]} />
              ) : null,
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Marketing funnel</CardTitle>
              </CardHeader>
              <CardContent>
                {funnel ? (
                  <GrowthFunnelChart funnel={funnel} />
                ) : (
                  <p className="text-sm text-muted-foreground">No funnel data.</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Acquisition</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Top channel" value={overview.top_channel?.name ?? "Not enough data yet"} hint={overview.top_channel ? `${overview.top_channel.signups} signups` : undefined} />
                  <Row label="Best campaign" value={overview.best_campaign?.name ?? "Not enough data yet"} hint={overview.best_campaign ? `${overview.best_campaign.signups} signups` : undefined} />
                  <Row
                    label="Biggest drop-off"
                    value={
                      overview.biggest_drop_off
                        ? `${overview.biggest_drop_off.from} → ${overview.biggest_drop_off.to}`
                        : "None detected"
                    }
                    hint={overview.biggest_drop_off ? `${overview.biggest_drop_off.drop_pct}% lost` : undefined}
                  />
                </CardContent>
              </Card>

              {overview.insights.length > 1 && (
                <div className="space-y-2">
                  {overview.insights.slice(1).map((i) => (
                    <GrowthInsightCard key={i.key} insight={i} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <EmptyGrowthState
          title="No growth data yet"
          body="Start by creating a campaign link and sharing it with your first users."
        />
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">
        {value}
        {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

function GrowthOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
