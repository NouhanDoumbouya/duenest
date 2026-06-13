"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
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
  const toneClass =
    tone === "good"
      ? "bg-brand-success/10 text-brand-success"
      : tone === "warn"
        ? "bg-brand-amber/15 text-brand-amber"
        : tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={cn("flex size-9 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight">
          {typeof value === "number" ? nf.format(value) : value}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function RangePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: "7d" | "30d" | "90d" | "all") => void;
}) {
  const options: { value: "7d" | "30d" | "90d" | "all"; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "all", label: "All time" },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-card p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">No data yet.</p>
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
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
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
          <p className="py-8 text-sm text-muted-foreground">No data yet.</p>
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
                    className="h-full rounded-full bg-primary"
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
