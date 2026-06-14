"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  FileText,
  LifeBuoy,
  Package,
  Paperclip,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { CalendarUpcomingWidget } from "@/components/dashboard/calendar-upcoming-widget";
import { SubscriptionRenewalsWidget } from "@/components/dashboard/subscription-renewals-widget";
import { StatCard, type Stat } from "@/components/dashboard/stat-card";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { UrgencyBadge } from "@/components/documents/urgency-badge";
import { SetupChecklistCard } from "@/components/onboarding/setup-checklist-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  daysUntil,
  formatDate,
  getAttentionNeeded,
  getDocuments,
  getUpcomingDocumentReminders,
} from "@/lib/documents";
import { getDocumentSetupChecklist, getOnboardingState } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { DocumentRecord, DocumentReminderRule } from "@/types/documents";
import type {
  DocumentSetupChecklist,
  OnboardingState,
} from "@/types/onboarding";

interface DashboardData {
  total: number;
  needsAttention: number;
  expiringSoon: number;
  missingFiles: number;
  upcomingReminders: number;
}

const QUICK_ACTIONS = [
  { label: "Add document", href: "/dashboard/documents/new", icon: Plus },
  { label: "Review attention", href: "/dashboard/attention", icon: ShieldAlert },
  { label: "Create bundle", href: "/dashboard/bundles/new", icon: Package },
  { label: "Emergency access", href: "/dashboard/emergency", icon: LifeBuoy },
];

function reminderWhen(rule: DocumentReminderRule): string {
  const date = rule.upcoming_reminder_date;
  if (!date) return "—";
  const days = daysUntil(date);
  if (days === null) return formatDate(date);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function DashboardPage() {
  const user = useDashboardUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [attention, setAttention] = useState<DocumentRecord[] | null>(null);
  const [recent, setRecent] = useState<DocumentRecord[]>([]);
  const [reminders, setReminders] = useState<DocumentReminderRule[]>([]);
  const [setupChecklist, setSetupChecklist] =
    useState<DocumentSetupChecklist | null>(null);
  const [onboardingState, setOnboardingState] =
    useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocuments(),
      getDocuments({ computed_status: "expiring_soon" }),
      getDocuments({ missing_file: true }),
      getDocuments({ ordering: "-updated_at" }),
      getAttentionNeeded(),
      getUpcomingDocumentReminders(),
      getDocumentSetupChecklist(),
      getOnboardingState(),
    ])
      .then(
        ([
          allDocs,
          expiringSoon,
          missingFiles,
          recentDocs,
          attentionResult,
          remindersResult,
          checklistResult,
          onboardingResult,
        ]) => {
          if (!active) return;
          setData({
            total: allDocs.count,
            needsAttention: attentionResult.count,
            expiringSoon: expiringSoon.count,
            missingFiles: missingFiles.count,
            upcomingReminders: remindersResult.count,
          });
          setAttention(attentionResult.items);
          setRecent(recentDocs.results.slice(0, 5));
          setReminders(remindersResult.items.slice(0, 4));
          setSetupChecklist(checklistResult);
          setOnboardingState(onboardingResult);
          setError(null);
        },
      )
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "We couldn't load your workspace. Please try again.",
        );
        setData({
          total: 0,
          needsAttention: 0,
          expiringSoon: 0,
          missingFiles: 0,
          upcomingReminders: 0,
        });
        setAttention([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const greetingName = user.first_name?.trim() || user.username;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const loading = data === null || attention === null;
  const showSetupChecklist =
    setupChecklist !== null &&
    onboardingState !== null &&
    !onboardingState.has_completed_document_onboarding &&
    !onboardingState.dismissed_onboarding_at;

  const stats: Stat[] = data
    ? [
        { label: "Documents", value: data.total, hint: "in your vault", icon: FileText, tone: "blue" },
        { label: "Needs attention", value: data.needsAttention, hint: "ranked by urgency", icon: ShieldAlert, tone: "amber" },
        { label: "Expiring soon", value: data.expiringSoon, hint: "within 90 days", icon: CalendarClock, tone: "amber" },
        { label: "Missing files", value: data.missingFiles, hint: "no file attached", icon: Paperclip, tone: "slate" },
        { label: "Upcoming reminders", value: data.upcomingReminders, hint: "scheduled ahead", icon: BellRing, tone: "teal" },
      ]
    : [];
  const statHref: Record<string, string> = {
    "Needs attention": "/dashboard/attention",
    "Expiring soon": "/dashboard/documents?quick=expiring_soon",
    "Missing files": "/dashboard/documents?quick=missing_file",
    "Upcoming reminders": "/dashboard/reminders",
  };
  const attentionItems = (attention ?? []).slice(0, 5);
  const isEmptyVault = !loading && data?.total === 0;

  return (
    <PageContainer>
      {/* Welcome + primary action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {today}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Keep important documents, expiry dates, and renewal tasks under
            control.
          </p>
        </div>
        <Link
          href="/dashboard/documents/new"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          <Plus className="size-4" />
          Add document
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
            ))
          : stats.map((stat) => (
              <Link
                key={stat.label}
                href={statHref[stat.label] ?? "/dashboard/documents"}
                className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <StatCard stat={stat} />
              </Link>
            ))}
      </div>

      {showSetupChecklist && <SetupChecklistCard checklist={setupChecklist} />}

      {isEmptyVault ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="Your vault is ready"
              description="Start with your passport, a visa, or an insurance policy. DueNest will track expiry dates, flag what needs attention, and keep your files in one calm place."
              action={
                <Link
                  href="/dashboard/documents/new"
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  <Plus className="size-4" />
                  Add your first document
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Needs attention */}
          <SectionCard
            title="Needs attention"
            description="Expired, due, expiring soon, or missing key tracking information."
            action={
              <Link
                href="/dashboard/attention"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : attentionItems.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-success/10 text-brand-success">
                  <ShieldAlert className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    No documents need attention right now.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Everything you track looks calm and up to date.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {attentionItems.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/dashboard/documents/${doc.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {doc.title}
                          </span>
                          <UrgencyBadge level={doc.urgency_level} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {doc.status_reason}
                        </p>
                      </div>
                      <DocumentStatusBadge status={doc.computed_status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Side rail: upcoming dates + reminders + recent */}
          <div className="flex flex-col gap-6">
            <CalendarUpcomingWidget />

            <SubscriptionRenewalsWidget />

            <SectionCard
              title="Upcoming reminders"
              action={
                <Link
                  href="/dashboard/reminders"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  All
                </Link>
              }
            >
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : reminders.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No reminders scheduled yet. Add one from any document with an
                  expiry or renewal date.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {reminders.map((rule) => (
                    <li key={rule.id}>
                      <Link
                        href={`/dashboard/documents/${rule.document}`}
                        className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
                      >
                        <span className="min-w-0 truncate">
                          {rule.document_title ?? "Document"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {reminderWhen(rule)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Recently updated">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Documents you add or edit will show up here.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {recent.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/dashboard/documents/${doc.id}`}
                        className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
                      >
                        <span className="min-w-0 truncate">{doc.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(doc.updated_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* Quick actions */}
      {!isEmptyVault && (
        <SectionCard
          title="Quick actions"
          description="Jump straight to the things you do most."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">
                    {action.label}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </SectionCard>
      )}
    </PageContainer>
  );
}
