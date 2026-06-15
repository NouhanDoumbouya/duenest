"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GrowthPageHeader,
  GrowthRangeSelect,
  GrowthTabs,
} from "@/components/founder/growth/growth-ui";
import {
  generateAutoActions,
  getGrowthCharts,
  type GrowthCharts,
  type GrowthRange,
} from "@/lib/founder-growth";

export default function GrowthInsightsPage() {
  const [range, setRange] = useState<GrowthRange>("30d");
  const [charts, setCharts] = useState<GrowthCharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getGrowthCharts(range)
      .then((c) => active && setCharts(c))
      .catch(() => active && setError("Could not load charts."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range]);

  const generate = async () => {
    setGenerating(true);
    setGenMsg(null);
    try {
      const { created } = await generateAutoActions();
      setGenMsg(created > 0 ? `Created ${created} new action${created > 1 ? "s" : ""}.` : "No new actions — you're on top of it.");
    } catch {
      setGenMsg("Could not generate actions.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <GrowthPageHeader title="Insights & Visualizations" subtitle="Which channels, segments, and referrers drive activation.">
        <div className="flex items-center gap-2">
          <GrowthRangeSelect value={range} onChange={setRange} />
          <Button variant="outline" onClick={generate} disabled={generating}>
            <Sparkles className="size-4" aria-hidden="true" /> {generating ? "Generating…" : "Generate actions"}
          </Button>
        </div>
      </GrowthPageHeader>
      <GrowthTabs />

      {genMsg && <p className="text-sm text-muted-foreground" role="status">{genMsg}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {loading || !charts ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Signups over time" question="Is acquisition growing?">
            <TimeBars data={charts.signups_over_time} />
          </ChartCard>
          <ChartCard title="Activated users over time" question="Are new users reaching their first document?">
            <TimeBars data={charts.activated_over_time} />
          </ChartCard>
          <ChartCard title="Acquisition channels" question="Which channel converts best?">
            <BarList rows={charts.channel_comparison.map((c) => ({ label: c.name, value: c.signups }))} unit="signups" />
          </ChartCard>
          <ChartCard title="Activation by segment" question="Which segment is most ready to convert?">
            <BarList
              rows={charts.activation_by_segment.map((s) => ({ label: s.name, value: s.activation_rate ?? 0 }))}
              unit="%"
            />
          </ChartCard>
          <ChartCard title="Open actions by priority" question="What needs attention?">
            <BarList rows={charts.action_priority_breakdown.map((p) => ({ label: p.priority, value: p.count }))} unit="" />
          </ChartCard>
          <ChartCard title="Referral leaderboard" question="Who brings activated users?">
            {charts.referral_leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referral data yet.</p>
            ) : (
              <BarList rows={charts.referral_leaderboard.map((r) => ({ label: r.referrer_email, value: r.activated }))} unit="activated" />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, question, children }: { title: string; question: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {children}
        <p className="text-xs text-muted-foreground">{question}</p>
      </CardContent>
    </Card>
  );
}

function TimeBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Not enough data yet.</p>;
  return (
    <div role="img" aria-label={`Time series, ${total} total`}>
      <p className="sr-only">{data.map((d) => `${d.date}: ${d.count}`).join(", ")}</p>
      <div className="flex h-28 items-end gap-px" aria-hidden="true">
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{total} total in range</p>
    </div>
  );
}

function BarList({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Not enough data yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex justify-between text-xs">
            <span className="truncate capitalize">{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{r.value}{unit ? ` ${unit}` : ""}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
