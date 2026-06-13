"use client";

import { useEffect, useState } from "react";
import { MailCheck, Search, Send, UserRoundCheck, XCircle } from "lucide-react";

import {
  FounderBarList,
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
  createInviteForWaitlistEntry,
  getFounderWaitlist,
  getPrivateBetaMetrics,
  updateFounderWaitlistEntry,
} from "@/lib/founder";
import { cn } from "@/lib/utils";
import type {
  FounderWaitlistEntry,
  Paginated,
  PrivateBetaMetrics,
} from "@/types/founder";
import type { WaitlistPersona, WaitlistStatus } from "@/types/private-beta";

const nf = new Intl.NumberFormat();

const personaOptions: { value: WaitlistPersona | ""; label: string }[] = [
  { value: "", label: "All personas" },
  { value: "international_student", label: "International student" },
  { value: "visa_holder", label: "Visa holder" },
  { value: "scholarship_applicant", label: "Scholarship applicant" },
  { value: "freelancer", label: "Freelancer" },
  { value: "family_documents", label: "Family documents" },
  { value: "traveler", label: "Traveler" },
  { value: "student_leader", label: "Student leader" },
  { value: "other", label: "Other" },
];

const statusOptions: { value: WaitlistStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "invited", label: "Invited" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

function statusBadge(status: WaitlistStatus) {
  if (status === "accepted") return "bg-brand-success/10 text-brand-success";
  if (status === "invited") return "bg-primary/10 text-primary";
  if (status === "rejected") return "bg-destructive/10 text-destructive";
  return "bg-brand-amber/15 text-brand-amber";
}

function inviteLink(code: string) {
  if (typeof window === "undefined") return `/invite/${encodeURIComponent(code)}`;
  return `${window.location.origin}/invite/${encodeURIComponent(code)}`;
}

function WaitlistRow({
  entry,
  onChanged,
}: {
  entry: FounderWaitlistEntry;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<WaitlistStatus>(entry.status);
  const [notes, setNotes] = useState(entry.founder_notes);
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState("");

  async function saveEntry(nextStatus = status) {
    setSaving(true);
    try {
      await updateFounderWaitlistEntry(entry.id, {
        status: nextStatus,
        founder_notes: notes,
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function createInvite() {
    setSaving(true);
    setCopyState("");
    try {
      const invite = await createInviteForWaitlistEntry(entry.id, {
        max_uses: 1,
        notes: notes || undefined,
      });
      const link = inviteLink(invite.code);
      await navigator.clipboard?.writeText(link);
      setCopyState("Invite link copied");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function copyExisting() {
    if (!entry.invite_code_value) return;
    await navigator.clipboard?.writeText(inviteLink(entry.invite_code_value));
    setCopyState("Invite link copied");
  }

  return (
    <div className="grid gap-4 border-t border-border px-4 py-5 lg:grid-cols-[1.2fr_0.85fr_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{entry.full_name}</p>
          <Badge className={cn("capitalize", statusBadge(entry.status))}>
            {entry.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{entry.email}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {entry.message || "No message provided."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">
            {entry.persona.replaceAll("_", " ")}
          </span>
          {entry.country && (
            <span className="rounded-full bg-muted px-2 py-1">{entry.country}</span>
          )}
          {entry.referral_source && (
            <span className="rounded-full bg-muted px-2 py-1">
              {entry.referral_source}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`status-${entry.id}`}>Status</Label>
          <select
            id={`status-${entry.id}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => {
              const next = event.target.value as WaitlistStatus;
              setStatus(next);
              void saveEntry(next);
            }}
            disabled={saving}
          >
            {statusOptions.slice(1).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`notes-${entry.id}`}>Founder notes</Label>
          <Textarea
            id={`notes-${entry.id}`}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => void saveEntry()}
            placeholder="Fit, outreach context, concerns..."
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">Invite</p>
          <p className="mt-1 font-mono text-sm">
            {entry.invite_code_value || "No invite created"}
          </p>
          {copyState && (
            <p className="mt-2 text-xs text-brand-success">{copyState}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {entry.invite_code_value ? (
            <Button variant="outline" onClick={copyExisting} disabled={saving}>
              Copy link
            </Button>
          ) : (
            <Button onClick={createInvite} disabled={saving || entry.status === "rejected"}>
              <Send className="size-4" />
              Create invite
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              setStatus("rejected");
              void saveEntry("rejected");
            }}
            disabled={saving || entry.status === "rejected"}
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FounderWaitlistPage() {
  const [metrics, setMetrics] = useState<PrivateBetaMetrics | null>(null);
  const [data, setData] = useState<Paginated<FounderWaitlistEntry> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WaitlistStatus | "">("");
  const [persona, setPersona] = useState<WaitlistPersona | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [metricResult, waitlistResult] = await Promise.all([
        getPrivateBetaMetrics(),
        getFounderWaitlist({ search, status, persona }),
      ]);
      setMetrics(metricResult);
      setData(waitlistResult);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load waitlist entries.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([getPrivateBetaMetrics(), getFounderWaitlist()])
      .then(([metricResult, waitlistResult]) => {
        if (!active) return;
        setMetrics(metricResult);
        setData(waitlistResult);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load waitlist entries.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Private beta"
        title="Waitlist"
        description="Review private beta requests, keep notes, and convert strong-fit applicants into invite-code recipients."
      />

      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FounderStatCard
              label="Waitlist"
              value={metrics.total_waitlist_entries}
              hint={`${nf.format(metrics.pending_waitlist_entries)} pending review`}
              icon={MailCheck}
            />
            <FounderStatCard
              label="Invited"
              value={metrics.invited_waitlist_entries}
              hint="Applicants with an issued invite"
              icon={Send}
            />
            <FounderStatCard
              label="Accepted"
              value={metrics.accepted_waitlist_entries}
              hint={`${metrics.invite_conversion_percent}% invited-to-registered`}
              icon={UserRoundCheck}
              tone="good"
            />
            <FounderStatCard
              label="Rejected"
              value={metrics.rejected_waitlist_entries}
              hint="Not a fit for the current cohort"
              icon={XCircle}
              tone="warn"
            />
          </div>
          <FounderBarList
            title="Persona mix"
            description="Private beta demand grouped by self-selected use case."
            items={metrics.waitlist_by_persona}
          />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, message"
                className="pl-9"
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as WaitlistStatus | "")}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={persona}
              onChange={(event) => setPersona(event.target.value as WaitlistPersona | "")}
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
        </CardContent>

        {loading ? (
          <div className="border-t border-border px-4 py-10 text-sm text-muted-foreground">
            Loading waitlist entries...
          </div>
        ) : data && data.results.length > 0 ? (
          <div>
            {data.results.map((entry) => (
              <WaitlistRow key={entry.id} entry={entry} onChanged={() => void load()} />
            ))}
          </div>
        ) : (
          <div className="border-t border-border px-4 py-10 text-sm text-muted-foreground">
            No waitlist entries match the current filters.
          </div>
        )}
      </Card>
    </div>
  );
}
