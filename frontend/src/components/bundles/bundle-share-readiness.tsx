"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getBundleShareReadiness } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  ReadinessFinding,
  ShareReadinessReport,
} from "@/types/renewal-workspace";

const SEVERITY = {
  blocker: { icon: XCircle, cls: "text-destructive" },
  warning: { icon: AlertTriangle, cls: "text-amber-600" },
  suggestion: { icon: Sparkles, cls: "text-primary" },
} as const;

const OVERALL = {
  ready: {
    label: "Ready to send",
    cls: "bg-brand-success/10 text-brand-success",
    icon: CheckCircle2,
  },
  issues: {
    label: "Needs attention",
    cls: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
  },
  blocked: { label: "Not ready", cls: "bg-destructive/10 text-destructive", icon: XCircle },
} as const;

/**
 * "Is this pack ready to send?" — runs the readiness check (deterministic facts,
 * plus a Claude review when AI is enabled). Assistive: the report is clearly
 * labelled and the user reviews before sharing.
 */
export function BundleShareReadiness({ bundleId }: { bundleId: number }) {
  const [report, setReport] = useState<ShareReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setReport(await getBundleShareReadiness(bundleId));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't check readiness.",
      );
    } finally {
      setLoading(false);
    }
  }

  const overall = report ? OVERALL[report.overall] : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-medium">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Readiness check
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            See what a reviewer might query before you share this pack.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          Check readiness
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {report && overall && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                overall.cls,
              )}
            >
              <overall.icon className="size-3.5" aria-hidden />
              {overall.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {report.ai ? "AI-assisted review" : "From your checklist"}
            </span>
          </div>

          {report.summary && (
            <p className="text-sm text-muted-foreground">{report.summary}</p>
          )}

          {report.findings.length > 0 ? (
            <ul className="space-y-2">
              {report.findings.map((finding, index) => (
                <Finding key={index} finding={finding} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing flagged.</p>
          )}

          {report.ai && (
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              AI-assisted — it can miss or over-flag things. Double-check against
              the receiving institution&apos;s requirements before submitting.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Finding({ finding }: { finding: ReadinessFinding }) {
  const sev = SEVERITY[finding.severity];
  return (
    <li className="rounded-lg border border-border p-2.5">
      <div className="flex items-start gap-2">
        <sev.icon className={cn("mt-0.5 size-4 shrink-0", sev.cls)} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{finding.title}</p>
          {finding.detail && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {finding.detail}
            </p>
          )}
          {finding.fix && (
            <p className="mt-1 flex items-start gap-1 text-xs text-primary">
              <Wrench className="mt-0.5 size-3 shrink-0" aria-hidden />
              {finding.fix}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
