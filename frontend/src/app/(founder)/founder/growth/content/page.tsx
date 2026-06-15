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
  createContentItem,
  listContentItems,
  updateContentItem,
  type ContentItem,
} from "@/lib/founder-growth";

const STATUSES: ContentItem["status"][] = [
  "idea", "draft", "scheduled", "published", "measuring", "repurpose", "archived",
];

export default function ContentCalendarPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listContentItems()
      .then((d) => active && setItems(d.results))
      .catch(() => active && setError("Could not load content."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const onStatus = async (id: number, status: ContentItem["status"]) => {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await updateContentItem(id, { status });
    } catch {
      setItems(prev);
    }
  };

  return (
    <div className="space-y-5">
      <GrowthPageHeader title="Content Calendar" subtitle="Plan and measure founder marketing content.">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden="true" /> New content
        </Button>
      </GrowthPageHeader>
      <GrowthTabs />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <ContentForm
          onCreated={(c) => {
            setItems((xs) => [c, ...xs]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyGrowthState title="No content yet" body="Plan your first post and attach a UTM link to measure it." />
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.channel || "—"}{c.content_type ? ` · ${c.content_type}` : ""}
                    {c.scheduled_at ? ` · ${new Date(c.scheduled_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`cs-${c.id}`}>Status</label>
                <select
                  id={`cs-${c.id}`}
                  value={c.status}
                  onChange={(e) => onStatus(c.id, e.target.value as ContentItem["status"])}
                  className="h-8 rounded-md border border-border bg-card px-2 text-xs capitalize"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentForm({ onCreated, onCancel }: { onCreated: (c: ContentItem) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [contentType, setContentType] = useState("");
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
      const created = await createContentItem({ title, channel, content_type: contentType });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create content.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New content</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-title">Title</Label>
          <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="LinkedIn founder story" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-channel">Channel</Label>
            <Input id="c-channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="linkedin" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-type">Content type</Label>
            <Input id="c-type" value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="Founder story" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? "Creating…" : "Create"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
