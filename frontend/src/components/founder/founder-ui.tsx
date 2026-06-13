"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductMetric, SegmentedControl } from "@/components/ui/product-ui";
import type { ChartPoint, FounderBreakdownItem } from "@/types/founder";

const nf = new Intl.NumberFormat();

export function FounderPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-page-title">{title}</h1>
        {description && (
          <p className="mt-2 text-page-subtitle">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FounderStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  return (
    <ProductMetric
      icon={Icon}
      label={label}
      value={typeof value === "number" ? nf.format(value) : value}
      hint={hint}
      tone={tone === "default" ? "secure" : tone}
      className="min-h-[132px]"
    />
  );
}

export function RangePicker({
  value,
  onChange,
}: {
  value: "7d" | "30d" | "90d" | "all";
  onChange: (value: "7d" | "30d" | "90d" | "all") => void;
}) {
  const options: { value: "7d" | "30d" | "90d" | "all"; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "all", label: "All time" },
  ];
  return (
    <SegmentedControl
      label="Founder analytics range"
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

export function FounderLineChart({
  title,
  description,
  data,
  color = "var(--chart-1)",
}: {
  title: string;
  description?: string;
  data: ChartPoint[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((point) => point.count));
  const width = 640;
  const height = 180;
  const points = data.map((point, index) => {
    const x = data.length <= 1 ? width : (index / (data.length - 1)) * width;
    const y = height - (point.count / max) * (height - 20) - 10;
    return { ...point, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const total = data.reduce((sum, point) => sum + point.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 || total === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No signal in this range</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              The chart will populate when privacy-safe product events exist
              for the selected period.
            </p>
          </div>
        ) : (
          <div>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-48 w-full overflow-visible"
              role="img"
              aria-label={title}
            >
              <path
                d={`M0,${height - 10} L${width},${height - 10}`}
                stroke="var(--border)"
                strokeWidth="1"
              />
              {[0.25, 0.5, 0.75].map((line) => (
                <path
                  key={line}
                  d={`M0,${height * line} L${width},${height * line}`}
                  stroke="var(--border)"
                  strokeDasharray="4 6"
                  strokeWidth="1"
                />
              ))}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                className="drop-shadow-sm"
              />
              {points.map((point) => (
                <circle
                  key={point.date}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill={color}
                />
              ))}
            </svg>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{data[0]?.date}</span>
              <span>Peak {nf.format(max)}</span>
              <span>{data[data.length - 1]?.date}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FounderBarList({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: FounderBreakdownItem[];
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">No breakdown yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              This section stays intentionally empty until there is enough
              aggregate activity to summarize.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">{nf.format(item.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
