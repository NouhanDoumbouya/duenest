"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  asArray,
  createPromoCode,
  formatMoney,
  getAdminPromoCodes,
  getBillingOverview,
  getSubscribers,
} from "@/lib/billing";
import type {
  BillingOverview,
  PromoCodeAdmin,
  Subscriber,
} from "@/types/billing";

export default function FounderBillingPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [promos, setPromos] = useState<PromoCodeAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reloadPromos() {
    getAdminPromoCodes()
      .then((d) => setPromos(asArray(d)))
      .catch(() => {});
  }

  useEffect(() => {
    getBillingOverview()
      .then(setOverview)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Unable to load billing."),
      );
    getSubscribers()
      .then((d) => setSubscribers(asArray(d)))
      .catch(() => {});
    reloadPromos();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribers, revenue estimates, promo codes, and manual access.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Overview metrics */}
      {overview === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="Pro users" value={overview.pro_users} />
            <Metric label="Free users" value={overview.free_users} />
            <Metric label="Paid subscriptions" value={overview.active_paid_subscriptions} />
            <Metric label="Trialing" value={overview.trialing} />
            <Metric label="Past due" value={overview.past_due} />
            <Metric label="Canceled" value={overview.canceled} />
            <Metric
              label="MRR (est.)"
              value={formatMoney(overview.mrr_estimate_minor)}
            />
            <Metric
              label="ARR (est.)"
              value={formatMoney(overview.arr_estimate_minor)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{overview.estimate_note}</p>
        </>
      )}

      {/* Promo manager */}
      <PromoManager promos={promos} onCreated={reloadPromos} />

      {/* Subscribers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subscribers</CardTitle>
          <CardDescription>{subscribers.length} subscription records.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">User</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Interval</th>
                    <th className="py-2 font-medium">Renews</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="py-2 pr-4">{s.user_email}</td>
                      <td className="py-2 pr-4">{s.plan_key}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary">{s.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">{s.billing_interval}</td>
                      <td className="py-2 text-muted-foreground">
                        {s.current_period_end
                          ? new Date(s.current_period_end).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PromoManager({
  promos,
  onCreated,
}: {
  promos: PromoCodeAdmin[];
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !percent) {
      setFormError("Enter a code and a percentage.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createPromoCode({
        code: code.trim(),
        promo_type: "percentage_discount",
        percent_off: Number(percent),
      });
      setCode("");
      setPercent("");
      onCreated();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not create the code.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Promo codes</CardTitle>
        <CardDescription>
          Create percentage codes. Full code types are available via the API/admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="FOUNDER50"
              className="h-10 w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-percent">% off</Label>
            <Input
              id="promo-percent"
              type="number"
              min={1}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="h-10 w-24"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </form>
        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        {promos.length > 0 && (
          <ul className="divide-y divide-border/60 text-sm">
            {promos.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="font-mono">{p.code}</span>
                <span className="text-muted-foreground">
                  {p.percent_off ? `${p.percent_off}% off` : p.promo_type} ·{" "}
                  {p.redemption_count} used
                </span>
                <Badge variant={p.is_active ? "secondary" : "outline"}>
                  {p.is_active ? "Active" : "Inactive"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
