"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  GROWTH_RANGES,
  type FunnelStep,
  type GrowthFunnel,
  type GrowthInsight,
  type GrowthRange,
  type Kpi,
} from "@/lib/founder-growth";

export function GrowthRangeSelect({
  value,
  onChange,
}: {
  value: GrowthRange;
  onChange: (r: GrowthRange) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Date range">
      {GROWTH_RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          aria-pressed={value === r.value}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === r.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function trendMeta(kpi: Kpi) {
  const t = kpi.trend;
  if (!t || t.change_pct == null) return null;
  if (t.direction === "up") return { Icon: ArrowUpRight, cls: "text-emerald-600", label: `Up ${t.change_pct}%` };
  if (t.direction === "down") return { Icon: ArrowDownRight, cls: "text-red-600", label: `Down ${Math.abs(t.change_pct)}%` };
  return { Icon: Minus, cls: "text-muted-foreground", label: "No change" };
}

export function GrowthKpiCard({ title, kpi }: { title: string; kpi: Kpi }) {
  const t = trendMeta(kpi);
  const display =
    kpi.available === false
      ? "—"
      : kpi.value == null
        ? "—"
        : `${kpi.value}${kpi.unit ?? ""}`;
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{display}</span>
          {t && (
            <span className={cn("inline-flex items-center gap-0.5 text-xs", t.cls)}>
              <t.Icon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t.label}</span>
              <span aria-hidden="true">{t.label}</span>
            </span>
          )}
        </div>
        {kpi.available !== false && kpi.trend && (
          <p className="text-xs text-muted-foreground tabular-nums">
            vs {kpi.trend.previous.toLocaleString()} previous period
          </p>
        )}
        {kpi.explanation && (
          <p className="text-xs leading-snug text-muted-foreground">{kpi.explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}

const SEVERITY_STYLES: Record<GrowthInsight["severity"], string> = {
  critical: "border-red-300/60 bg-red-50 dark:bg-red-950/30",
  high: "border-amber-300/60 bg-amber-50 dark:bg-amber-950/30",
  info: "border-border bg-card",
};

export function GrowthInsightCard({ insight, hero = false }: { insight: GrowthInsight; hero?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        SEVERITY_STYLES[insight.severity],
        hero && "shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <TrendingUp className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {hero && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Biggest growth opportunity
            </p>
          )}
          <h3 className="text-sm font-semibold">{insight.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{insight.body}</p>
        </div>
      </div>
    </div>
  );
}

/** Lightweight SVG-free funnel: stacked horizontal bars. No chart dependency. */
export function GrowthFunnelChart({ funnel }: { funnel: GrowthFunnel }) {
  const max = Math.max(1, ...funnel.steps.map((s) => s.count));
  return (
    <div className="space-y-2" role="img" aria-label="Marketing funnel">
      <p className="sr-only">
        {funnel.steps.map((s) => `${s.label}: ${s.count}.`).join(" ")}
        {funnel.biggest_drop_off
          ? ` Biggest drop-off: ${funnel.biggest_drop_off.drop_pct}% between ${funnel.biggest_drop_off.from} and ${funnel.biggest_drop_off.to}.`
          : ""}
      </p>
      {funnel.steps.map((step: FunnelStep, i) => {
        const width = Math.max(2, Math.round((step.count / max) * 100));
        return (
          <div key={step.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {step.label}
                {step.estimated && (
                  <span className="ml-1 text-muted-foreground">(est.)</span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {step.count.toLocaleString()}
                {i > 0 && step.conversion_from_prev != null && (
                  <span className="ml-2">{step.conversion_from_prev}%</span>
                )}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-muted">
              <div
                className="flex h-full items-center rounded-md bg-primary/80 transition-all"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
      {funnel.biggest_drop_off && (
        <p className="flex items-center gap-1.5 pt-1 text-xs text-amber-700 dark:text-amber-500">
          <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />
          Biggest drop-off: {funnel.biggest_drop_off.drop_pct}% between{" "}
          {funnel.biggest_drop_off.from} and {funnel.biggest_drop_off.to} (
          {funnel.biggest_drop_off.lost_users.toLocaleString()} users)
        </p>
      )}
    </div>
  );
}

export function EmptyGrowthState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function GrowthPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

const GROWTH_TABS = [
  { href: "/founder/growth", label: "Overview", exact: true },
  { href: "/founder/growth/insights", label: "Insights" },
  { href: "/founder/growth/campaigns", label: "Campaigns" },
  { href: "/founder/growth/utm-builder", label: "UTM" },
  { href: "/founder/growth/content", label: "Content" },
  { href: "/founder/growth/segments", label: "Segments" },
  { href: "/founder/growth/actions", label: "Actions" },
  { href: "/founder/growth/referrals", label: "Referrals" },
  { href: "/founder/beta", label: "Beta CRM" },
];

export function GrowthTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Growth sections">
      {GROWTH_TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
