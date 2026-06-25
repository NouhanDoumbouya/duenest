"use client";

// The B2B portal setup guide (Onboarding & Demo Workspaces V1). A deterministic
// checklist derived from the org's real data, the single next best action, and a
// one-click SAFE demo workspace so a beta org can experience the portal without
// real applicants or sensitive files. Hides itself once dismissed or complete.

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrustNotice } from "@/components/ui/product-ui";
import {
  cleanupOrgDemo,
  createOrgDemo,
  dismissOrgOnboarding,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { OrgOnboarding } from "@/types/portals";

export function OrgOnboardingCard({
  orgId,
  onboarding,
  canManage,
  onChanged,
}: {
  orgId: number;
  onboarding: OrgOnboarding;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | "demo" | "cleanup" | "dismiss">(null);

  // Nothing to nudge once it's dismissed or every step is done.
  if (onboarding.dismissed || onboarding.percent >= 100) return null;

  async function run(
    kind: "demo" | "cleanup" | "dismiss",
    fn: () => Promise<unknown>,
  ) {
    setBusy(kind);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold">
            Get your portal set up
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {onboarding.completed_count} of {onboarding.total_count} done.
            {onboarding.next_action
              ? ` Next: ${onboarding.next_action.title.toLowerCase()}.`
              : ""}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => run("dismiss", () => dismissOrgOnboarding(orgId))}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" aria-hidden /> Dismiss
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="mt-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={onboarding.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${onboarding.percent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {onboarding.steps.map((step) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          return (
            <li key={step.key} className="flex items-start gap-2.5">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  step.done ? "text-brand-success" : "text-muted-foreground/50",
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Demo workspace */}
      {canManage && (
        <div className="mt-4 flex flex-col gap-2">
          {onboarding.has_demo ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-brand-success">
                <CheckCircle2 className="size-4" aria-hidden /> Demo workspace
                active
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => run("cleanup", () => cleanupOrgDemo(orgId))}
                disabled={busy !== null}
                className="text-muted-foreground"
              >
                {busy === "cleanup" && <Loader2 className="size-4 animate-spin" />}
                Remove demo data
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => run("demo", () => createOrgDemo(orgId))}
              disabled={busy !== null}
              className="w-fit"
            >
              {busy === "demo" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Try a demo workspace
            </Button>
          )}
          <TrustNotice icon={Sparkles} title="Safe sample data" tone="default">
            The demo creates a clearly-labeled sample template, applicant, case,
            and folders so you can explore the workflow. It sends no email,
            creates no real files, and can be removed anytime.
          </TrustNotice>
        </div>
      )}
    </section>
  );
}
