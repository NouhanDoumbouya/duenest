"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Rocket, Save, ShieldAlert } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { FounderInsightPanel } from "@/components/founder/insight-panel";
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

  // Blocker breakdown for the cockpit summary + insight panel.
  const blockers = useMemo(() => {
    const items = data?.items ?? [];
    const open = items.filter((i) => !i.is_complete);
    const critical = open.filter((i) => i.priority === "critical");
    const high = open.filter((i) => i.priority === "high");
    const complete = items.filter((i) => i.is_complete).length;
    return { open, critical, high, complete };
  }, [data]);

  const insights = useMemo(() => {
    if (!data) return [];
    if (blockers.open.length === 0) {
      return [
        {
          tone: "good" as const,
          text: "Every tracked launch item is marked complete. Re-verify the riskiest ones before you ship.",
        },
      ];
    }
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    if (blockers.critical.length > 0) {
      items.push({
        tone: "warn",
        text: `Critical blockers: ${blockers.critical.map((i) => i.label).join(", ")}. These must close before launch.`,
      });
    }
    if (blockers.high.length > 0) {
      items.push({
        tone: "warn",
        text: `${blockers.high.length} high-priority ${blockers.high.length === 1 ? "item" : "items"} still open — schedule these next.`,
      });
    }
    if (blockers.critical.length === 0 && blockers.high.length === 0) {
      items.push({
        tone: "neutral",
        text: "Only lower-priority items remain — you're close. Confirm each is genuinely done.",
      });
    }
    return items;
  }, [data, blockers]);

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FounderStatCard
          icon={Rocket}
          label="Launch readiness"
          value={`${data.summary.percent}%`}
          hint={`${data.summary.complete ?? 0} of ${data.summary.total} complete`}
          tone={data.summary.percent >= 80 ? "good" : "warn"}
        />
        <FounderStatCard
          icon={ShieldAlert}
          label="Critical blockers"
          value={blockers.critical.length}
          hint="Open, priority critical"
          tone={blockers.critical.length > 0 ? "danger" : "good"}
        />
        <FounderStatCard
          icon={ShieldAlert}
          label="High blockers"
          value={blockers.high.length}
          hint="Open, priority high"
          tone={blockers.high.length > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={CheckCircle2}
          label="Completed"
          value={blockers.complete}
          hint={`of ${data.summary.total} tracked items`}
          tone="good"
        />
      </div>

      <FounderInsightPanel title="What blocks launch" insights={insights} />

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
