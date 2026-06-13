"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  FOUNDER_PRIORITY_LABELS,
  getLaunchReadiness,
  updateLaunchReadinessItem,
} from "@/lib/founder";
import type {
  FounderPriority,
  LaunchChecklistItem,
  LaunchReadinessResponse,
} from "@/types/founder";

const priorities: FounderPriority[] = ["low", "medium", "high", "critical"];

export default function FounderLaunchPage() {
  const [data, setData] = useState<LaunchReadinessResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<number, LaunchChecklistItem>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getLaunchReadiness()
      .then((result) => {
        if (!active) return;
        setData(result);
        setDrafts(Object.fromEntries(result.items.map((item) => [item.id, item])));
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

  function updateDraft(id: number, patch: Partial<LaunchChecklistItem>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  async function save(item: LaunchChecklistItem) {
    const draft = drafts[item.id];
    setSavingId(item.id);
    setError(null);
    try {
      const updated = await updateLaunchReadinessItem(item.id, {
        is_complete: draft.is_complete,
        priority: draft.priority,
        notes: draft.notes,
      });
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((row) =>
                row.id === updated.id ? updated : row,
              ),
            }
          : current,
      );
      setDrafts((current) => ({ ...current, [updated.id]: updated }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to save launch item.",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return <Card className="h-[520px] animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Launch readiness"
        title="Launch Readiness"
        description="A practical cockpit for private beta and launch blockers. Keep it honest: complete means the feature is actually ready."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <FounderStatCard
          icon={CheckCircle2}
          label="Launch readiness"
          value={`${data.summary.percent}%`}
          hint={`${data.summary.complete ?? 0} of ${data.summary.total} complete`}
          tone={data.summary.percent >= 80 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.items.map((item) => {
          const draft = drafts[item.id] ?? item;
          return (
            <Card key={item.id}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-semibold">
                        {item.label}
                      </h2>
                      <Badge variant={draft.is_complete ? "secondary" : "outline"}>
                        {draft.is_complete ? "complete" : "open"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Button onClick={() => save(item)} disabled={savingId === item.id}>
                    {savingId === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.is_complete}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          is_complete: event.target.checked,
                        })
                      }
                    />
                    Complete
                  </label>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        priority: event.target.value as FounderPriority,
                      })
                    }
                    className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {FOUNDER_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </select>
                </div>

                <Textarea
                  value={draft.notes}
                  onChange={(event) =>
                    updateDraft(item.id, { notes: event.target.value })
                  }
                  placeholder="Operational notes, owner, blocker, follow-up..."
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
