"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Mail, MessageSquare, Save, ShieldCheck } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { getFounderFeedback, updateFounderFeedback } from "@/lib/founder";
import { cn } from "@/lib/utils";
import type {
  FeedbackCategory,
  FeedbackItem,
  FeedbackPriority,
  FeedbackStatus,
} from "@/types/founder";

const statuses: FeedbackStatus[] = [
  "new",
  "reviewed",
  "planned",
  "in_progress",
  "shipped",
  "rejected",
  "closed",
];
const priorities: FeedbackPriority[] = ["low", "medium", "high", "urgent"];
const categories: FeedbackCategory[] = [
  "bug",
  "feature_request",
  "confusion",
  "complaint",
  "praise",
  "security_concern",
  "pricing",
  "other",
];

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function FounderFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<FeedbackPriority | "">("");
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | "">("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({
    status: "new" as FeedbackStatus,
    priority: "medium" as FeedbackPriority,
    founder_notes: "",
    founder_response: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderFeedback({
      status: statusFilter,
      priority: priorityFilter,
      category: categoryFilter,
      search,
    })
      .then((page) => {
        if (!active) return;
        const nextSelectedId = selectedId ?? page.results[0]?.id ?? null;
        const nextSelected =
          page.results.find((item) => item.id === nextSelectedId) ?? null;
        setItems(page.results);
        setSelectedId(nextSelectedId);
        if (nextSelected) {
          setDraft({
            status: nextSelected.status,
            priority: nextSelected.priority,
            founder_notes: nextSelected.founder_notes,
            founder_response: nextSelected.founder_response,
          });
        }
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load feedback.",
        );
      });
    return () => {
      active = false;
    };
  }, [categoryFilter, priorityFilter, search, selectedId, statusFilter]);

  const selected = useMemo(
    () => (items ?? []).find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const needsDecision = useMemo(
    () => (items ?? []).filter((item) => item.status === "new").length,
    [items],
  );

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFounderFeedback(selected.id, draft);
      setItems((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
      setDraft({
        status: updated.status,
        priority: updated.priority,
        founder_notes: updated.founder_notes,
        founder_response: updated.founder_response,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to update feedback.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <FounderPageHeader
        eyebrow="Product discovery"
        title="Feedback board"
        description="Review beta feedback, prioritize what to act on, and keep founder notes — so you always know what to do next."
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
          <Inbox className="size-4 text-primary" />
          <span className="font-medium">{needsDecision}</span>
          <span className="text-muted-foreground">
            {needsDecision === 1 ? "item needs a decision" : "items need a decision"}
          </span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-brand-success" />
          Keep notes safe — never paste private document contents here.
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title"
          />
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as FeedbackCategory | "")
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as FeedbackStatus | "")
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as FeedbackPriority | "")
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All priorities</option>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="size-5 text-primary" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items === null ? (
              <div className="h-[320px] animate-pulse rounded-lg bg-muted" />
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No feedback matches these filters.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setDraft({
                          status: item.status,
                          priority: item.priority,
                          founder_notes: item.founder_notes,
                          founder_response: item.founder_response,
                        });
                      }}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        selectedId === item.id
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge
                          variant={
                            item.priority === "urgent" ? "destructive" : "outline"
                          }
                        >
                          {item.urgency}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.message}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{label(item.status)}</Badge>
                        <Badge variant="outline">{label(item.category)}</Badge>
                        {item.responded_at && (
                          <Badge variant="outline">responded</Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a feedback item to review it.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {selected.related_feature || "General feedback"}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{selected.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {selected.message}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">Urgency: {label(selected.urgency)}</Badge>
                    <Badge variant="outline">
                      Contact: {label(selected.contact_preference)}
                    </Badge>
                    {(selected.email || selected.user_email) && (
                      <a
                        href={`mailto:${selected.email || selected.user_email}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        <Mail className="size-3.5" />
                        Email
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <Label>Status</Label>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: event.target.value as FeedbackStatus,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {statuses.map((item) => (
                        <option key={item} value={item}>
                          {label(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <Label>Priority</Label>
                    <select
                      value={draft.priority}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          priority: event.target.value as FeedbackPriority,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {priorities.map((item) => (
                        <option key={item} value={item}>
                          {label(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="space-y-1">
                  <Label>Founder notes</Label>
                  <Textarea
                    value={draft.founder_notes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        founder_notes: event.target.value,
                      }))
                    }
                    rows={6}
                    placeholder="Internal product notes, next action, or beta follow-up."
                  />
                </label>

                <label className="space-y-1">
                  <Label>Founder response</Label>
                  <Textarea
                    value={draft.founder_response}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        founder_response: event.target.value,
                      }))
                    }
                    rows={5}
                    placeholder="User-visible response or follow-up summary."
                  />
                  {selected.responded_at && (
                    <span className="block text-xs text-muted-foreground">
                      Last response saved{" "}
                      {new Date(selected.responded_at).toLocaleDateString()}
                    </span>
                  )}
                </label>

                <Button onClick={saveSelected} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save feedback
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
