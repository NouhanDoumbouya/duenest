"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  Loader2,
  Pencil,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert, StatusDot } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  BILLING_CYCLE_LABELS,
  IMPORTANCE_LABELS,
  STATUS_LABELS,
  createSubscriptionPayment,
  deleteSubscription,
  getSubscription,
  listSubscriptionPayments,
  markSubscriptionCancelled,
  markSubscriptionPaid,
  skipNextRenewal,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import type {
  Subscription,
  SubscriptionPaymentRecord,
} from "@/types/subscriptions";

type Tab = "overview" | "payments" | "reminders" | "activity";

function money(amount: string | null, currency: string): string {
  if (amount === null) return "—";
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

function countdown(days: number | null): string {
  if (days === null) return "No date set";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Renews today";
  if (days === 1) return "Renews tomorrow";
  return `Renews in ${days} days`;
}

export default function SubscriptionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    getSubscription(id)
      .then((data) => {
        setSub(data);
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Could not load this subscription.",
        );
        setSub(null);
      });
  }, [id]);

  useEffect(() => {
    if (validId) load();
  }, [validId, load]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "That action could not complete.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteSubscription(id);
      router.push("/dashboard/subscriptions");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete this subscription.",
      );
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (!validId) {
    return (
      <PageContainer width="default" className="space-y-4">
        <BackLink />
        <InlineAlert>This subscription could not be found.</InlineAlert>
      </PageContainer>
    );
  }

  if (error && !sub) {
    return (
      <PageContainer width="default" className="space-y-4">
        <BackLink />
        <InlineAlert>{error}</InlineAlert>
      </PageContainer>
    );
  }

  if (!sub) {
    return (
      <PageContainer width="full" className="space-y-4">
        <BackLink />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </PageContainer>
    );
  }

  const canCancel = sub.status === "active" || sub.status === "trial";

  return (
    <PageContainer width="full" className="space-y-6">
      <BackLink />
      {error && <InlineAlert>{error}</InlineAlert>}

      <header className="rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                {STATUS_LABELS[sub.status] ?? sub.status}
              </Badge>
              {sub.auto_renew && (
                <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                  Auto-renew
                </Badge>
              )}
              {sub.category_detail && (
                <Badge variant="outline" className="border-border bg-card text-muted-foreground">
                  {sub.category_detail.name}
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-page-title">{sub.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[sub.provider, sub.plan_name].filter(Boolean).join(" · ") || "Subscription"}
            </p>
            <p className="mt-3 text-lg font-semibold">
              {money(sub.amount, sub.currency)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle}
              </span>
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                sub.state.urgency === "overdue" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {countdown(sub.state.days_until_renewal)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/dashboard/subscriptions/${id}/edit`}
              className={cn(buttonVariants())}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            <Button variant="outline" disabled={busy} onClick={() => runAction(() => markSubscriptionPaid(id))}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Mark paid
            </Button>
            {canCancel && (
              <Button variant="outline" disabled={busy} onClick={() => runAction(() => markSubscriptionCancelled(id))}>
                Mark cancelled
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-card">
            {(["overview", "payments", "reminders", "activity"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  "flex-1 rounded-xl px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>

          {tab === "overview" && <OverviewTab sub={sub} />}
          {tab === "payments" && (
            <PaymentsTab
              sub={sub}
              onChanged={() => {
                load();
              }}
            />
          )}
          {tab === "reminders" && <RemindersTab sub={sub} />}
          {tab === "activity" && <ActivityTab sub={sub} />}
        </main>

        <DetailRail sub={sub} busy={busy} onSkip={() => runAction(() => skipNextRenewal(id))} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this subscription?"
        description="This permanently removes the subscription and its payment history. This cannot be undone. To keep the record, archive it instead."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </PageContainer>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/subscriptions"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" />
      Subscriptions
    </Link>
  );
}

function OverviewTab({ sub }: { sub: Subscription }) {
  return (
    <div className="space-y-4">
      {sub.auto_renew && sub.state.cancellation_deadline_soon && (
        <InlineAlert>
          This subscription auto-renews and its cancellation deadline is within 7
          days. Cancel by {sub.cancellation_deadline} to avoid the next charge.
        </InlineAlert>
      )}
      <Panel title="Billing details">
        <DataRow label="Amount" value={money(sub.amount, sub.currency)} />
        <DataRow label="Billing cycle" value={BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle} />
        {sub.billing_cycle === "custom" && (
          <DataRow
            label="Custom interval"
            value={`Every ${sub.custom_interval_count ?? "?"} ${sub.custom_interval_unit || ""}`}
          />
        )}
        <DataRow label="Start date" value={sub.start_date ?? "—"} />
        <DataRow label="Next billing date" value={sub.next_billing_date ?? "—"} />
        <DataRow label="Payment method" value={sub.payment_method_label || "—"} />
      </Panel>
      <Panel title="Provider & account">
        <DataRow label="Provider" value={sub.provider || "—"} />
        <DataRow label="Plan" value={sub.plan_name || "—"} />
        <DataRow label="Account email" value={sub.account_email || "—"} />
        <DataRow
          label="Website"
          value={
            sub.website_url ? (
              <a href={sub.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {sub.website_url}
              </a>
            ) : (
              "—"
            )
          }
        />
      </Panel>
      <Panel title="Cancellation">
        <DataRow label="Cancellation deadline" value={sub.cancellation_deadline ?? "—"} />
        <DataRow label="Auto-renew" value={sub.auto_renew ? "On" : "Off"} />
      </Panel>
      {sub.notes && (
        <Panel title="Notes">
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{sub.notes}</p>
        </Panel>
      )}
    </div>
  );
}

function PaymentsTab({ sub, onChanged }: { sub: Subscription; onChanged: () => void }) {
  const [payments, setPayments] = useState<SubscriptionPaymentRecord[] | null>(null);
  const [amount, setAmount] = useState(sub.amount);
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    listSubscriptionPayments(sub.id)
      .then(setPayments)
      .catch(() => setPayments([]));
  }, [sub.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addPayment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await createSubscriptionPayment(sub.id, { amount, paid_on: paidOn });
      reload();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not log this payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Log a payment">
        <form onSubmit={addPayment} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Paid on</label>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Log payment
          </Button>
        </form>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Receipt file uploads are not available in this version — payment records
          are metadata only.
        </p>
      </Panel>

      <Panel title="Payment history">
        {payments === null ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium tabular-nums">{money(p.amount, p.currency)}</span>
                <span className="text-muted-foreground">{p.paid_on}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function RemindersTab({ sub }: { sub: Subscription }) {
  return (
    <div className="space-y-4">
      <Panel title="In-app reminders">
        <DataRow label="Reminder lead time" value={`${sub.reminder_days_before} days before renewal`} />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          DueNest surfaces this renewal in your Calendar and Timeline ahead of the
          billing date. Reminders are in-app only in this version — there is no
          email or push delivery yet.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/dashboard/calendar" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <CalendarDays className="size-4" />
            Open Calendar
          </Link>
          <Link href="/dashboard/timeline" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <CalendarClock className="size-4" />
            Open Timeline
          </Link>
        </div>
      </Panel>
    </div>
  );
}

function ActivityTab({ sub }: { sub: Subscription }) {
  const items = [
    { label: "Created", value: new Date(sub.created_at).toLocaleString() },
    { label: "Last updated", value: new Date(sub.updated_at).toLocaleString() },
  ];
  if (sub.archived_at) {
    items.push({ label: "Archived", value: new Date(sub.archived_at).toLocaleString() });
  }
  return (
    <Panel title="Activity">
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium">{item.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Activity is derived from record timestamps and logged payments in this
        version. See the Payments tab for the full payment history.
      </p>
    </Panel>
  );
}

function DetailRail({
  sub,
  busy,
  onSkip,
}: {
  sub: Subscription;
  busy: boolean;
  onSkip: () => void;
}) {
  const valueWarnings: string[] = [];
  if (sub.importance === "rarely_used") valueWarnings.push("Marked rarely used");
  if (sub.auto_renew && sub.state.urgency === "renews_soon")
    valueWarnings.push("Auto-renewing soon");
  if (sub.state.yearly_equivalent && Number(sub.state.yearly_equivalent) >= 500)
    valueWarnings.push("High yearly cost");

  return (
    <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
      <Panel title="At a glance">
        <DataRow label="Next billing" value={sub.next_billing_date ?? "—"} />
        <DataRow label="Cancellation deadline" value={sub.cancellation_deadline ?? "—"} />
        <DataRow label="Auto-renew" value={sub.auto_renew ? "On" : "Off"} />
        <DataRow
          label="Monthly equivalent"
          value={money(sub.state.monthly_equivalent, sub.currency)}
        />
        <DataRow
          label="Yearly equivalent"
          value={money(sub.state.yearly_equivalent, sub.currency)}
        />
        <DataRow label="Last used" value={sub.last_used_date ?? "—"} />
        <DataRow label="Importance" value={IMPORTANCE_LABELS[sub.importance] ?? sub.importance} />
      </Panel>

      {valueWarnings.length > 0 && (
        <Panel title="Worth a look">
          <ul className="space-y-1.5">
            {valueWarnings.map((w) => (
              <li key={w} className="flex items-center gap-2 text-sm text-brand-amber">
                <AlertTriangle className="size-3.5" />
                {w}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Next best action">
        <p className="text-sm text-muted-foreground">{nextBestAction(sub)}</p>
        {sub.next_billing_date && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onSkip} disabled={busy}>
            Skip next renewal
          </Button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusDot tone="secure" label="Owner-scoped" />
          <StatusDot tone="good" label="No card details stored" />
        </div>
      </Panel>
    </aside>
  );
}

function nextBestAction(sub: Subscription): string {
  if (sub.state.urgency === "overdue")
    return "This renewal date has passed. Mark it paid or update the next billing date.";
  if (sub.state.cancellation_deadline_soon)
    return "The cancellation deadline is close. Decide whether to keep or cancel before it renews.";
  if (sub.state.trial_ending_soon)
    return "Your trial is ending soon. Confirm whether you want it to convert to a paid plan.";
  if (sub.status === "cancelled")
    return "This subscription is cancelled. Archive it to tidy your list, or restore it if it's still active.";
  return "Review the renewal date and confirm the cost still looks right.";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
