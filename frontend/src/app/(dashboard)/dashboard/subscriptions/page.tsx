"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  BILLING_CYCLE_LABELS,
  REVIEW_STATUS_META,
  STATUS_LABELS,
  archiveSubscription,
  getSubscriptionSummary,
  listSubscriptions,
  markSubscriptionCancelled,
  markSubscriptionPaid,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import type {
  Subscription,
  SubscriptionListParams,
  SubscriptionSummary,
  SubscriptionUrgency,
} from "@/types/subscriptions";

type FilterKey =
  | "all"
  | "active"
  | "trial"
  | "renewing_soon"
  | "auto_renew"
  | "cancellation_deadline"
  | "review_recommended"
  | "cancel_candidates"
  | "cancelled";

// `params` apply server-side; `reviewStatuses` / `clientPredicate` apply to the
// fetched page client-side (review status is computed, not a DB column).
const FILTERS: {
  key: FilterKey;
  label: string;
  params: SubscriptionListParams;
  reviewStatuses?: string[];
  clientPredicate?: (s: Subscription) => boolean;
}[] = [
  { key: "all", label: "All", params: {} },
  { key: "active", label: "Active", params: { status: "active" } },
  { key: "trial", label: "Trial", params: { status: "trial" } },
  { key: "renewing_soon", label: "Renewing soon", params: { renews_within_days: 7 } },
  { key: "auto_renew", label: "Auto-renew", params: { auto_renew: true } },
  {
    key: "cancellation_deadline",
    label: "Cancellation deadline",
    params: {},
    clientPredicate: (s) => s.state.cancellation_deadline_soon,
  },
  {
    key: "review_recommended",
    label: "Review recommended",
    params: {},
    reviewStatuses: ["review", "urgent", "trial_attention", "cancel_candidate"],
  },
  {
    key: "cancel_candidates",
    label: "Cancel candidates",
    params: {},
    reviewStatuses: ["cancel_candidate"],
  },
  { key: "cancelled", label: "Cancelled", params: { status: "cancelled" } },
];

// Server-side sorts pass `ordering`; client-side sorts (computed equivalents)
// reorder the loaded page by a key function.
const SORTS: {
  value: string;
  label: string;
  ordering?: string;
  clientSort?: (a: Subscription, b: Subscription) => number;
}[] = [
  { value: "next_billing_date", label: "Next billing date", ordering: "next_billing_date" },
  {
    value: "yearly_desc",
    label: "Highest yearly cost",
    clientSort: (a, b) => num(b.state.yearly_equivalent_amount) - num(a.state.yearly_equivalent_amount),
  },
  {
    value: "monthly_desc",
    label: "Highest monthly cost",
    clientSort: (a, b) => num(b.state.monthly_equivalent_amount) - num(a.state.monthly_equivalent_amount),
  },
  { value: "name", label: "Name", ordering: "name" },
  { value: "-created_at", label: "Recently added", ordering: "-created_at" },
];

function num(value: string | null): number {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

const URGENCY_BADGE: Record<SubscriptionUrgency, { label: string; chip: string }> = {
  overdue: { label: "Overdue", chip: "border-destructive/25 bg-destructive/10 text-destructive" },
  renews_today: { label: "Renews today", chip: "border-destructive/25 bg-destructive/10 text-destructive" },
  renews_soon: { label: "Soon", chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber" },
  upcoming: { label: "Upcoming", chip: "border-primary/20 bg-primary/10 text-primary" },
  normal: { label: "Planned", chip: "border-border bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", chip: "border-border bg-muted text-muted-foreground" },
  expired: { label: "Expired", chip: "border-border bg-muted text-muted-foreground" },
  paused: { label: "Paused", chip: "border-border bg-muted text-muted-foreground" },
};

function money(amount: string, currency: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function costByCurrency(totals: Record<string, string>): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return "-";
  return entries.map(([cur, amt]) => money(amt, cur)).join(" | ");
}

function countdown(days: number | null): string {
  if (days === null) return "No date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// Plain-language insight lines from the summary (most useful first).
function buildInsights(summary: SubscriptionSummary): string[] {
  const lines: string[] = [];
  const monthly = costByCurrency(summary.monthly_cost_by_currency);
  if (summary.active_count > 0 && monthly !== "-") {
    lines.push(
      `You're spending ${monthly}/month across ${summary.active_count} active subscription${summary.active_count === 1 ? "" : "s"}.`,
    );
  }
  if (summary.renewals_this_month > 0) {
    lines.push(
      `${summary.renewals_this_month} subscription${summary.renewals_this_month === 1 ? "" : "s"} renew in the next 30 days.`,
    );
  }
  if (summary.cancellation_deadlines_soon > 0) {
    lines.push(
      `${summary.cancellation_deadlines_soon} cancellation deadline${summary.cancellation_deadlines_soon === 1 ? " is" : "s are"} coming this week.`,
    );
  }
  if (summary.trials_ending_soon > 0) {
    lines.push(
      `${summary.trials_ending_soon} trial${summary.trials_ending_soon === 1 ? "" : "s"} ending soon.`,
    );
  }
  if (summary.review_recommended_count > 0) {
    lines.push(
      `${summary.review_recommended_count} subscription${summary.review_recommended_count === 1 ? "" : "s"} may need review.`,
    );
  }
  return lines;
}

export default function SubscriptionsPage() {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState("next_billing_date");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadSummary = useCallback(() => {
    getSubscriptionSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const loadList = useCallback(() => {
    const active = FILTERS.find((f) => f.key === filter);
    const activeSort = SORTS.find((s) => s.value === sort);
    setSubscriptions(null);
    listSubscriptions({
      ...active?.params,
      ordering: activeSort?.ordering ?? "next_billing_date",
      search: search || undefined,
    })
      .then((res) => {
        setSubscriptions(res.results);
        setError(null);
      })
      .catch((err) => {
        setSubscriptions([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load your subscriptions.",
        );
      });
  }, [filter, sort, search]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const handle = setTimeout(loadList, search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [loadList, search]);

  async function runAction(
    id: number,
    fn: () => Promise<unknown>,
  ) {
    setBusyId(id);
    try {
      await fn();
      loadList();
      loadSummary();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "That action could not complete.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const monthly = summary ? summary.monthly_cost_by_currency : {};
  const yearly = summary ? summary.yearly_cost_by_currency : {};
  const multiCurrency =
    Object.keys(monthly).length > 1 || Object.keys(yearly).length > 1;

  // Apply client-side review filters + computed-cost sorts to the loaded page.
  const displayed = useMemo(() => {
    if (!subscriptions) return null;
    const activeFilter = FILTERS.find((f) => f.key === filter);
    const reviewStatuses = activeFilter?.reviewStatuses;
    let rows = subscriptions;
    if (reviewStatuses) {
      rows = rows.filter((s) => reviewStatuses.includes(s.state.review_status));
    }
    if (activeFilter?.clientPredicate) {
      rows = rows.filter(activeFilter.clientPredicate);
    }
    const activeSort = SORTS.find((s) => s.value === sort);
    if (activeSort?.clientSort) {
      rows = [...rows].sort(activeSort.clientSort);
    }
    return rows;
  }, [subscriptions, filter, sort]);

  const insights = summary ? buildInsights(summary) : [];

  return (
    <PageContainer width="full" className="space-y-6">
      <header className="rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Renewal command center
              </p>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
                <ShieldCheck className="size-3" />
                Owner-scoped
              </span>
            </div>
            <h1 className="mt-3 text-page-title">Subscriptions</h1>
            <p className="mt-2 text-page-subtitle">
              Track recurring payments, auto-renewals, cancellation deadlines,
              and upcoming charges. DueNest stores renewal dates and reminders
              only - never full card or banking details.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/dashboard/calendar"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <CalendarDays className="size-4" />
              Open Calendar
            </Link>
            <Link
              href="/dashboard/subscriptions/new"
              className={cn(buttonVariants())}
            >
              <Plus className="size-4" />
              Add subscription
            </Link>
          </div>
        </div>
      </header>

      {error && <InlineAlert>{error}</InlineAlert>}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric icon={RefreshCw} label="Active subscriptions" value={String(summary.active_count)} hint={`${summary.total_count} tracked`} tone="secure" />
          <Metric icon={Wallet} label="Monthly cost" value={costByCurrency(monthly)} hint={multiCurrency ? "Grouped by currency" : summary.cost_unestimable_count ? `${summary.cost_unestimable_count} custom excluded` : "Estimated"} tone="default" />
          <Metric icon={CircleDollarSign} label="Yearly cost" value={costByCurrency(yearly)} hint={multiCurrency ? "Grouped by currency" : "Estimated"} tone="default" />
          <Metric icon={Clock3} label="Renewing soon" value={String(summary.renewals_this_week)} hint="Next 7 days" tone={summary.renewals_this_week > 0 ? "warn" : "good"} />
          <Metric icon={AlertTriangle} label="Cancellation deadlines" value={String(summary.cancellation_deadlines_soon)} hint="Within 7 days" tone={summary.cancellation_deadlines_soon > 0 ? "danger" : "good"} prominent={summary.cancellation_deadlines_soon > 0} />
          <Metric icon={CalendarClock} label="Trials ending" value={String(summary.trials_ending_soon)} hint="Within 7 days" tone={summary.trials_ending_soon > 0 ? "warn" : "good"} />
          <Metric icon={SearchCheck} label="Review recommended" value={String(summary.review_recommended_count)} hint="Rule-based checks" tone={summary.review_recommended_count > 0 ? "warn" : "good"} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Renewal insights</h2>
          </div>
          <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            {insights.map((insight) => (
              <li key={insight} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                {insight}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, provider, or notes..."
            className="lg:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  filter === f.key
                    ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort subscriptions"
              className="h-8 rounded-full border border-input bg-card px-3 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {displayed === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        filter === "all" && !search ? (
          <div className="rounded-2xl border border-border bg-card shadow-card">
            <EmptyState
              icon={RefreshCw}
              title="No subscriptions yet."
              description="Add recurring payments like streaming services, domains, hosting, insurance, and software tools so DueNest can remind you before they renew."
              action={
                <Link href="/dashboard/subscriptions/new" className={cn(buttonVariants())}>
                  <Plus className="size-4" />
                  Add subscription
                </Link>
              }
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No subscriptions match this view.
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {displayed.map((sub) => (
            <li key={sub.id}>
              <SubscriptionRow
                subscription={sub}
                busy={busyId === sub.id}
                onMarkPaid={() =>
                  runAction(sub.id, () => markSubscriptionPaid(sub.id))
                }
                onMarkCancelled={() =>
                  runAction(sub.id, () => markSubscriptionCancelled(sub.id))
                }
                onArchive={() =>
                  runAction(sub.id, () => archiveSubscription(sub.id))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  prominent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: "default" | "good" | "warn" | "danger" | "secure";
  prominent?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/[0.045]"
      : tone === "warn"
        ? "border-brand-amber/30 bg-brand-amber/[0.045]"
        : tone === "good"
          ? "border-brand-success/25 bg-brand-success/[0.045]"
          : tone === "secure"
            ? "border-primary/20 bg-primary/[0.035]"
            : "border-border bg-card";
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-card",
        toneClass,
        prominent && "ring-1 ring-destructive/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-xl font-semibold leading-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card/70 text-foreground shadow-xs">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function SubscriptionRow({
  subscription: sub,
  busy,
  onMarkPaid,
  onMarkCancelled,
  onArchive,
}: {
  subscription: Subscription;
  busy: boolean;
  onMarkPaid: () => void;
  onMarkCancelled: () => void;
  onArchive: () => void;
}) {
  const urgency = URGENCY_BADGE[sub.state.urgency];
  const review = REVIEW_STATUS_META[sub.state.review_status];
  const showCancelWarning = sub.state.cancellation_deadline_soon;
  const canCancel = sub.status === "active" || sub.status === "trial";

  return (
    <div className="group rounded-2xl border border-border bg-card p-3.5 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href={`/dashboard/subscriptions/${sub.id}`}
          className="min-w-0 flex-1 focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{sub.name}</p>
            <Badge variant="outline" className={urgency.chip}>
              {urgency.label}
            </Badge>
            {sub.auto_renew && (
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                Auto-renew
              </Badge>
            )}
            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
              {STATUS_LABELS[sub.status] ?? sub.status}
            </Badge>
            {review?.show && (
              <Badge
                variant="outline"
                className={review.chip}
                title={
                  sub.state.review_reasons.length > 0
                    ? sub.state.review_reasons.join(" · ")
                    : undefined
                }
              >
                {review.label}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {[sub.provider, sub.category_detail?.name, sub.plan_name]
              .filter(Boolean)
              .join(" | ") || "Subscription"}
          </p>
          {review?.show && sub.state.review_reasons.length > 0 && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {/* Never show an unexplained badge: surface the first reason. */}
              Review recommended — {sub.state.review_reasons[0].toLowerCase()}
            </p>
          )}
          {showCancelWarning && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3" />
              Cancel by {sub.cancellation_deadline}
            </p>
          )}
        </Link>

        <div className="flex items-center gap-4 lg:justify-end">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {money(sub.amount, sub.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium tabular-nums">
              {sub.next_billing_date ?? "No date"}
            </p>
            <p
              className={cn(
                "text-xs",
                sub.state.urgency === "overdue"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {countdown(sub.state.days_until_renewal)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkPaid}
              disabled={busy}
              title="Log a payment and roll the renewal date forward"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Mark paid"}
            </Button>
            {canCancel && (
              <Button variant="ghost" size="sm" onClick={onMarkCancelled} disabled={busy} className="text-muted-foreground">
                Cancel
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy} className="text-muted-foreground">
              Archive
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
