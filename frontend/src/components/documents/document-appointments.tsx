"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  APPOINTMENT_STATUS_LABELS,
  createAppointment,
  deleteAppointment,
  getAppointments,
  updateAppointment,
} from "@/lib/appointments";
import { cn } from "@/lib/utils";
import type {
  Appointment,
  AppointmentStatus,
  CreateAppointmentRequest,
} from "@/types/appointments";

const STATUS_OPTIONS = Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[];

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-brand-success/10 text-brand-success",
  cancelled: "bg-muted text-muted-foreground",
  missed: "bg-destructive/10 text-destructive",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DocumentAppointments({
  documentId,
  bundleId,
}: {
  documentId?: number;
  bundleId?: number;
}) {
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [location, setLocation] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getAppointments({ document: documentId, bundle: bundleId })
      .then((page) => active && setItems(page.results))
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load appointments.",
        );
      });
    return () => {
      active = false;
    };
  }, [documentId, bundleId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !at) {
      setError("Add a title and date/time.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CreateAppointmentRequest = {
      title: title.trim(),
      appointment_at: new Date(at).toISOString(),
      location: location.trim(),
      reference_number: reference.trim(),
      notes: notes.trim(),
      ...(documentId ? { document: documentId } : {}),
      ...(bundleId ? { bundle: bundleId } : {}),
    };
    try {
      const created = await createAppointment(payload);
      setItems((prev) =>
        [...(prev ?? []), created].sort((a, b) =>
          a.appointment_at.localeCompare(b.appointment_at),
        ),
      );
      setTitle("");
      setAt("");
      setLocation("");
      setReference("");
      setNotes("");
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save the appointment.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(item: Appointment, status: AppointmentStatus) {
    setPendingId(item.id);
    try {
      const updated = await updateAppointment(item.id, { status });
      setItems((prev) => (prev ?? []).map((a) => (a.id === item.id ? updated : a)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(item: Appointment) {
    setPendingId(item.id);
    try {
      await deleteAppointment(item.id);
      setItems((prev) => (prev ?? []).filter((a) => a.id !== item.id));
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
          Track appointments — biometrics, interviews, notary visits — tied to
          this {bundleId ? "bundle" : "document"}.
        </p>
        <Button variant={showForm ? "outline" : "default"} size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" />
          {showForm ? "Close" : "Add appointment"}
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
            <Label htmlFor="ap-title">Title</Label>
            <Input id="ap-title" className="h-10" value={title}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Biometrics appointment" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ap-at">Date &amp; time</Label>
              <Input id="ap-at" type="datetime-local" className="h-10" value={at}
                onChange={(e) => setAt(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ap-loc">Location</Label>
              <Input id="ap-loc" className="h-10" value={location}
                onChange={(e) => setLocation(e.target.value)} placeholder="Where" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ap-ref">Reference number</Label>
              <Input id="ap-ref" className="h-10" value={reference}
                onChange={(e) => setReference(e.target.value)} placeholder="Booking reference" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ap-notes">Notes</Label>
            <Textarea id="ap-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What to bring, who to ask for…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save appointment
            </Button>
          </div>
        </form>
      )}

      {items === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading appointments…</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No appointments yet"
          description="Add one to track biometrics, interviews, notary visits, and other important dates — it shows up on your timeline."
          action={
            !showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="size-4" />
                Add appointment
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {formatDateTime(item.appointment_at)}
                    {item.location && (
                      <>
                        <MapPin className="ml-1 size-3.5" />
                        {item.location}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[item.status])}>
                    {APPOINTMENT_STATUS_LABELS[item.status]}
                  </span>
                  <select aria-label="Update appointment status"
                    className="h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={item.status} disabled={pendingId === item.id}
                    onChange={(e) => handleStatus(item, e.target.value as AppointmentStatus)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(item)} disabled={pendingId === item.id} aria-label="Delete appointment">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {item.reference_number && (
                <p className="text-xs text-muted-foreground">Ref: {item.reference_number}</p>
              )}
              {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
