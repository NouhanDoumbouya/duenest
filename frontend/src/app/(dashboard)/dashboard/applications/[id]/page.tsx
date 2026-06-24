"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { GenerateDocumentModal } from "@/components/documents/generate-document-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { getSmartProfileCompleteness } from "@/lib/smart-profile";
import type { SmartProfileCompleteness } from "@/types/smart-profile";
import {
  APPLICATION_TYPE_LABELS,
  applicationStatusTone,
  archiveApplication,
  deadlineStateLabel,
  deadlineStateTone,
  getApplication,
  updateApplication,
} from "@/lib/applications";
import { formatDate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type {
  ApplicationStatus,
  TrackedApplication,
} from "@/types/applications";

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "planning",
  "checklist_created",
  "documents_missing",
  "ready_to_submit",
  "submitted",
  "under_review",
  "interview",
  "accepted",
  "rejected",
  "withdrawn",
  "renewal_needed",
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  planning: "Planning",
  checklist_created: "Checklist created",
  documents_missing: "Documents missing",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  under_review: "Under review",
  interview: "Interview",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  renewal_needed: "Renewal needed",
};

/** A single dated row in the lightweight timeline. */
function TimelineRow({ label, date }: { label: string; date: string }) {
  return (
    <li className="relative pl-5">
      <span
        aria-hidden
        className="absolute left-0 top-1.5 size-2 rounded-full bg-primary/60"
      />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
    </li>
  );
}

/**
 * Additive nudge: shows how complete the user's reusable Smart Profile is, with
 * a link to finish it. Gated by the `smart_profile` feature and never blocks
 * application tracking — it stays hidden until the data loads.
 */
function SmartProfileNudge() {
  const enabled = useFeature("smart_profile");
  const [data, setData] = useState<SmartProfileCompleteness | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getSmartProfileCompleteness()
      .then((res) => active && setData(res))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled || data === null) return null;

  const score = Math.max(0, Math.min(100, data.score));
  const topAction = data.next_actions[0];

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <p className="text-sm font-medium">Smart Profile</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Your Smart Profile is {score}% complete.
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Smart Profile completeness"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
        {topAction && (
          <p className="text-xs text-muted-foreground">{topAction.label}</p>
        )}
        <Link
          href="/dashboard/profile"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
        >
          Complete profile
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const appId = Number(params.id);
  const validId = Number.isFinite(appId);

  const [app, setApp] = useState<TrackedApplication | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid application.",
  );
  const [error, setError] = useState<string | null>(null);

  const [savingStatus, setSavingStatus] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Founder/beta rollout gate; the Pro plan gate is enforced by the backend
  // (the modal surfaces its upgrade copy).
  const generateEnabled = useFeature("application_document_generation");

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getApplication(appId)
      .then((result) => {
        if (!active) return;
        setApp(result);
        setNotes(result.notes);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This application could not be found."
            : "Unable to load this application.",
        );
      });
    return () => {
      active = false;
    };
  }, [appId, validId]);

  async function patch(
    payload: Parameters<typeof updateApplication>[1],
    setBusy: (v: boolean) => void,
  ) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateApplication(appId, payload);
      setApp(updated);
      setNotes(updated.notes);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save the change.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveApplication(appId);
      router.push("/dashboard/applications");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive.");
      setArchiving(false);
      setConfirmArchive(false);
    }
  }

  if (loadError) {
    return (
      <PageContainer width="narrow" className="space-y-4">
        <Link
          href="/dashboard/applications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to applications
        </Link>
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (app === null) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <span className="sr-only" role="status">
          Loading application…
        </span>
        <Skeleton className="h-4 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    );
  }

  const showSuggestion = app.suggested_status !== app.status;

  return (
    <PageContainer width="wide">
      <Link
        href="/dashboard/applications"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to applications
      </Link>

      <PageHeader
        eyebrow={APPLICATION_TYPE_LABELS[app.type]}
        title={app.title}
        description={app.organization_name ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={applicationStatusTone(app.status)}>
          {app.status_label}
        </StatusBadge>
        {app.deadline_state !== "no_deadline" && (
          <StatusBadge tone={deadlineStateTone(app.deadline_state)}>
            {deadlineStateLabel(app.deadline_state, app.days_until_deadline)}
          </StatusBadge>
        )}
        {app.priority === "high" && (
          <StatusBadge tone="warning">High priority</StatusBadge>
        )}
        {app.source_url && (
          <Link
            href={app.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            Source
          </Link>
        )}
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-6">
          {app.linked_pack ? (
            <SectionCard
              title="Application pack"
              description="Readiness for the documents this application needs."
              action={
                <Link
                  href={`/dashboard/bundles/${app.linked_pack.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Open pack
                </Link>
              }
            >
              <div className="flex items-center gap-4">
                <ReadinessRing score={app.linked_pack.readiness_score} size={72} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {app.linked_pack.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {app.linked_pack.missing_count} missing ·{" "}
                    {app.linked_pack.warning_count} to review
                  </p>
                  {app.linked_pack.is_ready_to_share && (
                    <StatusBadge tone="success" className="mt-2">
                      Ready to share
                    </StatusBadge>
                  )}
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              title="Link an application pack"
              description="Group the documents this application needs and track their readiness."
              action={
                <Link
                  href="/dashboard/bundles"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Package className="size-4" />
                  Browse packs
                </Link>
              }
            >
              <p className="text-sm text-muted-foreground">
                This application isn&apos;t linked to a pack yet. Linking a pack
                shows exactly which documents are still missing.
              </p>
            </SectionCard>
          )}

          {generateEnabled && (
            <SectionCard
              title="AI document generator"
              description="Draft a professional letter or CV from your Smart Profile and this application's context."
              action={
                <Button
                  size="sm"
                  onClick={() => setGenerateOpen(true)}
                >
                  <Wand2 className="size-4" />
                  Generate document
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                Review before saving. You stay in control — nothing is exported
                or saved to a pack until you confirm.
              </p>
            </SectionCard>
          )}

          <SectionCard
            title="Next actions"
            description="Deterministic steps based on this application's state."
          >
            {app.next_actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing needs your attention right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {app.next_actions.map((action, i) => {
                  const body = (
                    <>
                      <p className="text-sm font-medium">{action.label}</p>
                      {action.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {action.description}
                        </p>
                      )}
                    </>
                  );
                  return (
                    <li
                      key={`${action.type}-${i}`}
                      className="rounded-xl border border-border p-3"
                    >
                      {action.bundle_id ? (
                        <Link
                          href={`/dashboard/bundles/${action.bundle_id}`}
                          className="block transition-colors hover:opacity-80"
                        >
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Timeline"
            description="Key dates for this application."
          >
            <ol className="space-y-4 border-l border-border pl-1">
              <TimelineRow label="Created" date={app.created_at} />
              {app.linked_pack && (
                <li className="relative pl-5">
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 size-2 rounded-full bg-primary/60"
                  />
                  <p className="text-sm font-medium">Linked pack</p>
                  <p className="text-xs text-muted-foreground">
                    {app.linked_pack.name}
                  </p>
                </li>
              )}
              {app.deadline_date && (
                <TimelineRow label="Deadline" date={app.deadline_date} />
              )}
              {app.submitted_at && (
                <TimelineRow label="Submitted" date={app.submitted_at} />
              )}
              {app.decision_date && (
                <TimelineRow label="Decision" date={app.decision_date} />
              )}
            </ol>
          </SectionCard>

          <SectionCard
            title="Notes"
            description="Private notes for this application."
            action={
              <Button
                size="sm"
                onClick={() => patch({ notes }, setSavingNotes)}
                disabled={savingNotes || notes === app.notes}
              >
                {savingNotes && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            }
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes, contacts, or anything to remember…"
              rows={4}
            />
          </SectionCard>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="app-status" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="app-status"
                  value={app.status}
                  onChange={(e) =>
                    patch(
                      { status: e.target.value as ApplicationStatus },
                      setSavingStatus,
                    )
                  }
                  disabled={savingStatus}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {APPLICATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {showSuggestion && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      Suggested: {app.suggested_status_label}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        patch(
                          { status: app.suggested_status },
                          setSavingStatus,
                        )
                      }
                      disabled={savingStatus}
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline_date">Deadline</Label>
                <Input
                  id="deadline_date"
                  type="date"
                  value={app.deadline_date ?? ""}
                  disabled={savingDates}
                  onChange={(e) =>
                    patch(
                      { deadline_date: e.target.value || null },
                      setSavingDates,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="submitted_at">Submitted</Label>
                <Input
                  id="submitted_at"
                  type="date"
                  value={app.submitted_at ?? ""}
                  disabled={savingDates}
                  onChange={(e) =>
                    patch(
                      { submitted_at: e.target.value || null },
                      setSavingDates,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="decision_date">Decision</Label>
                <Input
                  id="decision_date"
                  type="date"
                  value={app.decision_date ?? ""}
                  disabled={savingDates}
                  onChange={(e) =>
                    patch(
                      { decision_date: e.target.value || null },
                      setSavingDates,
                    )
                  }
                />
              </div>

              {app.deadline_state === "completed" && (
                <p className="flex items-center gap-1.5 rounded-lg border border-brand-success/25 bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
                  <CheckCircle2 className="size-4" />
                  This application is complete.
                </p>
              )}
            </CardContent>
          </Card>

          <SmartProfileNudge />

          <TrustNotice icon={ShieldCheck} title="Private to you">
            Applications and their notes stay private to the owner. Linked packs
            still follow their own sharing rules.
          </TrustNotice>

          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmArchive(true)}
          >
            <Trash2 className="size-4" />
            Archive application
          </Button>
        </aside>
      </div>

      {generateEnabled && generateOpen && (
        <GenerateDocumentModal
          open
          onClose={() => setGenerateOpen(false)}
          applicationId={app.id}
          bundleId={app.linked_pack?.id}
          defaultTargetOrganization={app.organization_name ?? undefined}
          onSaved={() => {
            // Refresh so a newly saved pack document reflects in readiness.
            getApplication(appId)
              .then((fresh) => setApp(fresh))
              .catch(() => {
                /* non-fatal: the export already succeeded */
              });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive application?"
        description={`"${app.title}" will be moved to your archived list. You can still find it under the Archived filter.`}
        confirmLabel="Archive"
        loading={archiving}
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </PageContainer>
  );
}
