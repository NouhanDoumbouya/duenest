"use client";

import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyGrowthState, GrowthPageHeader } from "@/components/founder/growth/growth-ui";
import { ApiError } from "@/lib/api";
import {
  createCampaign,
  listCampaigns,
  updateCampaign,
  type Campaign,
} from "@/lib/founder-growth";

const STATUSES: Campaign["status"][] = [
  "draft", "scheduled", "active", "paused", "completed", "archived",
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listCampaigns()
      .then((data) => active && setCampaigns(data.results))
      .catch(() => active && setError("Could not load campaigns."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const onStatusChange = async (id: number, status: Campaign["status"]) => {
    const prev = campaigns;
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await updateCampaign(id, { status });
    } catch {
      setCampaigns(prev);
    }
  };

  return (
    <div className="space-y-6">
      <GrowthPageHeader title="Campaign Tracker" subtitle="Track where signups come from.">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden="true" /> New campaign
        </Button>
      </GrowthPageHeader>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <CampaignForm
          onCreated={(c) => {
            setCampaigns((cs) => [c, ...cs]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyGrowthState
          title="No campaigns yet"
          body="Create your first campaign to track where signups come from."
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({
  campaign,
  onStatusChange,
}: {
  campaign: Campaign;
  onStatusChange: (id: number, s: Campaign["status"]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const m = campaign.metrics;
  const copy = async () => {
    if (!campaign.generated_url) return;
    try {
      await navigator.clipboard.writeText(campaign.generated_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{campaign.name}</p>
            <p className="text-xs text-muted-foreground">
              {campaign.channel || "—"} · {campaign.source || "—"}/{campaign.medium || "—"}
            </p>
          </div>
          <label className="sr-only" htmlFor={`status-${campaign.id}`}>Campaign status</label>
          <select
            id={`status-${campaign.id}`}
            value={campaign.status}
            onChange={(e) => onStatusChange(campaign.id, e.target.value as Campaign["status"])}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Visitors" value={m.visitors} />
          <Metric label="Signups" value={m.signups} />
          <Metric label="Activated" value={m.activated_users} />
          <Metric label="Conv." value={m.conversion_rate == null ? "—" : `${m.conversion_rate}%`} />
        </div>

        {campaign.generated_url && (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-muted/40 px-2 py-1 text-xs">
              {campaign.generated_url}
            </code>
            <Button variant="outline" size="sm" onClick={copy} aria-label="Copy campaign link">
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        {m.signups === 0 && m.visitors === 0 && (
          <p className="text-xs text-muted-foreground">
            No attributed events yet. Share the link above to start tracking.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2 text-center">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function CampaignForm({
  onCreated,
  onCancel,
}: {
  onCreated: (c: Campaign) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    channel: "",
    source: "",
    medium: "",
    landing_url: "https://certanest.com/",
    goal: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Give the campaign a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign(form);
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create campaign.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New campaign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="name" label="Name" value={form.name} onChange={set("name")} placeholder="International students July" />
          <Field id="channel" label="Channel" value={form.channel} onChange={set("channel")} placeholder="facebook" />
          <Field id="source" label="Source" value={form.source} onChange={set("source")} placeholder="facebook" />
          <Field id="medium" label="Medium" value={form.medium} onChange={set("medium")} placeholder="community" />
          <Field id="landing_url" label="Landing URL" value={form.landing_url} onChange={set("landing_url")} placeholder="https://certanest.com/" />
          <Field id="goal" label="Goal" value={form.goal} onChange={set("goal")} placeholder="100 student signups" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">
            {busy ? "Creating…" : "Create campaign"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
