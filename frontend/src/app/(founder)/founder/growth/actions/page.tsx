"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyGrowthState, GrowthPageHeader } from "@/components/founder/growth/growth-ui";
import { ApiError } from "@/lib/api";
import {
  createGrowthAction,
  listGrowthActions,
  updateGrowthAction,
  type GrowthAction,
} from "@/lib/founder-growth";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<GrowthAction["priority"], string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  low: "bg-muted text-muted-foreground",
};

export default function ActionCenterPage() {
  const [actions, setActions] = useState<GrowthAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listGrowthActions()
      .then((data) => active && setActions(data.results))
      .catch(() => active && setError("Could not load actions."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const setStatus = async (id: number, status: GrowthAction["status"]) => {
    const prev = actions;
    setActions((as) => as.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await updateGrowthAction(id, { status });
    } catch {
      setActions(prev);
    }
  };

  const open = actions.filter((a) => a.status === "open" || a.status === "in_progress");
  const resolved = actions.filter((a) => !["open", "in_progress"].includes(a.status));

  return (
    <div className="space-y-6">
      <GrowthPageHeader title="Action Center" subtitle="What to do next, not just what happened.">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden="true" /> New action
        </Button>
      </GrowthPageHeader>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <ActionForm
          onCreated={(a) => {
            setActions((as) => [a, ...as]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : actions.length === 0 ? (
        <EmptyGrowthState
          title="No urgent growth actions"
          body="DueNest will surface opportunities as data comes in. You can also add your own."
        />
      ) : (
        <div className="space-y-4">
          {open.map((a) => <ActionCard key={a.id} action={a} onStatus={setStatus} />)}
          {resolved.length > 0 && (
            <details className="rounded-lg border border-border bg-card p-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {resolved.length} resolved / dismissed
              </summary>
              <div className="mt-3 space-y-2">
                {resolved.map((a) => <ActionCard key={a.id} action={a} onStatus={setStatus} muted />)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  action,
  onStatus,
  muted,
}: {
  action: GrowthAction;
  onStatus: (id: number, s: GrowthAction["status"]) => void;
  muted?: boolean;
}) {
  return (
    <Card className={cn(muted && "opacity-70")}>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", PRIORITY_STYLES[action.priority])}>
              {action.priority}
            </span>
            {action.created_automatically && (
              <Badge variant="outline" className="text-[11px]">Auto</Badge>
            )}
            {action.status !== "open" && (
              <span className="text-[11px] capitalize text-muted-foreground">{action.status.replace("_", " ")}</span>
            )}
          </div>
          <p className="text-sm font-medium">{action.title}</p>
          {action.description && (
            <p className="text-sm text-muted-foreground">{action.description}</p>
          )}
        </div>
        {(action.status === "open" || action.status === "in_progress") && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" onClick={() => onStatus(action.id, "done")} aria-label="Mark done">
              <Check className="size-3.5" aria-hidden="true" /> Done
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStatus(action.id, "snoozed")} aria-label="Snooze">
              <Clock className="size-3.5" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStatus(action.id, "dismissed")} aria-label="Dismiss">
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (a: GrowthAction) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<GrowthAction["priority"]>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createGrowthAction({ title, description, priority });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create action.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="action-title">Title</Label>
          <Input id="action-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Email users who didn't add a document" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action-desc">Description</Label>
          <Input id="action-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action-priority">Priority</Label>
          <select
            id="action-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as GrowthAction["priority"])}
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">
            {busy ? "Creating…" : "Create action"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
