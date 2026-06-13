"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  createRenewalEvent,
  deleteRenewalEvent,
  getRenewalEvents,
} from "@/lib/renewal-events";
import { formatMoney } from "@/lib/payments";
import type { RenewalEvent } from "@/types/renewal-events";

const EMPTY = {
  renewal_date: "",
  previous_expiry_date: "",
  new_expiry_date: "",
  cost: "",
  currency: "GBP",
  notes: "",
};

export function DocumentRenewalHistory({ documentId }: { documentId: number }) {
  const [events, setEvents] = useState<RenewalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getRenewalEvents(documentId)
      .then((page) => active && setEvents(page.results))
      .catch((err) => {
        if (!active) return;
        setEvents([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load renewal history.",
        );
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.renewal_date) {
      setError("Set the renewal date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createRenewalEvent(documentId, {
        renewal_date: draft.renewal_date,
        previous_expiry_date: draft.previous_expiry_date || null,
        new_expiry_date: draft.new_expiry_date || null,
        cost: draft.cost.trim() || null,
        currency: draft.currency.trim(),
        notes: draft.notes.trim(),
      });
      setEvents((prev) => [created, ...(prev ?? [])]);
      setDraft({ ...EMPTY });
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save the renewal.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: RenewalEvent) {
    setPendingId(item.id);
    try {
      await deleteRenewalEvent(documentId, item.id);
      setEvents((prev) => (prev ?? []).filter((e) => e.id !== item.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the renewal.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Keep a history of past renewals — when they happened, what changed, and
          what they cost.
        </p>
        <Button
          variant={showForm ? "outline" : "default"}
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="size-4" />
          {showForm ? "Close" : "Add renewal"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-border bg-muted/25 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="re-date">Renewal date</Label>
              <Input id="re-date" type="date" className="h-10" value={draft.renewal_date}
                onChange={(e) => setDraft({ ...draft, renewal_date: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="re-prev">Previous expiry</Label>
              <Input id="re-prev" type="date" className="h-10" value={draft.previous_expiry_date}
                onChange={(e) => setDraft({ ...draft, previous_expiry_date: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="re-new">New expiry</Label>
              <Input id="re-new" type="date" className="h-10" value={draft.new_expiry_date}
                onChange={(e) => setDraft({ ...draft, new_expiry_date: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="re-cost">Cost</Label>
              <Input id="re-cost" type="number" min="0" step="0.01" className="h-10" value={draft.cost}
                onChange={(e) => setDraft({ ...draft, cost: e.target.value })} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="re-currency">Currency</Label>
              <Input id="re-currency" className="h-10" maxLength={3} value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} placeholder="GBP" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="re-notes">Notes</Label>
            <Textarea id="re-notes" value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="What changed, where you renewed…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save renewal
            </Button>
          </div>
        </form>
      )}

      {events === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading history…</span>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <History className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No renewal history yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Record a renewal to build a timeline of how this document has changed.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-5">
          {events.map((item) => (
            <li key={item.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" />
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Renewed {formatDate(item.renewal_date)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.previous_expiry_date && `Was ${formatDate(item.previous_expiry_date)}`}
                    {item.new_expiry_date && ` → now ${formatDate(item.new_expiry_date)}`}
                    {formatMoney(item.cost, item.currency) && ` · ${formatMoney(item.cost, item.currency)}`}
                  </p>
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(item)} disabled={pendingId === item.id} aria-label="Delete renewal">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
