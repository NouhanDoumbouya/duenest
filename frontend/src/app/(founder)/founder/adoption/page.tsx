"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, CircleSlash, Sparkles } from "lucide-react";

import {
  FounderPageHeader,
  FounderStatCard,
} from "@/components/founder/founder-ui";
import { FounderInsightPanel } from "@/components/founder/insight-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFeatureAdoption } from "@/lib/founder";
import { cn } from "@/lib/utils";
import type { FeatureAdoption, FeatureMetric } from "@/types/founder";

const nf = new Intl.NumberFormat();

// Features with some usage but low adoption are flagged for UX attention.
const ATTENTION_THRESHOLD = 25;

export default function FounderAdoptionPage() {
  const [data, setData] = useState<FeatureAdoption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFeatureAdoption()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load feature adoption.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    const features = data?.features ?? [];
    const inUse = features.filter((f) => f.total_events_count > 0);
    const zero = features.filter((f) => f.total_events_count === 0);
    const topAdopted = [...inUse]
      .sort((a, b) => b.adoption_percent - a.adoption_percent)
      .slice(0, 5);
    const needsAttention = inUse.filter(
      (f) => f.adoption_percent < ATTENTION_THRESHOLD,
    );
    const top = topAdopted[0];
    return { features, inUse, zero, topAdopted, needsAttention, top };
  }, [data]);

  const insights = useMemo(() => {
    if (!data) return [];
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    if (groups.features.length === 0) {
      return [
        {
          tone: "neutral" as const,
          text: "No feature usage has been recorded yet. Adoption will populate as users interact with each feature.",
        },
      ];
    }
    if (groups.top) {
      items.push({
        tone: "good",
        text: `"${groups.top.label}" is the most adopted feature (${groups.top.adoption_percent}% of active users).`,
      });
    }
    if (groups.needsAttention.length > 0) {
      const names = groups.needsAttention.slice(0, 3).map((f) => `"${f.label}"`).join(", ");
      items.push({
        tone: "warn",
        text: `${groups.needsAttention.length} ${groups.needsAttention.length === 1 ? "feature has" : "features have"} usage but low adoption — review the UX for ${names}.`,
      });
    }
    if (groups.zero.length > 0) {
      items.push({
        tone: "neutral",
        text: `${groups.zero.length} ${groups.zero.length === 1 ? "feature has" : "features have"} no usage yet — consider discoverability or whether they belong in the core flow.`,
      });
    }
    return items;
  }, [data, groups]);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[132px] animate-pulse" />
          ))}
        </div>
        <Card className="h-[320px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Product"
        title="Feature Adoption"
        description="Which features users actually reach for — so you can double down on what works and fix what is underused. Counts are privacy-safe usage signals only."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FounderStatCard
          icon={Activity}
          label="Features tracked"
          value={groups.features.length}
          hint="Across the product"
        />
        <FounderStatCard
          icon={CheckCircle2}
          label="In use"
          value={groups.inUse.length}
          hint="With at least one event"
          tone="good"
        />
        <FounderStatCard
          icon={CircleSlash}
          label="Not yet used"
          value={groups.zero.length}
          hint="Zero recorded usage"
          tone={groups.zero.length > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={Sparkles}
          label="Top feature"
          value={groups.top ? groups.top.label : "—"}
          hint={groups.top ? `${groups.top.adoption_percent}% adoption` : "No data yet"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {groups.needsAttention.length > 0 && (
            <FeatureGroup
              title="Needs UX attention"
              description="Some usage, but low adoption — likely a discoverability or flow problem."
              features={groups.needsAttention}
              tone="warn"
            />
          )}
          <FeatureGroup
            title="Top adopted"
            description="Your strongest features by share of active users."
            features={groups.topAdopted}
            tone="good"
          />
          {groups.zero.length > 0 && (
            <FeatureGroup
              title="Not yet used"
              description="No recorded usage in this view."
              features={groups.zero}
              tone="neutral"
            />
          )}
        </div>

        <FounderInsightPanel title="What to act on" insights={insights} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All features</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium">Users</th>
                <th className="py-2 pr-4 font-medium">Adoption</th>
                <th className="py-2 pr-4 font-medium">Last 7d</th>
                <th className="py-2 font-medium">Last 30d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...groups.features]
                .sort((a, b) => b.adoption_percent - a.adoption_percent)
                .map((f) => (
                  <tr key={f.feature_key}>
                    <td className="py-3 pr-4 font-medium">{f.label}</td>
                    <td className="py-3 pr-4 tabular-nums">{nf.format(f.users_count)}</td>
                    <td className="py-3 pr-4">
                      <AdoptionBar percent={f.adoption_percent} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{nf.format(f.last_7d_count)}</td>
                    <td className="py-3 tabular-nums">{nf.format(f.last_30d_count)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureGroup({
  title,
  description,
  features,
  tone,
}: {
  title: string;
  description: string;
  features: FeatureMetric[];
  tone: "good" | "warn" | "neutral";
}) {
  if (features.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f.feature_key} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {nf.format(f.users_count)} {f.users_count === 1 ? "user" : "users"} ·{" "}
                  {nf.format(f.total_events_count)} events
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
                  tone === "good" && "bg-brand-success/10 text-brand-success",
                  tone === "warn" && "bg-brand-amber/10 text-brand-amber",
                  tone === "neutral" && "bg-muted text-muted-foreground",
                )}
              >
                {f.adoption_percent}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AdoptionBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-brand-teal"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">{percent}%</span>
    </span>
  );
}
