import Link from "next/link";
import {
  CalendarDays,
  CreditCard,
  FileText,
  LifeBuoy,
  Share2,
  TrendingUp,
} from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { formatDate } from "@/lib/documents";
import {
  formatMoneyRisk,
  formatRelativeDeadline,
  getNextCharge,
  type EmergencyReadiness,
} from "@/lib/life-radar";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarSummary } from "@/types/calendar";
import type { DocumentRecord } from "@/types/documents";
import type { SubscriptionSummary } from "@/types/subscriptions";
import { DashboardEmptyState, DashboardSectionError } from "./states";

function relativeFromDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return formatRelativeDeadline(
    Math.round((target - start.getTime()) / 86_400_000),
  );
}

function firstCurrencyAmount(map: Record<string, string>): {
  amount: string;
  currency: string;
} | null {
  const entries = Object.entries(map);
  if (entries.length === 0) return null;
  const [currency, amount] = entries[0];
  return { currency, amount };
}

// ---------------------------------------------------------------------------

export function ThisWeekPanel({
  events,
  summary,
  error,
  onRetry,
}: {
  events: CalendarEvent[];
  summary: CalendarSummary | null;
  error: boolean;
  onRetry?: () => void;
}) {
  return (
    <SectionCard
      title="This week"
      action={
        <Link
          href="/dashboard/calendar"
          className="text-sm font-medium text-primary hover:underline"
        >
          Calendar
        </Link>
      }
    >
      {error ? (
        <DashboardSectionError
          message="This week's view could not load."
          onRetry={onRetry}
        />
      ) : events.length === 0 ? (
        <DashboardEmptyState
          icon={CalendarDays}
          title="Nothing scheduled this week"
          description="Document expiries, renewals, and deadlines will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {summary && (summary.due_today > 0 || summary.overdue > 0) && (
            <li className="mb-1 flex gap-3 text-xs font-medium">
              {summary.overdue > 0 && (
                <span className="text-destructive">
                  {summary.overdue} overdue
                </span>
              )}
              {summary.due_today > 0 && (
                <span className="text-brand-amber">
                  {summary.due_today} due today
                </span>
              )}
            </li>
          )}
          {events.slice(0, 5).map((event) => (
            <li key={event.id}>
              <Link
                href={event.linked_resource_url || "/dashboard/calendar"}
                className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
              >
                <span className="min-w-0 truncate">{event.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeFromDate(event.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

export function MoneyRadarPanel({
  summary,
  error,
  onRetry,
}: {
  summary: SubscriptionSummary | null;
  error: boolean;
  onRetry?: () => void;
}) {
  const monthly = summary ? firstCurrencyAmount(summary.monthly_cost_by_currency) : null;
  const yearly = summary ? firstCurrencyAmount(summary.yearly_cost_by_currency) : null;
  const nextCharge = getNextCharge(summary);

  return (
    <SectionCard
      title="Money Radar"
      action={
        <Link
          href="/dashboard/subscriptions"
          className="text-sm font-medium text-primary hover:underline"
        >
          Open
        </Link>
      }
    >
      {error ? (
        <DashboardSectionError
          message="Money Radar could not load. Try again."
          onRetry={onRetry}
        />
      ) : !summary || summary.total_count === 0 ? (
        <DashboardEmptyState
          icon={CreditCard}
          title="No subscriptions tracked"
          description="Track subscriptions to catch silent renewals before they charge you."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
            <div>
              <p className="text-xs text-muted-foreground">Monthly tracked</p>
              <p className="text-lg font-semibold">
                {monthly
                  ? formatMoneyRisk(monthly.amount, monthly.currency)
                  : "—"}
              </p>
            </div>
            {yearly && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" aria-hidden />
                {formatMoneyRisk(yearly.amount, yearly.currency)}/yr
              </p>
            )}
          </div>

          {nextCharge && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                Next charge ·{" "}
                <span className="font-medium">{nextCharge.name}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {formatMoneyRisk(nextCharge.amount, nextCharge.currency)} ·{" "}
                {formatRelativeDeadline(nextCharge.days_until_renewal)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {summary.trials_ending_soon > 0 && (
              <MoneyChip
                tone="amber"
                label={`${summary.trials_ending_soon} trial${summary.trials_ending_soon === 1 ? "" : "s"} ending`}
              />
            )}
            {summary.cancellation_deadlines_soon > 0 && (
              <MoneyChip
                tone="red"
                label={`${summary.cancellation_deadlines_soon} cancel deadline${summary.cancellation_deadlines_soon === 1 ? "" : "s"}`}
              />
            )}
            {summary.review_recommended_count > 0 && (
              <MoneyChip
                tone="slate"
                label={`${summary.review_recommended_count} to review`}
              />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MoneyChip({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "red" | "slate";
}) {
  const cls = {
    amber: "bg-brand-amber/10 text-brand-amber",
    red: "bg-destructive/10 text-destructive",
    slate: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function SharingEmergencyPanel({
  shareRisk,
  emergency,
  error,
  onRetry,
}: {
  shareRisk: { activeCount: number; sensitiveCount: number; expiringSoonCount: number };
  emergency: EmergencyReadiness;
  error: boolean;
  onRetry?: () => void;
}) {
  return (
    <SectionCard title="Sharing & emergency">
      {error ? (
        <DashboardSectionError
          message="Sharing status could not load. Your documents are still protected."
          onRetry={onRetry}
        />
      ) : (
        <div className="space-y-3 text-sm">
          {/* Shares */}
          <Link
            href="/dashboard/quick-share"
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40"
          >
            <span className="flex items-center gap-2">
              <Share2 className="size-4 text-primary" aria-hidden />
              {shareRisk.activeCount > 0
                ? `${shareRisk.activeCount} active share${shareRisk.activeCount === 1 ? "" : "s"}`
                : "No active shares"}
            </span>
            {shareRisk.sensitiveCount > 0 ? (
              <span className="rounded-full bg-brand-amber/10 px-2 py-0.5 text-[0.68rem] font-medium text-brand-amber">
                Sensitive access open
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Protected</span>
            )}
          </Link>
          {shareRisk.activeCount === 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              When you share documents, you’ll see access and expiry here.
            </p>
          )}

          {/* Emergency */}
          <Link
            href="/dashboard/emergency"
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40"
          >
            <span className="flex items-center gap-2">
              <LifeBuoy
                className={cn(
                  "size-4",
                  emergency.ready ? "text-brand-success" : "text-brand-amber",
                )}
                aria-hidden
              />
              Emergency readiness
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                emergency.ready
                  ? "bg-brand-success/10 text-brand-success"
                  : "bg-brand-amber/10 text-brand-amber",
              )}
            >
              {emergency.ready
                ? "Ready"
                : `${emergency.label} · ${emergency.stepsLeft} left`}
            </span>
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

export function RecentActivityPanel({
  recentDocs,
  error,
}: {
  recentDocs: DocumentRecord[];
  error: boolean;
}) {
  return (
    <SectionCard title="Recent activity">
      {error ? (
        <DashboardSectionError message="Recent activity could not load." />
      ) : recentDocs.length === 0 ? (
        <DashboardEmptyState
          icon={FileText}
          title="No recent updates"
          description="Documents you add or edit will show up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {recentDocs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/dashboard/documents/${doc.id}`}
                className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-primary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">{doc.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(doc.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}