"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Link2,
  ShieldCheck,
} from "lucide-react";

import { RequirementImportModal } from "@/components/bundles/requirement-import-modal";
import { useFeature } from "@/components/features/feature-flags-provider";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { getPackReadiness, packActionHref } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  PackReadiness,
  RequirementImportApplyResult,
} from "@/types/renewal-workspace";

/**
 * Application Pack Readiness V1 — additive, deterministic readiness detail for a
 * bundle: required-document progress, expiry/validity warnings, share-readiness
 * verdict, and next actions. Fetches the deterministic readiness endpoint (no
 * AI). Renders nothing until loaded so it never disrupts the page.
 *
 * `refreshKey` lets the parent re-fetch after a requirement change.
 */
export function PackReadinessPanel({
  bundleId,
  refreshKey = 0,
}: {
  bundleId: number;
  refreshKey?: number | string;
}) {
  const [data, setData] = useState<PackReadiness | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Founder/beta rollout gate for the whole feature surface; the Pro plan gate
  // is enforced by the backend (the modal surfaces its upgrade copy).
  const importEnabled = useFeature("ai_requirement_import");

  useEffect(() => {
    let active = true;
    getPackReadiness(bundleId)
      .then((r) => {
        if (active) setData(r);
      })
      .catch(() => {
        // Non-fatal: the rest of the bundle page is unaffected.
      });
    return () => {
      active = false;
    };
  }, [bundleId, refreshKey]);

  function handleApplied(applied: RequirementImportApplyResult) {
    // Reflect the freshly-applied requirements without a round-trip.
    setData(applied.pack_readiness);
  }

  const importControls = importEnabled ? (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setImportOpen(true)}
        className="gap-1.5"
      >
        <Link2 className="size-4" aria-hidden /> Import from link
      </Button>
      {importOpen && (
        <RequirementImportModal
          bundleId={bundleId}
          open
          onClose={() => setImportOpen(false)}
          onApplied={handleApplied}
        />
      )}
    </>
  ) : null;

  if (!data) return null;

  if (!data.has_checklist) {
    return (
      <SectionCard title="Pack readiness">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4">
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Add required documents to measure readiness</p>
              <p className="mt-0.5 text-muted-foreground">
                Turn this pack into a readiness checklist to track what&apos;s ready,
                what&apos;s missing, and what to do next.
              </p>
            </div>
          </div>
          {importControls && <div>{importControls}</div>}
        </div>
      </SectionCard>
    );
  }

  const { summary, warnings, next_actions, is_ready_to_share, label } = data;

  return (
    <SectionCard
      title="Pack readiness"
      action={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            is_ready_to_share
              ? "bg-brand-success/10 text-brand-success"
              : "bg-brand-amber/10 text-brand-amber",
          )}
        >
          {is_ready_to_share ? (
            <ShieldCheck className="size-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden />
          )}
          {is_ready_to_share ? "Ready to share" : "Not ready to share yet"}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {summary.satisfied_count} of {summary.required_count} required documents ready
            </span>{" "}
            · {label}
            {summary.missing_count > 0 && ` · ${summary.missing_count} missing`}
          </p>
          {importControls}
        </div>

        {warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Warnings
            </h4>
            {warnings.map((w) => (
              <div
                key={`${w.requirement_id}-${w.type}`}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
                  w.severity === "critical"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-brand-amber/30 bg-brand-amber/5",
                )}
              >
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    w.severity === "critical" ? "text-destructive" : "text-brand-amber",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {next_actions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Next actions
            </h4>
            <ul className="flex flex-col gap-2">
              {next_actions.map((a) => (
                <li key={`${a.type}-${a.requirement_id ?? a.document_id ?? "x"}`}>
                  <Link
                    href={packActionHref(a)}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.description}
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {is_ready_to_share && warnings.length === 0 && next_actions.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-brand-success/30 bg-brand-success/5 px-3.5 py-3 text-sm text-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-brand-success" aria-hidden />
            All required documents are ready. This pack is ready to share.
          </div>
        )}
      </div>
    </SectionCard>
  );
}
