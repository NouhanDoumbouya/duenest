"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getLaunchReadiness, updateLaunchReadinessItem } from "@/lib/founder";
import type {
  FounderPriority,
  FounderSummary,
  LaunchChecklistItem,
} from "@/types/founder";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<FounderPriority, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-brand-amber/15 text-brand-amber",
  medium: "bg-accent text-accent-foreground",
  low: "bg-muted text-muted-foreground",
};

function summarize(items: LaunchChecklistItem[]): {
  total: number;
  complete: number;
  percent: number;
} {
  const total = items.length;
  const complete = items.filter((i) => i.is_complete).length;
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);
  return { total, complete, percent };
}

export default function FounderLaunchPage() {
  const [items, setItems] = useState<LaunchChecklistItem[] | null>(null);
  const [summary, setSummary] = useState<FounderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getLaunchReadiness()
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setSummary(result.summary);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load launch readiness.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(item: LaunchChecklistItem) {
    if (busyId !== null) return;
    setBusyId(item.id);
    setError(null);
    const next = !item.is_complete;
    // Optimistic update.
    setItems((prev) =>
      (prev ?? []).map((i) =>
        i.id === item.id ? { ...i, is_complete: next } : i,
      ),
    );
    try {
      const saved = await updateLaunchReadinessItem(item.id, {
        is_complete: next,
      });
      setItems((prev) =>
        (prev ?? []).map((i) => (i.id === item.id ? saved : i)),
      );
    } catch (err) {
      // Revert on failure.
      setItems((prev) =>
        (prev ?? []).map((i) =>
          i.id === item.id ? { ...i, is_complete: item.is_complete } : i,
        ),
      );
      setError(
        err instanceof ApiError ? err.message : "Couldn't update that item.",
      );
    } finally {
      setBusyId(null);
    }
  }

  // Live counts from the local list so the bar reflects optimistic toggles; the
  // server `summary` still drives the headline beta/launch readiness figures.
  const live = items ? summarize(items) : null;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Launch"
        title="Launch readiness"
        description="The checklist that gates a confident launch. Tick items as they're truly done — critical items first."
      />

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {items === null ? (
        <Card className="h-[360px] animate-pulse" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Checklist done</p>
                <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
                  {live?.percent ?? 0}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {live?.complete ?? 0} of {live?.total ?? 0} items complete
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-success transition-all"
                    style={{ width: `${live?.percent ?? 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Private-beta ready
                </p>
                <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
                  {summary?.private_beta_ready_percent ?? 0}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowest of checklist &amp; feature completion
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Open blockers</p>
                <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
                  {summary?.generated_blockers_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Critical/high features not yet ready
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="divide-y divide-border p-0">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                >
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    disabled={busyId === item.id}
                    aria-pressed={item.is_complete}
                    aria-label={`Mark "${item.label}" ${item.is_complete ? "incomplete" : "complete"}`}
                    className="mt-0.5 shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  >
                    {busyId === item.id ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : item.is_complete ? (
                      <CheckCircle2 className="size-5 text-brand-success" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          item.is_complete &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {item.label}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[0.65rem] uppercase",
                          PRIORITY_STYLES[item.priority],
                        )}
                      >
                        {item.priority}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
