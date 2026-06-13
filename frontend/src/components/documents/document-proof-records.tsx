"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import type { Paginated } from "@/types/documents";
import {
  PROOF_STATUS_LABELS,
  PROOF_TYPE_LABELS,
  createProofRecord,
  deleteProofRecord,
  getBundleProofRecords,
  getDocumentProofRecords,
  updateProofRecord,
} from "@/lib/proof";
import { cn } from "@/lib/utils";
import type {
  CreateProofRecordRequest,
  ProofRecord,
  ProofStatus,
  ProofType,
} from "@/types/proof";

const TYPE_OPTIONS = Object.keys(PROOF_TYPE_LABELS) as ProofType[];
const STATUS_OPTIONS = Object.keys(PROOF_STATUS_LABELS) as ProofStatus[];

const STATUS_STYLES: Record<ProofStatus, string> = {
  saved: "bg-muted text-muted-foreground",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-brand-success/10 text-brand-success",
  rejected: "bg-destructive/10 text-destructive",
  needs_follow_up: "bg-amber-100 text-amber-700",
  archived: "bg-muted text-muted-foreground",
};

interface DraftState {
  title: string;
  proof_type: ProofType;
  status: ProofStatus;
  reference_number: string;
  submitted_to: string;
  submitted_at: string;
  notes: string;
}

const EMPTY_DRAFT: DraftState = {
  title: "",
  proof_type: "submission_confirmation",
  status: "saved",
  reference_number: "",
  submitted_to: "",
  submitted_at: "",
  notes: "",
};

/**
 * Proof-of-submission records for a document or a bundle. Pass exactly one of
 * `documentId` / `bundleId`; new proof is linked to that owner-owned object.
 */
export function DocumentProofRecords({
  documentId,
  bundleId,
}: {
  documentId?: number;
  bundleId?: number;
}) {
  const [records, setRecords] = useState<ProofRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const loader: Promise<Paginated<ProofRecord>> = documentId
      ? getDocumentProofRecords(documentId)
      : bundleId
        ? getBundleProofRecords(bundleId)
        : Promise.resolve({ count: 0, next: null, previous: null, results: [] });
    loader
      .then((page) => active && setRecords(page.results))
      .catch((err) => {
        if (!active) return;
        setRecords([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load proof records.",
        );
      });
    return () => {
      active = false;
    };
  }, [documentId, bundleId]);

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("Give the proof a short title.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CreateProofRecordRequest = {
      title: draft.title.trim(),
      proof_type: draft.proof_type,
      status: draft.status,
      reference_number: draft.reference_number.trim(),
      submitted_to: draft.submitted_to.trim(),
      submitted_at: draft.submitted_at ? `${draft.submitted_at}T00:00:00Z` : null,
      notes: draft.notes.trim(),
      ...(documentId ? { document: documentId } : {}),
      ...(bundleId ? { bundle: bundleId } : {}),
    };
    try {
      const created = await createProofRecord(payload);
      setRecords((prev) => [created, ...(prev ?? [])]);
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save the proof record.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(record: ProofRecord, status: ProofStatus) {
    setPendingId(record.id);
    setError(null);
    try {
      const updated = await updateProofRecord(record.id, { status });
      setRecords((prev) =>
        (prev ?? []).map((r) => (r.id === record.id ? updated : r)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update the proof.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(record: ProofRecord) {
    setPendingId(record.id);
    setError(null);
    try {
      await deleteProofRecord(record.id);
      setRecords((prev) => (prev ?? []).filter((r) => r.id !== record.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the proof.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Keep submission confirmations, receipts, and tracking numbers so you
          can prove what you sent and when.
        </p>
        <Button
          variant={showForm ? "outline" : "default"}
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="size-4" />
          {showForm ? "Close" : "Add proof"}
        </Button>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-border bg-muted/25 p-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="proof-title">Title</Label>
            <Input
              id="proof-title"
              className="h-10"
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Passport renewal submitted"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof-type">Type</Label>
              <select
                id="proof-type"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={draft.proof_type}
                onChange={(e) => update("proof_type", e.target.value as ProofType)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {PROOF_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof-status">Status</Label>
              <select
                id="proof-status"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={draft.status}
                onChange={(e) => update("status", e.target.value as ProofStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {PROOF_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof-reference">Reference number</Label>
              <Input
                id="proof-reference"
                className="h-10"
                value={draft.reference_number}
                onChange={(e) => update("reference_number", e.target.value)}
                placeholder="Confirmation or tracking number"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof-submitted-to">Submitted to</Label>
              <Input
                id="proof-submitted-to"
                className="h-10"
                value={draft.submitted_to}
                onChange={(e) => update("submitted_to", e.target.value)}
                placeholder="Authority, provider, office…"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof-date">Submission date</Label>
              <Input
                id="proof-date"
                type="date"
                className="h-10"
                value={draft.submitted_at}
                onChange={(e) => update("submitted_at", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="proof-notes">Notes</Label>
            <Textarea
              id="proof-notes"
              value={draft.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything to remember about this submission…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save proof
            </Button>
          </div>
        </form>
      )}

      {records === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading proof records…</span>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <FileCheck2 className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No proof yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add a submission confirmation, receipt, or tracking number to build a
            record of what you’ve sent.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((record) => {
            const pending = pendingId === record.id;
            return (
              <li
                key={record.id}
                className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{record.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {PROOF_TYPE_LABELS[record.proof_type]}
                      {record.submitted_to && ` · ${record.submitted_to}`}
                      {record.submitted_at &&
                        ` · ${formatDate(record.submitted_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLES[record.status],
                      )}
                    >
                      {PROOF_STATUS_LABELS[record.status]}
                    </span>
                    <select
                      aria-label="Update proof status"
                      className="h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={record.status}
                      disabled={pending}
                      onChange={(e) =>
                        handleStatusChange(record, e.target.value as ProofStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {PROOF_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(record)}
                      disabled={pending}
                      aria-label="Delete proof record"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {record.reference_number && (
                  <p className="text-xs text-muted-foreground">
                    Ref: {record.reference_number}
                  </p>
                )}
                {record.notes && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {record.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
