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
  getFeatureCompletion,
  updateFeatureCompletion,
} from "@/lib/founder";
import type {
  FeatureCompletionItem,
  FeatureCompletionResponse,
  FeatureCompletionStatus,
  FounderPriority,
} from "@/types/founder";

const statusOptions: FeatureCompletionStatus[] = [
  "not_started",
  "in_progress",
  "partial",
  "ready",
  "needs_polish",
  "deferred",
];
const priorityOptions: FounderPriority[] = ["low", "medium", "high", "critical"];
const boolFields = [
  ["backend_done", "Backend"],
  ["frontend_done", "Frontend"],
  ["tests_done", "Tests"],
  ["docs_done", "Docs"],
  ["polished", "Polished"],
] as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function FounderFeatureCompletionPage() {
  const [data, setData] = useState<FeatureCompletionResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<number, FeatureCompletionItem>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFeatureCompletion()
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
            : "Unable to load feature completion.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  function updateDraft(id: number, patch: Partial<FeatureCompletionItem>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  async function save(item: FeatureCompletionItem) {
    const draft = drafts[item.id];
    setSavingId(item.id);
    setError(null);
    try {
      const updated = await updateFeatureCompletion(item.id, {
        backend_done: draft.backend_done,
        frontend_done: draft.frontend_done,
        tests_done: draft.tests_done,
        docs_done: draft.docs_done,
        polished: draft.polished,
        status: draft.status,
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
        err instanceof ApiError ? err.message : "Unable to save feature status.",
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
        eyebrow="Product maturity"
        title="Feature Completion"
        description="An internal tracker for what is backend-ready, frontend-ready, tested, documented, and polished before launch."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <FounderStatCard
          icon={CheckCircle2}
          label="Feature readiness"
          value={`${data.summary.percent}%`}
          hint={`${data.summary.ready ?? 0} of ${data.summary.total} fully ready`}
          tone={data.summary.percent >= 80 ? "good" : "warn"}
        />
      </div>

      <div className="space-y-3">
        {data.items.map((item) => {
          const draft = drafts[item.id] ?? item;
          return (
            <Card key={item.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-semibold">
                        {item.feature_name}
                      </h2>
                      <Badge variant="outline">{item.module}</Badge>
                      <Badge variant="secondary">
                        {draft.completion_percent}%
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Priority: {FOUNDER_PRIORITY_LABELS[draft.priority]}
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

                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.3fr]">
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        status: event.target.value as FeatureCompletionStatus,
                      })
                    }
                    className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {label(option)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        priority: event.target.value as FounderPriority,
                      })
                    }
                    className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>
                        {FOUNDER_PRIORITY_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {boolFields.map(([key, fieldLabel]) => (
                      <label
                        key={key}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft[key]}
                          onChange={(event) =>
                            updateDraft(item.id, { [key]: event.target.checked })
                          }
                        />
                        {fieldLabel}
                      </label>
                    ))}
                  </div>
                </div>

                <Textarea
                  value={draft.notes}
                  onChange={(event) =>
                    updateDraft(item.id, { notes: event.target.value })
                  }
                  placeholder="Founder notes, blockers, polish gaps..."
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
