"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Gauge,
  HelpCircle,
  Lightbulb,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Radar,
  SearchCheck,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  deleteSubscription,
  exportSubscriptionsCsv,
  getSubscriptionSummary,
  listSubscriptions,
  markSubscriptionCancelled,
  markSubscriptionPaid,
  restoreSubscription,
  reviewSubscription,
  toggleSubscriptionPin,
} from "@/lib/subscriptions";
import {
  controlScore,
  controlScoreLabel,
  missingMetadataChecks,
  pinnedFirst,
  savingsEstimate,
} from "@/lib/subscription-insights";
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
  | "cancelled"
  | "archived";

// A simplified, decision-oriented filter bar. `params` apply server-side;
// `reviewStatuses` / `clientPredicate` apply to the fetched page client-side
// (review status is computed, not a DB column). The full FilterKey union is kept
// so the underlying logic stays intact even though we surface fewer buttons.
const FILTERS: {
  key: FilterKey;
  label: string;
  params: SubscriptionListParams;
  reviewStatuses?: string[];
  clientPredicate?: (s: Subscription) => boolean;
}[] = [
  { key: "all", label: "All", params: {} },
  { key: "renewing_soon", label: "Renewing soon", params: { renews_within_days: 7 } },
  { key: "trial", label: "Trials", params: { status: "trial" } },
  { key: "auto_renew", label: "Auto-renew", params: { auto_renew: true } },
  {
    key: "review_recommended",
    label: "Needs review",
    params: {},
    reviewStatuses: ["review", "urgent", "trial_attention", "cancel_candidate"],
  },
  { key: "cancelled", label: "Cancelled", params: { status: "cancelled" } },
  { key: "archived", label: "Archived", params: { archived: true } },
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

const STARTER_EXAMPLES = [
  "Netflix",
  "Spotify",
  "iCloud",
  "Canva",
  "Hosting",
  "Domains",
  "Gym",
  "Insurance",
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

function money(amount: string | null, currency: string): string {
  const value = Number(amount);
  if (amount === null || Number.isNaN(value)) return "—";
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
  if (entries.length === 0) return "—";
  return entries.map(([cur, amt]) => money(amt, cur)).join(" · ");
}

function countdown(days: number | null): string {
  if (days === null) return "No date set";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 31) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

function formatDate(value: string | null): string {
  if (!value) return "no date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A single, human, decision-oriented sentence built from the summary.
function buildHeroLine(summary: SubscriptionSummary): string {
  if (summary.active_count === 0) {
    return summary.total_count > 0
      ? "No active subscriptions right now. Add or reactivate one to start tracking renewals."
      : "Start tracking your recurring payments so a renewal never catches you off guard.";
  }
  const parts: string[] = [];
  const monthly = costByCurrency(summary.monthly_cost_by_currency);
  if (monthly !== "—") {
    parts.push(
      `You're spending ${monthly}/month across ${summary.active_count} active subscription${summary.active_count === 1 ? "" : "s"}.`,
    );
  } else {
    parts.push(
      `Tracking ${summary.active_count} active subscription${summary.active_count === 1 ? "" : "s"}.`,
    );
  }
  parts.push(
    summary.renewals_this_week > 0
      ? `${summary.renewals_this_week} ${summary.renewals_this_week === 1 ? "renewal is" : "renewals are"} due this week.`
      : "No renewals are due this week.",
  );
  const next = summary.top_upcoming_renewals[0];
  if (next) {
    parts.push(
      `Your next charge is ${next.name} on ${formatDate(next.next_billing_date)} (${countdown(next.days_until_renewal)}).`,
    );
  }
  return parts.join(" ");
}

// Plain-language insight lines (most useful first). Always returns at least one
// reassuring line when there are active subscriptions, so the panel never feels
// empty or alarming without cause.
function buildInsights(summary: SubscriptionSummary): { text: string; tone: "good" | "warn" | "info" }[] {
  const lines: { text: string; tone: "good" | "warn" | "info" }[] = [];
  const yearly = costByCurrency(summary.yearly_cost_by_currency);
  if (yearly !== "—") {
    lines.push({ text: `You're tracking about ${yearly}/year in subscriptions.`, tone: "info" });
  }
  if (summary.cancellation_deadlines_soon > 0) {
    lines.push({
      text: `${summary.cancellation_deadlines_soon} cancellation deadline${summary.cancellation_deadlines_soon === 1 ? " is" : "s are"} coming up this week.`,
      tone: "warn",
    });
  } else {
    lines.push({ text: "No cancellation deadlines are coming up.", tone: "good" });
  }
  if (summary.trials_ending_soon > 0) {
    lines.push({
      text: `${summary.trials_ending_soon} trial${summary.trials_ending_soon === 1 ? " is" : "s are"} ending soon — decide before they convert.`,
      tone: "warn",
    });
  }
  if (summary.review_recommended_count > 0) {
    lines.push({
      text: `${summary.review_recommended_count} subscription${summary.review_recommended_count === 1 ? "" : "s"} may need a review.`,
      tone: "warn",
    });
  } else if (summary.active_count > 0) {
    lines.push({ text: "Nothing looks like wasted spend right now.", tone: "good" });
  }
  if (summary.cost_unestimable_count > 0) {
    lines.push({
      text: `${summary.cost_unestimable_count} custom-interval subscription${summary.cost_unestimable_count === 1 ? " is" : "s are"} excluded from cost estimates.`,
      tone: "info",
    });
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
  const [compact, setCompact] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function runAction(id: number, fn: () => Promise<unknown>) {
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
  const nextCharge = summary?.top_upcoming_renewals[0] ?? null;

  // Overall posture: are we safe, or is something asking for attention?
  const attentionCount = summary
    ? summary.renewals_this_week +
      summary.cancellation_deadlines_soon +
      summary.trials_ending_soon +
      summary.review_recommended_count
    : 0;
  const needsAttention = attentionCount > 0;

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
    // Pinned subscriptions always float to the top of whatever's shown.
    return pinnedFirst(rows);
  }, [subscriptions, filter, sort]);

  const insights = summary ? buildInsights(summary) : [];
  const hasNoSubs = summary?.total_count === 0;
  const score = summary ? controlScore(summary) : 0;

  // "What am I forgetting?" + savings reflect the full active set, so only show
  // them on the unfiltered default view.
  const onDefaultView = filter === "all" && !search;
  const forgottenChecks =
    onDefaultView && subscriptions ? missingMetadataChecks(subscriptions) : [];
  const savings =
    onDefaultView && subscriptions ? savingsEstimate(subscriptions) : {};
  const savingsText = Object.entries(savings)
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => money(String(v), cur))
    .join(" · ");

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await exportSubscriptionsCsv();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not export your subscriptions.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSubscription(pendingDelete.id);
      setPendingDelete(null);
      loadList();
      loadSummary();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "That subscription could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const archivedView = filter === "archived";

  return (
    <PageContainer width="full" className="space-y-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 [background:radial-gradient(60%_60%_at_85%_0%,rgba(37,99,235,0.07),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
                <Radar className="size-3.5" />
                Subscription Radar
              </span>
              {summary && !hasNoSubs && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <StatusPill needsAttention={needsAttention} count={attentionCount} />
                  <ControlScorePill score={score} />
                </>
              )}
            </div>
            <h1 className="mt-3 text-page-title">Subscriptions</h1>
            {summary ? (
              <p className="mt-2 max-w-2xl text-pretty text-page-subtitle">
                {buildHeroLine(summary)}
              </p>
            ) : (
              <Skeleton className="mt-3 h-5 w-full max-w-2xl rounded-md" />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              DueNest stores renewal dates and reminders only — never full card or
              banking details.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!hasNoSubs && (
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
                title="Export your subscriptions as a CSV (safe fields only)"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export CSV
              </Button>
            )}
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

      {/* Radar cards */}
      {summary ? (
        !hasNoSubs && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RadarCard
              icon={Wallet}
              label="Monthly spend"
              value={costByCurrency(monthly)}
              sub={
                costByCurrency(yearly) !== "—"
                  ? `≈ ${costByCurrency(yearly)} / year`
                  : "Estimated from active plans"
              }
              tone="primary"
            />
            <RadarCard
              icon={CircleDollarSign}
              label="Yearly estimate"
              value={costByCurrency(yearly)}
              sub={
                multiCurrency
                  ? "Grouped by currency"
                  : summary.cost_unestimable_count > 0
                    ? `${summary.cost_unestimable_count} custom excluded`
                    : "Across active subscriptions"
              }
            />
            <RadarCard
              icon={CalendarClock}
              label="Next charge"
              value={nextCharge ? money(nextCharge.amount, nextCharge.currency) : "—"}
              sub={
                nextCharge
                  ? `${nextCharge.name} · ${countdown(nextCharge.days_until_renewal)}`
                  : "Nothing scheduled"
              }
              tone={nextCharge && nextCharge.days_until_renewal <= 7 ? "warn" : "default"}
            />
            <RadarCard
              icon={needsAttention ? AlertTriangle : CheckCircle2}
              label="Needs review"
              value={String(summary.review_recommended_count)}
              sub={
                summary.cancellation_deadlines_soon > 0
                  ? `${summary.cancellation_deadlines_soon} cancel deadline${summary.cancellation_deadlines_soon === 1 ? "" : "s"} soon`
                  : summary.trials_ending_soon > 0
                    ? `${summary.trials_ending_soon} trial${summary.trials_ending_soon === 1 ? "" : "s"} ending`
                    : summary.review_recommended_count > 0
                      ? "Possible wasted spend"
                      : "All clear"
              }
              tone={
                summary.cancellation_deadlines_soon > 0
                  ? "danger"
                  : summary.review_recommended_count > 0
                    ? "warn"
                    : "good"
              }
            />
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Smart insights */}
      {!hasNoSubs && insights.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">What this means</h2>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {insights.map((insight) => (
              <li
                key={insight.text}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              >
                <InsightDot tone={insight.tone} />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What am I forgetting? + savings opportunity */}
      {!hasNoSubs && (forgottenChecks.length > 0 || savingsText) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {forgottenChecks.length > 0 && (
            <section className="rounded-2xl border border-brand-amber/30 bg-brand-amber/[0.04] p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2">
                <HelpCircle className="size-4 text-brand-amber" />
                <h2 className="text-sm font-semibold">What am I forgetting?</h2>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {forgottenChecks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-amber" />
                    {check.text} — add it so reminders stay reliable.
                  </li>
                ))}
              </ul>
            </section>
          )}
          {savingsText && (
            <section className="rounded-2xl border border-brand-success/25 bg-brand-success/[0.04] p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-4 text-brand-success" />
                <h2 className="text-sm font-semibold">Savings opportunity</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                You could save about{" "}
                <span className="font-semibold text-foreground">{savingsText}/month</span>{" "}
                by reviewing the subscriptions flagged as cancel candidates.
              </p>
            </section>
          )}
        </div>
      )}

      {/* Controls — only when the user actually has subscriptions */}
      {!hasNoSubs && (
        <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, provider, or notes…"
              aria-label="Search subscriptions"
              className="lg:max-w-xs"
            />
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
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
                className="h-8 shrink-0 rounded-full border border-input bg-card px-3 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    Sort: {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCompact((v) => !v)}
                aria-pressed={compact}
                title={compact ? "Comfortable view" : "Compact view"}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ClipboardCheck className="size-3.5" />
                {compact ? "Comfortable" : "Compact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List / states */}
      {hasNoSubs ? (
        <FirstSubscriptionState />
      ) : displayed === null ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">No subscriptions match this view.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different filter or clear your search.
          </p>
          {(filter !== "all" || search) && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {displayed.map((sub) => (
            <li key={sub.id}>
              <SubscriptionCard
                subscription={sub}
                busy={busyId === sub.id}
                compact={compact}
                archivedView={archivedView}
                onMarkPaid={() => runAction(sub.id, () => markSubscriptionPaid(sub.id))}
                onReview={() => runAction(sub.id, () => reviewSubscription(sub.id))}
                onTogglePin={() => runAction(sub.id, () => toggleSubscriptionPin(sub.id))}
                onMarkCancelled={() =>
                  runAction(sub.id, () => markSubscriptionCancelled(sub.id))
                }
                onArchive={() => runAction(sub.id, () => archiveSubscription(sub.id))}
                onRestore={() => runAction(sub.id, () => restoreSubscription(sub.id))}
                onRequestDelete={() => setPendingDelete(sub)}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this subscription?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" and its tracking history will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete permanently"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  );
}

function StatusPill({
  needsAttention,
  count,
}: {
  needsAttention: boolean;
  count: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        needsAttention
          ? "border-brand-amber/30 bg-brand-amber/10 text-brand-amber"
          : "border-brand-success/25 bg-brand-success/10 text-brand-success",
      )}
    >
      {needsAttention ? (
        <AlertTriangle className="size-3" />
      ) : (
        <CheckCircle2 className="size-3" />
      )}
      {needsAttention ? `${count} need${count === 1 ? "s" : ""} a look` : "On track"}
    </span>
  );
}

function ControlScorePill({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "border-brand-success/25 bg-brand-success/10 text-brand-success"
      : score >= 60
        ? "border-primary/20 bg-primary/10 text-primary"
        : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
      title={`Control score: ${controlScoreLabel(score)}`}
    >
      <Gauge className="size-3" />
      Control {score}%
    </span>
  );
}

function InsightDot({ tone }: { tone: "good" | "warn" | "info" }) {
  return (
    <span
      className={cn(
        "mt-1.5 size-1.5 shrink-0 rounded-full",
        tone === "good"
          ? "bg-brand-success"
          : tone === "warn"
            ? "bg-brand-amber"
            : "bg-primary",
      )}
    />
  );
}

function RadarCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "primary" | "good" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/[0.045]"
      : tone === "warn"
        ? "border-brand-amber/30 bg-brand-amber/[0.045]"
        : tone === "good"
          ? "border-brand-success/25 bg-brand-success/[0.045]"
          : tone === "primary"
            ? "border-primary/20 bg-primary/[0.035]"
            : "border-border bg-card";
  return (
    <div className={cn("rounded-xl border p-4 shadow-card", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card/70 text-foreground shadow-xs">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold leading-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function SubscriptionCard({
  subscription: sub,
  busy,
  compact,
  archivedView,
  onMarkPaid,
  onReview,
  onTogglePin,
  onMarkCancelled,
  onArchive,
  onRestore,
  onRequestDelete,
}: {
  subscription: Subscription;
  busy: boolean;
  compact: boolean;
  archivedView: boolean;
  onMarkPaid: () => void;
  onReview: () => void;
  onTogglePin: () => void;
  onMarkCancelled: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRequestDelete: () => void;
}) {
  const urgency = URGENCY_BADGE[sub.state.urgency];
  const review = REVIEW_STATUS_META[sub.state.review_status];
  const showCancelWarning = sub.state.cancellation_deadline_soon;
  const canCancel = sub.status === "active" || sub.status === "trial";
  const meta = [sub.provider, sub.category_detail?.name, sub.plan_name]
    .filter(Boolean)
    .join(" · ");
  const action = sub.state.next_best_action?.trim();
  const showAction =
    !compact &&
    !!action &&
    (review?.show || showCancelWarning || sub.state.trial_ending_soon);
  const overdue = sub.state.urgency === "overdue";

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card shadow-card transition-all duration-200 ease-out hover:border-primary/30 hover:shadow-elevated motion-reduce:transition-none",
        sub.pinned ? "border-primary/30" : "border-border",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Identity + status */}
        <Link
          href={`/dashboard/subscriptions/${sub.id}`}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground",
              compact ? "size-9 text-xs" : "size-11 text-sm",
            )}
            aria-hidden
          >
            {initials(sub.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {sub.pinned && (
                <Pin
                  className="size-3.5 shrink-0 fill-primary text-primary"
                  aria-label="Pinned"
                />
              )}
              <p className="truncate text-sm font-semibold">{sub.name}</p>
              <Badge variant="outline" className={urgency.chip}>
                {urgency.label}
              </Badge>
              {sub.auto_renew && (
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/10 text-primary"
                >
                  Auto-renew
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-border bg-muted text-muted-foreground"
              >
                {STATUS_LABELS[sub.status] ?? sub.status}
              </Badge>
              {sub.cancel_candidate && (
                <Badge
                  variant="outline"
                  className="border-brand-amber/30 bg-brand-amber/10 text-brand-amber"
                >
                  Cancel candidate
                </Badge>
              )}
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
              {meta || "Subscription"}
            </p>
            {showAction && (
              <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs font-medium text-foreground/80">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
                {action}
              </p>
            )}
            {!compact && showCancelWarning && sub.cancellation_deadline && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3" />
                Cancel by {formatDate(sub.cancellation_deadline)}
              </p>
            )}
          </div>
        </Link>

        {/* Price + timing + actions */}
        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:gap-6 lg:border-t-0 lg:pt-0">
          <div className="flex items-center justify-between gap-6 sm:justify-start">
            <div>
              <p className="text-sm font-semibold tabular-nums">
                {money(sub.amount, sub.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle}
              </p>
            </div>
            <div className="text-right sm:text-left">
              <p className="text-xs font-medium tabular-nums">
                {sub.next_billing_date ? formatDate(sub.next_billing_date) : "No date"}
              </p>
              <p
                className={cn(
                  "text-xs",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {countdown(sub.state.days_until_renewal)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {archivedView ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRestore}
                  disabled={busy}
                  title="Move this subscription back to your active list"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Restore"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRequestDelete}
                  disabled={busy}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onTogglePin}
                  disabled={busy}
                  aria-pressed={sub.pinned}
                  aria-label={sub.pinned ? `Unpin ${sub.name}` : `Pin ${sub.name}`}
                  title={sub.pinned ? "Unpin" : "Pin to top"}
                  className={sub.pinned ? "text-primary" : "text-muted-foreground"}
                >
                  <Pin className={cn("size-4", sub.pinned && "fill-current")} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMarkPaid}
                  disabled={busy}
                  title="Log a payment and roll the renewal date forward"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Mark paid"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReview}
                  disabled={busy}
                  className="text-muted-foreground"
                  title="Mark as reviewed"
                >
                  Review
                </Button>
                <Link
                  href={`/dashboard/subscriptions/${sub.id}/edit`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
                  aria-label={`Edit ${sub.name}`}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Link>
                {canCancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkCancelled}
                    disabled={busy}
                    className="text-muted-foreground"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onArchive}
                  disabled={busy}
                  className="text-muted-foreground"
                >
                  Archive
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FirstSubscriptionState() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="relative px-6 py-10 text-center sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 [background:radial-gradient(50%_70%_at_50%_0%,rgba(37,99,235,0.08),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-md">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Radar className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            Put your recurring payments on the radar
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Add your subscriptions and DueNest watches the renewal dates, trial
            endings, and cancellation deadlines — so you never silently lose money
            or miss the window to cancel.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            {STARTER_EXAMPLES.map((example) => (
              <span
                key={example}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {example}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link
              href="/dashboard/subscriptions/new"
              className={cn(buttonVariants(), "w-full sm:w-auto")}
            >
              <Plus className="size-4" />
              Add your first subscription
            </Link>
            <Link
              href="/dashboard/calendar"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-auto",
              )}
            >
              <CalendarDays className="size-4" />
              Open Calendar
            </Link>
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <SearchCheck className="size-3.5" />
            DueNest stores renewal dates and reminders only — never card details.
          </p>
        </div>
      </div>
    </div>
  );
}
