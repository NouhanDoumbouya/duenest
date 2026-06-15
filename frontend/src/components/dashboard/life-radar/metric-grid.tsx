import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/life-radar";
import { SeverityBadge } from "./badges";

export interface LifeRadarMetric {
  key: string;
  label: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
  severity?: Severity;
  /** Soft icon container tone. */
  tone: "blue" | "amber" | "teal" | "red" | "green" | "slate";
}

const TONE: Record<LifeRadarMetric["tone"], string> = {
  blue: "bg-primary/10 text-primary",
  amber: "bg-brand-amber/10 text-brand-amber",
  teal: "bg-brand-teal/10 text-brand-teal",
  red: "bg-destructive/10 text-destructive",
  green: "bg-brand-success/10 text-brand-success",
  slate: "bg-muted text-muted-foreground",
};

export function LifeRadarMetricCard({ metric }: { metric: LifeRadarMetric }) {
  const Icon = metric.icon;
  return (
    <Link
      href={metric.href}
      className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            TONE[metric.tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        {metric.severity && metric.severity !== "safe" && (
          <SeverityBadge severity={metric.severity} />
        )}
      </div>
      <div>
        <p className="text-xl font-semibold tracking-tight">{metric.value}</p>
        <p className="text-sm font-medium">{metric.label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {metric.subtitle}
        </p>
      </div>
    </Link>
  );
}

export function LifeRadarMetricGrid({
  metrics,
}: {
  metrics: LifeRadarMetric[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {metrics.map((metric) => (
        <LifeRadarMetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}
