"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Edit3,
  FileUp,
  ShieldAlert,
} from "lucide-react";

import { SubscriptionAttentionSection } from "@/components/subscriptions/subscription-attention-section";
import { ConfidencePill } from "@/components/documents/confidence-indicator";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { UrgencyBadge } from "@/components/documents/urgency-badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate, getAttentionNeeded } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord, DocumentUrgencyLevel } from "@/types/documents";

type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_COPY: Record<
  Severity,
  { title: string; description: string; tone: string }
> = {
  critical: {
    title: "Critical",
    description: "Expired documents and issues that may already be blocking you.",
    tone: "text-destructive",
  },
  high: {
    title: "Act soon",
    description: "Important records that need action before they become urgent.",
    tone: "text-brand-amber",
  },
  medium: {
    title: "Watch closely",
    description: "Documents with gaps or dates approaching in the near future.",
    tone: "text-brand-amber",
  },
  low: {
    title: "Clean up",
    description: "Useful fixes that make the vault more reliable.",
    tone: "text-muted-foreground",
  },
};

function severityFor(level: DocumentUrgencyLevel): Severity {
  if (level === "critical") return "critical";
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

function hasReminder(doc: DocumentRecord): boolean {
  return doc.confidence_reasons.find((reason) => reason.key === "has_reminder")
    ?.met ?? false;
}

function pluralDays(value: number): string {
  return `${value} day${value === 1 ? "" : "s"}`;
}

function issueReason(doc: DocumentRecord): string {
  if (doc.days_until_renewal !== null && doc.days_until_renewal < 0) {
    return `${doc.title} renewal date has passed`;
  }
  if (doc.is_expired && doc.days_until_expiry !== null) {
    return `${doc.title} expired ${pluralDays(Math.abs(doc.days_until_expiry))} ago`;
  }
  if (doc.days_until_expiry !== null && doc.days_until_expiry >= 0) {
    return `${doc.title} expires in ${pluralDays(doc.days_until_expiry)}`;
  }
  if (doc.missing_file) return `${doc.title} has no uploaded file`;
  if (doc.missing_expiry_date) return `${doc.title} has no expiry date`;
  if (!hasReminder(doc)) return `${doc.title} has no reminder rule`;
  return doc.status_reason || `${doc.title} needs review`;
}

function IssueRow({ doc }: { doc: DocumentRecord }) {
  const workspaceHref = `/dashboard/documents/${doc.id}`;
  const needsReminder = !hasReminder(doc);

  return (
    <li className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
      <Link
        href={workspaceHref}
        className="min-w-0 rounded-lg outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-heading text-sm font-semibold">
            {doc.title}
          </p>
          <DocumentStatusBadge status={doc.computed_status} />
          <UrgencyBadge level={doc.urgency_level} />
          <ConfidencePill
            score={doc.confidence_score}
            label={doc.confidence_label}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{issueReason(doc)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {doc.document_type || "Document"}
          {doc.country && ` · ${doc.country}`}
          {doc.expiry_date && ` · Expires ${formatDate(doc.expiry_date)}`}
        </p>
      </Link>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {doc.missing_file && (
          <Link
            href={`${workspaceHref}?tab=files`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <FileUp className="size-3.5" />
            Add file
          </Link>
        )}
        {doc.missing_expiry_date && (
          <Link
            href={`${workspaceHref}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Edit3 className="size-3.5" />
            Add dates
          </Link>
        )}
        {needsReminder && (
          <Link
            href={`${workspaceHref}?tab=renewal`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <BellRing className="size-3.5" />
            Reminder
          </Link>
        )}
        {(doc.is_expired || doc.is_renewal_due) && (
          <Link
            href={`${workspaceHref}?tab=renewal`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <CalendarClock className="size-3.5" />
            Renewal
          </Link>
        )}
        <Link
          href={workspaceHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Open
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </li>
  );
}

export default function AttentionPage() {
  const [items, setItems] = useState<DocumentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAttentionNeeded()
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load this page.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    const grouped: Record<Severity, DocumentRecord[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const doc of items ?? []) {
      grouped[severityFor(doc.urgency_level)].push(doc);
    }

    return grouped;
  }, [items]);

  const total = items?.length ?? 0;
  const loading = items === null;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Risk inbox"
        title="Attention needed"
        description="Documents with expired dates, missing files, missing expiry dates, or reminder gaps. Work the highest-risk items first."
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
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={CheckCircle2}
            title="No documents need attention right now"
            description="Your vault has no expired documents, missing files, or urgent renewal gaps."
            action={
              <Link
                href="/dashboard/documents"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Open document vault
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="size-4 text-brand-amber" />
              {total} document{total === 1 ? "" : "s"} need attention
            </div>
            <Link
              href="/dashboard/documents?quick=needs_attention"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              View in vault
            </Link>
          </div>

          <div className="space-y-5">
            {SEVERITY_ORDER.map((severity) => {
              const docs = groups[severity];
              if (docs.length === 0) return null;
              const copy = SEVERITY_COPY[severity];
              return (
                <SectionCard
                  key={severity}
                  title={`${copy.title} · ${docs.length}`}
                  description={copy.description}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn("size-2 rounded-full bg-current", copy.tone)}
                    />
                    <span className={cn("text-xs font-medium", copy.tone)}>
                      Work from top to bottom
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {docs.map((doc) => (
                      <IssueRow key={doc.id} doc={doc} />
                    ))}
                  </ul>
                </SectionCard>
              );
            })}
          </div>
        </>
      )}

      {/* Subscription renewals/deadlines that need a decision. Renders nothing
          when no subscriptions need attention. */}
      <SubscriptionAttentionSection />
    </PageContainer>
  );
}
