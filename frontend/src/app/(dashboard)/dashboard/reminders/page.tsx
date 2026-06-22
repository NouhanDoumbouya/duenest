"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  daysUntil,
  formatDate,
  getUpcomingDocumentReminders,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentReminderRule } from "@/types/documents";

function describeRule(rule: DocumentReminderRule): string {
  if (rule.trigger_type === "on_expiry") return "On the expiry date";
  const unit = rule.days_before === 1 ? "day" : "days";
  const source =
    rule.trigger_type === "before_renewal_date" ? "renewal date" : "expiry";
  return `${rule.days_before} ${unit} before ${source}`;
}

function whenLabel(date: string | null): string {
  if (!date) return "Date not set";
  const days = daysUntil(date);
  if (days === null) return formatDate(date);
  if (days < 0) return `${formatDate(date)} · overdue`;
  if (days === 0) return `${formatDate(date)} · today`;
  if (days === 1) return `${formatDate(date)} · tomorrow`;
  return `${formatDate(date)} · in ${days} days`;
}

export default function RemindersPage() {
  const [rules, setRules] = useState<DocumentReminderRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getUpcomingDocumentReminders()
      .then((res) => {
        setRules(res.items);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Unable to load reminders.",
        ),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setRules(null);
    load();
  }, [load]);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Workspace"
        title="Deadlines & Renewals"
        description="Upcoming reminders calculated from your documents' expiry and renewal dates. Add or change reminder rules from each document."
      />

      <SectionCard
        title="Upcoming reminders"
        description="Sorted by the next date CertaNest would remind you."
      >
        {error ? (
          <ErrorState description={error} onRetry={retry} />
        ) : rules === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="No reminders scheduled yet"
            description="Open a document with an expiry or renewal date and add a reminder rule so nothing slips past you."
            action={
              <Link
                href="/dashboard/documents"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Go to documents
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((rule) => {
              const overdue =
                rule.upcoming_reminder_date != null &&
                (daysUntil(rule.upcoming_reminder_date) ?? 0) < 0;
              return (
                <li key={rule.id}>
                  <Link
                    href={`/dashboard/documents/${rule.document}?tab=renewal`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          overdue
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent text-accent-foreground",
                        )}
                      >
                        <CalendarClock className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {rule.document_title ?? "Document"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {describeRule(rule)}
                          {!rule.is_enabled && " · paused"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          overdue ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {whenLabel(rule.upcoming_reminder_date)}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <p className="text-center text-xs text-muted-foreground">
        CertaNest now turns due reminders into in-app notifications and
        privacy-safe email reminders when the backend command runs.
      </p>
    </PageContainer>
  );
}
