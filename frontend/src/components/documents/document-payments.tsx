"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  PAYMENT_STATUS_LABELS,
  createPayment,
  deletePayment,
  formatMoney,
  getPayments,
  updatePayment,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import type {
  CreatePaymentRequest,
  Payment,
  PaymentStatus,
} from "@/types/payments";

const STATUS_OPTIONS = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

const STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-brand-success/10 text-brand-success",
  refunded: "bg-muted text-muted-foreground",
  waived: "bg-muted text-muted-foreground",
};

export function DocumentPayments({
  documentId,
  bundleId,
}: {
  documentId?: number;
  bundleId?: number;
}) {
  const [items, setItems] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    expected_cost: "",
    actual_cost: "",
    currency: "GBP",
    payment_status: "pending" as PaymentStatus,
    payment_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getPayments({ document: documentId, bundle: bundleId })
      .then((page) => active && setItems(page.results))
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(err instanceof ApiError ? err.message : "Unable to load costs.");
      });
    return () => {
      active = false;
    };
  }, [documentId, bundleId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.label.trim()) {
      setError("Add a short label.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CreatePaymentRequest = {
      label: draft.label.trim(),
      expected_cost: draft.expected_cost.trim() || null,
      actual_cost: draft.actual_cost.trim() || null,
      currency: draft.currency.trim(),
      payment_status: draft.payment_status,
      payment_date: draft.payment_date || null,
      notes: draft.notes.trim(),
      ...(documentId ? { document: documentId } : {}),
      ...(bundleId ? { bundle: bundleId } : {}),
    };
    try {
      const created = await createPayment(payload);
      setItems((prev) => [created, ...(prev ?? [])]);
      setDraft({
        label: "",
        expected_cost: "",
        actual_cost: "",
        currency: "GBP",
        payment_status: "pending",
        payment_date: "",
        notes: "",
      });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the cost.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(item: Payment, payment_status: PaymentStatus) {
    setPendingId(item.id);
    try {
      const updated = await updatePayment(item.id, { payment_status });
      setItems((prev) => (prev ?? []).map((p) => (p.id === item.id ? updated : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(item: Payment) {
    setPendingId(item.id);
    try {
      await deletePayment(item.id);
      setItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Track expected and actual renewal or application costs.
        </p>
        <Button variant={showForm ? "outline" : "default"} size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" />
          {showForm ? "Close" : "Add cost"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-border bg-muted/25 p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pay-label">Label</Label>
            <Input id="pay-label" className="h-10" value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. Passport renewal fee" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-expected">Expected cost</Label>
              <Input id="pay-expected" type="number" min="0" step="0.01" className="h-10"
                value={draft.expected_cost} onChange={(e) => setDraft({ ...draft, expected_cost: e.target.value })}
                placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-actual">Actual cost</Label>
              <Input id="pay-actual" type="number" min="0" step="0.01" className="h-10"
                value={draft.actual_cost} onChange={(e) => setDraft({ ...draft, actual_cost: e.target.value })}
                placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-currency">Currency</Label>
              <Input id="pay-currency" className="h-10" maxLength={3} value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} placeholder="GBP" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-status">Status</Label>
              <select id="pay-status"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={draft.payment_status}
                onChange={(e) => setDraft({ ...draft, payment_status: e.target.value as PaymentStatus })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input id="pay-date" type="date" className="h-10" value={draft.payment_date}
                onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea id="pay-notes" value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save cost
            </Button>
          </div>
        </form>
      )}

      {items === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading costs…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <Receipt className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No costs tracked yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add a cost to budget for and track renewal or application fees.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatMoney(item.actual_cost, item.currency)
                      ? `Paid ${formatMoney(item.actual_cost, item.currency)}`
                      : formatMoney(item.expected_cost, item.currency)
                        ? `Expected ${formatMoney(item.expected_cost, item.currency)}`
                        : "No amount set"}
                    {item.payment_date && ` · ${formatDate(item.payment_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[item.payment_status])}>
                    {PAYMENT_STATUS_LABELS[item.payment_status]}
                  </span>
                  <select aria-label="Update payment status"
                    className="h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={item.payment_status} disabled={pendingId === item.id}
                    onChange={(e) => handleStatus(item, e.target.value as PaymentStatus)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(item)} disabled={pendingId === item.id} aria-label="Delete cost">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
