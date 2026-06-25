// A single case row in the portal's Cases list. Links to the case detail page.
// Shows the case's status (custom status chip when set, otherwise the system
// status), readiness progress, and the counts that drive the next action
// (missing required documents, uploads waiting on review).

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { CustomStatusChip } from "@/components/features/portals/custom-status-chip";
import { formatDate } from "@/lib/documents";
import {
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_TONE,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_TONE,
  PORTAL_CASE_TYPE_LABELS,
  caseNextAction,
  progressPercent,
} from "@/lib/portals";
import type { PortalCase } from "@/types/portals";

export function CaseCard({
  orgId,
  portalCase,
}: {
  orgId: number;
  portalCase: PortalCase;
}) {
  const percent = progressPercent(portalCase.progress);
  const missing = portalCase.progress.missing_requirements;
  const review = portalCase.progress.uploads_needing_review;
  const nextAction = caseNextAction(portalCase);
  return (
    <Link
      href={`/dashboard/organizations/${orgId}/portal/cases/${portalCase.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{portalCase.title}</h3>
            {portalCase.custom_status ? (
              <CustomStatusChip status={portalCase.custom_status} />
            ) : (
              <StatusBadge
                tone={PORTAL_CASE_STATUS_TONE[portalCase.status]}
                withDot={false}
              >
                {PORTAL_CASE_STATUS_LABELS[portalCase.status]}
              </StatusBadge>
            )}
            {portalCase.priority !== "normal" && (
              <StatusBadge
                tone={PORTAL_CASE_PRIORITY_TONE[portalCase.priority]}
                withDot={false}
              >
                {PORTAL_CASE_PRIORITY_LABELS[portalCase.priority]}
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{portalCase.person.full_name}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {PORTAL_CASE_TYPE_LABELS[portalCase.case_type]}
            </span>
            {portalCase.due_date && (
              <span>Due {formatDate(portalCase.due_date)}</span>
            )}
          </p>
        </div>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>

      <div className="mt-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Readiness"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{percent}% ready</span>
          {missing > 0 && (
            <span className="text-brand-amber">{missing} missing</span>
          )}
          {review > 0 && (
            <span className="text-brand-amber">{review} to review</span>
          )}
        </p>
      </div>

      {/* The single most useful next step for this case, in plain language. */}
      <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        {nextAction}
      </p>
    </Link>
  );
}
