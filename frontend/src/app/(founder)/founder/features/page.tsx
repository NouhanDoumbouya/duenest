"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
} from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { FounderInsightPanel } from "@/components/founder/insight-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  FOUNDER_PRIORITY_LABELS,
  createFeatureCompletion,
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
const editableFields = [
  "backend_done",
  "frontend_done",
  "tests_done",
  "docs_done",
  "polished",
  "status",
  "priority",
  "notes",
] as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

function completionPercent(item: FeatureCompletionItem) {
  const flags = [
    item.backend_done,
    item.frontend_done,
    item.tests_done,
    item.docs_done,
    item.polished,
  ];
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

function hasChanges(item: FeatureCompletionItem, draft: FeatureCompletionItem) {
  return editableFields.some((field) => item[field] !== draft[field]);
}

export default function FounderFeatureCompletionPage() {
  const [data, setData] = useState<FeatureCompletionResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<number, FeatureCompletionItem>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeatureCompletionStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<FounderPriority | "">("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [newFeature, setNewFeature] = useState({
    feature_name: "",
    module: "",
    priority: "high" as FounderPriority,
  });
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
      setSavedId(updated.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to save feature status.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function createFeature() {
    if (!newFeature.feature_name.trim() || !newFeature.module.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createFeatureCompletion({
        feature_name: newFeature.feature_name.trim(),
        module: newFeature.module.trim(),
        priority: newFeature.priority,
        status: "in_progress",
      });
      setData((current) =>
        current
          ? { ...current, items: [created, ...current.items] }
          : { summary: { total: 1, percent: 0 }, items: [created] },
      );
      setDrafts((current) => ({ ...current, [created.id]: created }));
      setNewFeature({ feature_name: "", module: "", priority: "high" });
      setSavedId(created.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to add feature row.",
      );
    } finally {
      setCreating(false);
    }
  }

  const maturity = useMemo(() => {
    const items = data?.items ?? [];
    const notReady = items.filter((i) => i.status !== "ready");
    const criticalIncomplete = notReady.filter((i) => i.priority === "critical");
    const missingTests = items.filter((i) => !i.tests_done);
    const missingDocs = items.filter((i) => !i.docs_done);
    return { notReady, criticalIncomplete, missingTests, missingDocs };
  }, [data]);

  const insights = useMemo(() => {
    if (!data) return [];
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    if (maturity.criticalIncomplete.length > 0) {
      items.push({
        tone: "warn",
        text: `Critical features not yet ready: ${maturity.criticalIncomplete.map((i) => i.feature_name).join(", ")}.`,
      });
    }
    if (maturity.missingTests.length > 0) {
      items.push({
        tone: "neutral",
        text: `${maturity.missingTests.length} ${maturity.missingTests.length === 1 ? "feature is" : "features are"} missing tests — a common launch risk.`,
      });
    }
    if (maturity.notReady.length === 0) {
      items.push({
        tone: "good",
        text: "Every tracked feature is marked ready. Re-verify the critical ones before launch.",
      });
    }
    return items;
  }, [data, maturity]);

  const modules = useMemo(
    () => Array.from(new Set((data?.items ?? []).map((item) => item.module))).sort(),
    [data],
  );
  const visibleItems = useMemo(() => {
    return (data?.items ?? []).filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      if (moduleFilter && item.module !== moduleFilter) return false;
      return true;
    });
  }, [data, moduleFilter, priorityFilter, statusFilter]);

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FounderStatCard
          icon={CheckCircle2}
          label="Feature readiness"
          value={`${data.summary.percent}%`}
          hint={`${data.summary.ready ?? 0} of ${data.summary.total} fully ready`}
          tone={data.summary.percent >= 80 ? "good" : "warn"}
        />
        <FounderStatCard
          icon={ShieldAlert}
          label="Critical not ready"
          value={maturity.criticalIncomplete.length}
          hint="Priority critical, status not ready"
          tone={maturity.criticalIncomplete.length > 0 ? "danger" : "good"}
        />
        <FounderStatCard
          icon={FlaskConical}
          label="Missing tests"
          value={maturity.missingTests.length}
          hint="Features without tests done"
          tone={maturity.missingTests.length > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={FileText}
          label="Missing docs"
          value={maturity.missingDocs.length}
          hint="Features without docs done"
          tone={maturity.missingDocs.length > 0 ? "warn" : "good"}
        />
      </div>

      <FounderInsightPanel title="Launch maturity" insights={insights} />

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Input
              value={newFeature.feature_name}
              onChange={(event) =>
                setNewFeature((current) => ({
                  ...current,
                  feature_name: event.target.value,
                }))
              }
              placeholder="New feature name"
            />
            <Input
              value={newFeature.module}
              onChange={(event) =>
                setNewFeature((current) => ({
                  ...current,
                  module: event.target.value,
                }))
              }
              placeholder="Module"
            />
            <Button
              onClick={createFeature}
              disabled={
                creating ||
                !newFeature.feature_name.trim() ||
                !newFeature.module.trim()
              }
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add feature
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as FeatureCompletionStatus | "")
              }
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {label(option)}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as FounderPriority | "")
              }
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">All priorities</option>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {FOUNDER_PRIORITY_LABELS[option]}
                </option>
              ))}
            </select>
            <select
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {visibleItems.map((item) => {
          const draft = drafts[item.id] ?? item;
          const changed = hasChanges(item, draft);
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
                      <Badge variant="secondary">{completionPercent(draft)}%</Badge>
                      {savedId === item.id && !changed && (
                        <Badge variant="outline">Saved</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Priority: {FOUNDER_PRIORITY_LABELS[draft.priority]}
                    </p>
                  </div>
                  {changed && (
                    <Button onClick={() => save(item)} disabled={savingId === item.id}>
                      {savingId === item.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save
                    </Button>
                  )}
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
