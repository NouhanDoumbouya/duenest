"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyGrowthState,
  GrowthPageHeader,
  GrowthTabs,
} from "@/components/founder/growth/growth-ui";
import { ApiError } from "@/lib/api";
import {
  createSegment,
  listSegments,
  type AudienceSegment,
} from "@/lib/founder-growth";

export default function SegmentsPage() {
  const [segments, setSegments] = useState<AudienceSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listSegments()
      .then((d) => active && setSegments(d.results))
      .catch(() => active && setError("Could not load segments."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <GrowthPageHeader title="Audience Segments" subtitle="Define and measure who activates best.">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden="true" /> New segment
        </Button>
      </GrowthPageHeader>
      <GrowthTabs />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <SegmentForm
          onCreated={(s) => {
            setSegments((xs) => [...xs, s]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : segments.length === 0 ? (
        <EmptyGrowthState title="No segments yet" body="Create a segment (e.g. activated free users) to compare activation." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-medium">{s.name}</p>
                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Users" value={s.summary.size} />
                  <Stat label="Activation" value={s.summary.activation_rate == null ? "—" : `${s.summary.activation_rate}%`} />
                  <Stat label="Avg docs" value={s.summary.avg_documents ?? "—"} />
                </div>
                {s.summary.error && <p className="text-xs text-destructive">{s.summary.error}</p>}
                {s.summary.size === 0 && !s.summary.error && (
                  <p className="text-xs text-muted-foreground">Not enough data yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SegmentForm({ onCreated, onCancel }: { onCreated: (s: AudienceSegment) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [activation, setActivation] = useState("");
  const [goal, setGoal] = useState("");
  const [minDocs, setMinDocs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name the segment.");
      return;
    }
    const rules: Record<string, unknown> = {};
    if (plan) rules.plan = plan;
    if (activation) rules.activation = activation;
    if (goal) rules.goal = goal;
    if (minDocs) rules.min_documents = Number(minDocs);
    setBusy(true);
    setError(null);
    try {
      const created = await createSegment({ name, rules_json: rules });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create segment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New segment</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Activated free users" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select id="s-plan" label="Plan" value={plan} onChange={setPlan} options={[["", "Any"], ["free", "Free"], ["pro_placeholder", "Pro"]]} />
          <Select id="s-act" label="Activation" value={activation} onChange={setActivation} options={[["", "Any"], ["activated", "Activated"], ["not_activated", "Not activated"]]} />
          <Select id="s-goal" label="Onboarding goal" value={goal} onChange={setGoal} options={[["", "Any"], ["international_student", "International student"], ["applications", "Applications"], ["travel", "Travel"], ["family", "Family"], ["subscriptions", "Renewals & deadlines"], ["emergency", "Emergency"], ["vault", "Vault"]]} />
          <div className="space-y-1.5">
            <Label htmlFor="s-mindocs">Min documents</Label>
            <Input id="s-mindocs" type="number" min={0} value={minDocs} onChange={(e) => setMinDocs(e.target.value)} placeholder="0" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? "Creating…" : "Create segment"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
