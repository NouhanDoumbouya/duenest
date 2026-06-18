import Link from "next/link";
import { Plus, Radar, ShieldCheck, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/life-radar";

const ACCENT_BAR: Record<Severity, string> = {
  critical: "bg-destructive",
  soon: "bg-brand-amber",
  review: "bg-primary",
  safe: "bg-brand-success",
};

export function LifeRadarHero({
  name,
  worstSeverity,
  readinessScore,
  lastChecked,
  onForgottenClick,
}: {
  name: string;
  worstSeverity: Severity;
  readinessScore: number;
  lastChecked: string;
  onForgottenClick?: () => void;
}) {
  return (
    <section
      aria-labelledby="life-radar-title"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-1", ACCENT_BAR[worstSeverity])}
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary">
            <Radar className="size-5" aria-hidden />
            <h1
              id="life-radar-title"
              className="font-heading text-3xl font-semibold tracking-tight text-foreground"
            >
              Life Radar
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {name}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/attention"
              onClick={onForgottenClick}
              className={cn(buttonVariants({ size: "lg" }))}
            >
              <Sparkles className="size-4" aria-hidden />
              What am I forgetting?
            </Link>
            <Link
              href="/dashboard/documents/new"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              <Plus className="size-4" aria-hidden />
              Add document
            </Link>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-success" aria-hidden />
            DueNest is watching · Last checked {lastChecked}
          </p>
        </div>

        {/* Readiness score — calm "how in control am I" signal. */}
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div
            className="flex size-12 items-center justify-center rounded-full text-base font-semibold"
            style={{
              background:
                "conic-gradient(var(--color-brand-success) " +
                readinessScore +
                "%, var(--color-border) 0)",
            }}
            aria-hidden
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-card text-sm">
              {readinessScore}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold">Control score</p>
            <p className="text-xs text-muted-foreground">
              {readinessScore}/100 this week
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
