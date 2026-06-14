"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Search, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { getBetaUsers, updateBetaUser } from "@/lib/founder";
import type {
  BetaInviteStatus,
  BetaPersona,
  BetaUserProfile,
} from "@/types/founder";

const inviteStatuses: BetaInviteStatus[] = [
  "not_invited",
  "invited",
  "accepted",
  "active",
  "paused",
  "churned",
];
const personas: BetaPersona[] = [
  "international_student",
  "visa_holder",
  "scholarship_applicant",
  "freelancer",
  "family_user",
  "student_leader",
  "traveler",
  "other",
];

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function FounderBetaPage() {
  const [items, setItems] = useState<BetaUserProfile[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, BetaUserProfile>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BetaInviteStatus | "">("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBetaUsers({ search, invite_status: statusFilter })
      .then((page) => {
        if (!active) return;
        setItems(page.results);
        setDrafts(Object.fromEntries(page.results.map((item) => [item.id, item])));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load beta users.",
        );
      });
    return () => {
      active = false;
    };
  }, [search, statusFilter]);

  function updateDraft(id: number, patch: Partial<BetaUserProfile>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  async function save(item: BetaUserProfile) {
    const draft = drafts[item.id];
    setSavingId(item.id);
    setError(null);
    try {
      const updated = await updateBetaUser(item.id, {
        invite_status: draft.invite_status,
        persona: draft.persona,
        tags: draft.tags,
        notes: draft.notes,
      });
      setItems((current) =>
        (current ?? []).map((row) => (row.id === updated.id ? updated : row)),
      );
      setDrafts((current) => ({ ...current, [updated.id]: updated }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save beta user.");
    } finally {
      setSavingId(null);
    }
  }

  const activeCount =
    items?.filter((item) => ["accepted", "active"].includes(item.invite_status))
      .length ?? 0;

  // A "strong" beta user is active and has engaged meaningfully — a good
  // candidate for an interview or a deeper testing relationship.
  const isStrong = (item: BetaUserProfile) =>
    ["accepted", "active"].includes(item.invite_status) &&
    item.document_count >= 1 &&
    (item.reminder_count >= 1 || item.feedback_count >= 1);
  const strongCount = items?.filter(isStrong).length ?? 0;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Private beta"
        title="Beta Users"
        description="Track beta personas, invite status, activation, usage summaries, and founder notes without exposing private document contents."
      />

      <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-brand-success" />
        Usage counts only — private document contents are never shown here.
      </span>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <FounderStatCard
          icon={UserRoundCheck}
          label="Visible beta profiles"
          value={items?.length ?? 0}
          hint="Current filtered user set"
        />
        <FounderStatCard
          icon={UserRoundCheck}
          label="Accepted or active"
          value={activeCount}
          hint="Users past invitation"
          tone="good"
        />
        <FounderStatCard
          icon={Sparkles}
          label="Strong profiles"
          value={strongCount}
          hint="Active with real engagement"
          tone={strongCount > 0 ? "good" : "default"}
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or username"
              className="pl-9"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as BetaInviteStatus | "")
            }
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">All invite statuses</option>
            {inviteStatuses.map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {items === null ? (
        <Card className="h-[420px] animate-pulse" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No beta users match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const draft = drafts[item.id] ?? item;
            return (
              <Card key={item.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-heading text-lg font-semibold">
                          {item.user_email}
                        </h2>
                        <Badge variant="outline">{label(draft.invite_status)}</Badge>
                        <Badge variant="secondary">{label(draft.persona)}</Badge>
                        {isStrong(item) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-medium text-brand-success">
                            <Sparkles className="size-3" />
                            Strong
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.document_count} docs · {item.file_count} files ·{" "}
                        {item.reminder_count} reminders · {item.feedback_count} feedback
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

                  <div className="grid gap-3 md:grid-cols-3">
                    <select
                      value={draft.invite_status}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          invite_status: event.target.value as BetaInviteStatus,
                        })
                      }
                      className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                    >
                      {inviteStatuses.map((status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.persona}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          persona: event.target.value as BetaPersona,
                        })
                      }
                      className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                    >
                      {personas.map((persona) => (
                        <option key={persona} value={persona}>
                          {label(persona)}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={draft.tags.join(", ")}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Tags, comma-separated"
                    />
                  </div>

                  <Textarea
                    value={draft.notes}
                    onChange={(event) =>
                      updateDraft(item.id, { notes: event.target.value })
                    }
                    placeholder="Founder notes. Do not copy private document contents here."
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
