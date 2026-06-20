"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  Loader2,
  Sparkles,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanUsageCard } from "@/components/dashboard/plan-usage-card";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import { ApiError } from "@/lib/api";
import {
  asArray,
  cancelSubscription,
  formatMoney,
  getBillingStatus,
  getInvoices,
  openBillingPortal,
  resumeSubscription,
} from "@/lib/billing";
import { formatDate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { BillingStatus, InvoiceRecord } from "@/types/billing";

export default function BillingSettingsPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);

  const load = useCallback(() => {
    getBillingStatus()
      .then(setStatus)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Unable to load billing."),
      );
    getInvoices()
      .then((d) => setInvoices(asArray(d)))
      .catch(() => setInvoices([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function manageBilling() {
    setBusy(true);
    setError(null);
    try {
      const { portal_url } = await openBillingPortal();
      window.location.href = portal_url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not open the billing portal.",
      );
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    try {
      setStatus(await cancelSubscription());
      setConfirmCancel(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  async function doResume() {
    setBusy(true);
    try {
      setStatus(await resumeSubscription());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resume.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Settings
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Plan &amp; Billing
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manage your DueNest plan, payment, and usage. Your documents are never
          deleted if you downgrade.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {status === null ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          {/* Past-due / grace banner */}
          {(status.status === "past_due" || status.status === "grace_period") && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">Payment issue</p>
                <p className="text-muted-foreground">
                  We could not process your payment. Your Pro features remain
                  active during the grace period
                  {status.grace_period_until &&
                    ` (until ${formatDate(status.grace_period_until)})`}
                  . Update your payment method to keep Pro active.
                </p>
              </div>
            </div>
          )}

          {/* Current plan */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-lg">{status.plan_name}</CardTitle>
                <Badge
                  className={cn(
                    status.is_pro
                      ? "bg-brand-success/10 text-brand-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {status.is_pro ? "Active" : "Free"}
                </Badge>
                {status.manual_access && (
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <BadgeCheck className="size-3.5" />
                    {status.manual_access.status === "founder"
                      ? "Founder access"
                      : status.manual_access.status === "beta"
                        ? "Beta access"
                        : "Manual access"}
                  </span>
                )}
              </div>
              <CardDescription>{status.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {status.amount > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Price</dt>
                    <dd className="font-medium">
                      {formatMoney(status.amount, status.currency)} /{" "}
                      {status.billing_interval === "year" ? "year" : "month"}
                    </dd>
                  </div>
                )}
                {status.current_period_end && (
                  <div>
                    <dt className="text-muted-foreground">
                      {status.cancel_at_period_end ? "Active until" : "Renews on"}
                    </dt>
                    <dd className="font-medium">
                      {formatDate(status.current_period_end)}
                    </dd>
                  </div>
                )}
                {status.trial_end && (
                  <div>
                    <dt className="text-muted-foreground">Trial ends</dt>
                    <dd className="font-medium">{formatDate(status.trial_end)}</dd>
                  </div>
                )}
                {status.active_promo_code && (
                  <div>
                    <dt className="text-muted-foreground">Promo</dt>
                    <dd className="font-medium">{status.active_promo_code}</dd>
                  </div>
                )}
              </dl>

              {status.cancel_at_period_end && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Your plan is canceled but stays active until the date above.
                  Your documents will not be deleted.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {status.is_free ? (
                  <Button onClick={() => setShowUpgrade(true)}>
                    <Sparkles className="size-4" />
                    Upgrade to Pro
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={manageBilling} disabled={busy}>
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      Manage billing
                    </Button>
                    {status.cancel_at_period_end ? (
                      <Button variant="outline" onClick={doResume} disabled={busy}>
                        Resume plan
                      </Button>
                    ) : (
                      !status.manual_access && (
                        <Button
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmCancel(true)}
                          disabled={busy}
                        >
                          Cancel plan
                        </Button>
                      )
                    )}
                  </>
                )}
              </div>
              {status.test_mode && (
                <p className="text-xs text-muted-foreground">
                  Billing is in test mode ({status.provider}).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Usage meters */}
          <PlanUsageCard />

          {/* Invoice history */}
          {invoices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Billing history</CardTitle>
                <CardDescription>Your recent invoices.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border/60 text-sm">
                  {invoices.map((inv) => (
                    <li
                      key={inv.provider_invoice_id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {inv.paid_at
                          ? formatDate(inv.paid_at)
                          : formatDate(inv.created_at)}
                        {inv.receipt_number && (
                          <span className="ml-2 text-xs text-muted-foreground/70">
                            {inv.receipt_number}
                          </span>
                        )}
                      </span>
                      <span className="font-medium">
                        {formatMoney(inv.amount_paid || inv.amount_due, inv.currency)}
                      </span>
                      <span className="capitalize text-muted-foreground">
                        {inv.status || "—"}
                      </span>
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => {
          setShowUpgrade(false);
          load();
        }}
      />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel your plan?"
        description="Your plan will stay active until the end of the current period. Your documents will not be deleted."
        confirmLabel="Cancel plan"
        cancelLabel="Keep plan"
        loading={busy}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
