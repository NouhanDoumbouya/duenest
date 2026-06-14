"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Search, TicketCheck, Timer, UserRoundCheck, XCircle } from "lucide-react";

import {
  FounderPageHeader,
  FounderStatCard,
} from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createFounderInvite,
  disableFounderInvite,
  getFounderInvites,
  getPrivateBetaMetrics,
} from "@/lib/founder";
import { cn } from "@/lib/utils";
import type {
  FounderInviteCode,
  InviteCodeStatus,
  Paginated,
  PrivateBetaMetrics,
} from "@/types/founder";
import type { WaitlistPersona } from "@/types/private-beta";

const nf = new Intl.NumberFormat();

const personaOptions: { value: WaitlistPersona | ""; label: string }[] = [
  { value: "", label: "Any persona" },
  { value: "international_student", label: "International student" },
  { value: "visa_holder", label: "Visa holder" },
  { value: "scholarship_applicant", label: "Scholarship applicant" },
  { value: "freelancer", label: "Freelancer" },
  { value: "family_documents", label: "Family documents" },
  { value: "traveler", label: "Traveler" },
  { value: "student_leader", label: "Student leader" },
  { value: "other", label: "Other" },
];

function statusClass(status: InviteCodeStatus) {
  if (status === "active") return "bg-brand-success/10 text-brand-success";
  if (status === "used_up") return "bg-primary/10 text-primary";
  if (status === "expired") return "bg-brand-amber/15 text-brand-amber";
  return "bg-destructive/10 text-destructive";
}

function inviteLink(code: string) {
  if (typeof window === "undefined") return `/invite/${encodeURIComponent(code)}`;
  return `${window.location.origin}/invite/${encodeURIComponent(code)}`;
}

function formatDate(value: string | null) {
  if (!value) return "No expiry";
  return new Date(value).toLocaleDateString();
}

export default function FounderInvitesPage() {
  const [metrics, setMetrics] = useState<PrivateBetaMetrics | null>(null);
  const [data, setData] = useState<Paginated<FounderInviteCode> | null>(null);
  const [search, setSearch] = useState("");
  const [filterPersona, setFilterPersona] = useState<WaitlistPersona | "">("");
  const [createPersona, setCreatePersona] = useState<WaitlistPersona | "">("");
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [metricResult, inviteResult] = await Promise.all([
        getPrivateBetaMetrics(),
        getFounderInvites({ search, persona_target: filterPersona }),
      ]);
      setMetrics(metricResult);
      setData(inviteResult);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to load invite codes.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([getPrivateBetaMetrics(), getFounderInvites()])
      .then(([metricResult, inviteResult]) => {
        if (!active) return;
        setMetrics(metricResult);
        setData(inviteResult);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load invite codes.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const invite = await createFounderInvite({
        label,
        custom_code: customCode || undefined,
        max_uses: maxUses,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        persona_target: createPersona,
        notes,
      });
      await navigator.clipboard?.writeText(inviteLink(invite.code));
      setCopyState(`Copied ${invite.code}`);
      window.setTimeout(() => setCopyState(""), 2200);
      setLabel("");
      setCustomCode("");
      setMaxUses(1);
      setExpiresAt("");
      setCreatePersona("");
      setNotes("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to create invite code.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyInvite(invite: FounderInviteCode) {
    await navigator.clipboard?.writeText(inviteLink(invite.code));
    setCopyState(`Copied ${invite.code}`);
  }

  async function disableInvite(invite: FounderInviteCode) {
    await disableFounderInvite(invite.id);
    await load();
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Private beta"
        title="Invite codes"
        description="Create controlled beta access, monitor usage, and disable codes when a cohort is full or an invite should no longer work."
      />

      {metrics && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FounderStatCard
            label="Active codes"
            value={metrics.active_invite_codes}
            hint="Usable and not expired"
            icon={TicketCheck}
            tone="good"
          />
          <FounderStatCard
            label="Used codes"
            value={metrics.used_invite_codes}
            hint={`${nf.format(metrics.total_invite_uses)} total invite uses`}
            icon={UserRoundCheck}
          />
          <FounderStatCard
            label="Expired"
            value={metrics.expired_invite_codes}
            hint="Past expiry date"
            icon={Timer}
            tone="warn"
          />
          <FounderStatCard
            label="Disabled"
            value={metrics.disabled_invite_codes}
            hint="Manually turned off"
            icon={XCircle}
            tone="danger"
          />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create invite</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  required
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="June scholarship cohort"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="custom_code">Custom code</Label>
                  <Input
                    id="custom_code"
                    value={customCode}
                    onChange={(event) => setCustomCode(event.target.value)}
                    placeholder="Optional"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_uses">Max uses</Label>
                  <Input
                    id="max_uses"
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(event) => setMaxUses(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="persona_target">Persona target</Label>
                  <select
                    id="persona_target"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createPersona}
                    onChange={(event) =>
                      setCreatePersona(event.target.value as WaitlistPersona | "")
                    }
                  >
                    {personaOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires_at">Expires at</Label>
                  <Input
                    id="expires_at"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Who this is for, where it was shared, cohort context..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                <Plus className="size-4" />
                {creating ? "Creating..." : "Create and copy link"}
              </Button>
              {copyState && (
                <p className="text-sm text-brand-success">{copyState}</p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search code, label, notes"
                  className="pl-9"
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filterPersona}
                onChange={(event) =>
                  setFilterPersona(event.target.value as WaitlistPersona | "")
                }
              >
                {personaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button onClick={() => void load()} disabled={loading}>
                Apply
              </Button>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="overflow-hidden rounded-lg border border-border">
              {loading ? (
                <div className="px-4 py-10 text-sm text-muted-foreground">
                  Loading invite codes...
                </div>
              ) : data && data.results.length > 0 ? (
                <div className="divide-y divide-border">
                  {data.results.map((invite) => (
                    <div
                      key={invite.id}
                      className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_0.8fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-semibold">
                            {invite.code}
                          </p>
                          <Badge className={cn("capitalize", statusClass(invite.status_label))}>
                            {invite.status_label.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 font-medium">{invite.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {invite.notes || "No notes."}
                        </p>
                      </div>
                      <div className="grid gap-1 text-sm text-muted-foreground">
                        <span>
                          Uses: {nf.format(invite.used_count)} / {nf.format(invite.max_uses)}
                        </span>
                        <span>Remaining: {nf.format(invite.remaining_uses)}</span>
                        <span>Expiry: {formatDate(invite.expires_at)}</span>
                        {invite.persona_target && (
                          <span>
                            Persona: {invite.persona_target.replaceAll("_", " ")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                        <Button variant="outline" onClick={() => void copyInvite(invite)}>
                          <Copy className="size-4" />
                          Copy
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => void disableInvite(invite)}
                          disabled={!invite.is_active}
                        >
                          Disable
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-sm text-muted-foreground">
                  No invite codes match the current filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
