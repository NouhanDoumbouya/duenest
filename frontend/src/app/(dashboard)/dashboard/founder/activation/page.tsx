"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, CheckCircle2 } from "lucide-react";

import { FounderInsightPanel } from "@/components/founder/insight-panel";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getActivationFunnel } from "@/lib/founder";
import type { ActivationFunnel } from "@/types/founder";

const nf = new Intl.NumberFormat();

function pct(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export default function FounderActivationPage() {
  const [data, setData] = useState<ActivationFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getActivationFunnel()
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
            : "Unable to load activation funnel.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // Plain-language interpretation of where users drop off before first value.
  const insights = useMemo(() => {
    const steps = data?.steps ?? [];
    if (steps.length === 0) {
      return [
        {
          tone: "neutral" as const,
          text: "Not enough activation data yet — counts will populate as users sign up and set up their first documents.",
        },
      ];
    }
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    let biggest = { from: "", to: "", drop: 0 };
    for (let i = 1; i < steps.length; i++) {
      const drop = Math.max(0, steps[i - 1].count - steps[i].count);
      if (drop > biggest.drop) {
        biggest = { from: steps[i - 1].label, to: steps[i].label, drop };
      }
    }
    if (biggest.drop > 0) {
      items.push({
        tone: "warn",
        text: `The biggest drop-off is between "${biggest.from}" and "${biggest.to}" (${nf.format(biggest.drop)} users). Smoothing that step should lift activation most.`,
      });
    } else {
      items.push({
        tone: "good",
        text: "No significant drop-off between steps in the current data.",
      });
    }
    const optional = steps.filter((s) => s.optional).length;
    if (optional > 0) {
      items.push({
        tone: "neutral",
        text: "Optional steps (like secure sharing) measure adoption, not required activation — don't treat their drop-off as a funnel leak.",
      });
    }
    return items;
  }, [data]);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="h-[130px] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Activation funnel
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The first-value path from signup to document setup, reminders, and
          optional secure sharing. Counts come from real user-owned data and
          tracked product events.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.steps.map((step, index) => {
          const previous = data.steps[index - 1];
          const drop =
            previous && previous.count > 0
              ? Math.max(0, previous.count - step.count)
              : 0;
          return (
            <Card key={step.step_id}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{step.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {step.optional ? "Optional adoption step" : "Required activation step"}
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-1 text-xs font-medium text-brand-success">
                    <CheckCircle2 className="size-3.5" />
                    {nf.format(step.count)}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">From previous</p>
                    <p className="mt-1 text-lg font-semibold">
                      {pct(step.conversion_from_previous)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">From signup</p>
                    <p className="mt-1 text-lg font-semibold">
                      {pct(step.conversion_from_signup)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Drop-off</p>
                    <p className="mt-1 text-lg font-semibold">
                      {nf.format(drop)}
                    </p>
                  </div>
                </div>

                {index < data.steps.length - 1 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowDown className="size-3.5" />
                    Next: {data.steps[index + 1].label}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FounderInsightPanel title="Where users drop off" insights={insights} />
    </div>
  );
}
