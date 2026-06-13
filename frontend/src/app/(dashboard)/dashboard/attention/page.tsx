"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

import { ConfidencePill } from "@/components/documents/confidence-indicator";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { getHealthOverview, getMissingSummary } from "@/lib/documents";
import type {
  HealthOverviewResponse,
  MissingScanGroup,
  MissingScanResponse,
} from "@/types/documents";

function itemHref(target: "document" | "bundle", id: number): string {
  return target === "bundle"
    ? `/dashboard/bundles/${id}`
    : `/dashboard/documents/${id}/edit`;
}

function MissingGroupCard({ group }: { group: MissingScanGroup }) {
  if (group.items.length === 0) return null;
  return (
    <SectionCard title={group.label} description={group.hint}>
      <ul className="divide-y divide-border">
        {group.items.map((item) => (
          <li key={`${group.key}-${item.id}`}>
            <Link
              href={itemHref(group.fix_target, item.id)}
              className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {group.key === "low_confidence" && item.confidence_score != null
                    ? `Confidence ${item.confidence_score}/100`
                    : group.key === "bundles_missing_required"
                      ? `${item.missing_required_count} required item${item.missing_required_count === 1 ? "" : "s"} missing`
                      : (item.document_type || item.status_label || "Document")}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default function AttentionPage() {
  const [missing, setMissing] = useState<MissingScanResponse | null>(null);
  const [overview, setOverview] = useState<HealthOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getMissingSummary(), getHealthOverview()])
      .then(([m, o]) => {
        if (!active) return;
        setMissing(m);
        setOverview(o);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load this page.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = missing === null || overview === null;
  const missingGroups = missing?.groups.filter((g) => g.items.length > 0) ?? [];
  const healthGroups =
    overview?.groups.filter((g) => g.count > 0 && g.key !== "healthy") ?? [];
  const healthyCount =
    overview?.groups.find((g) => g.key === "healthy")?.count ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Attention &amp; health"
        description="A quick scan of what needs fixing across your vault, plus how your documents group by health."
      />

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading && !error ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* What is missing */}
          {missing && missingGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border">
              <EmptyState
                icon={CheckCircle2}
                title="Nothing needs attention"
                description="Every document has its files, dates, and reminders in place. Nice work."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="size-4 text-amber-600" />
                {missing?.total} item{missing?.total === 1 ? "" : "s"} could use
                your attention
              </div>
              {missingGroups.map((group) => (
                <MissingGroupCard key={group.key} group={group} />
              ))}
            </div>
          )}

          {/* Health overview */}
          <div className="space-y-4 pt-2">
            <h2 className="font-heading text-lg font-semibold">
              Health overview
            </h2>
            {healthyCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {healthyCount} document{healthyCount === 1 ? "" : "s"} are healthy
                and up to date.
              </p>
            )}
            {healthGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents need grouping yet.
              </p>
            ) : (
              healthGroups.map((group) => (
                <SectionCard
                  key={group.key}
                  title={`${group.label} · ${group.count}`}
                  description={group.description}
                >
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => (
                      <li key={`${group.key}-${item.id}`}>
                        <Link
                          href={`/dashboard/documents/${item.id}/edit`}
                          className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {item.title}
                            </span>
                            <DocumentStatusBadge status={item.computed_status} />
                          </div>
                          <ConfidencePill
                            score={item.confidence_score}
                            label={item.confidence_label}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
