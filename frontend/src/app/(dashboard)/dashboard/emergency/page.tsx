"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, Loader2, Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  EMERGENCY_STATUS_LABELS,
  createEmergencyPack,
  getEmergencyPacks,
} from "@/lib/emergency";
import { isPlanLimitError } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type {
  CreateEmergencyPackRequest,
  EmergencyPack,
  EmergencyPackAccessMode,
  EmergencyPackStatus,
} from "@/types/emergency";

const STATUS_STYLES: Record<EmergencyPackStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-brand-success/10 text-brand-success",
  disabled: "bg-muted text-muted-foreground",
  expired: "bg-destructive/10 text-destructive",
};

export default function EmergencyPacksPage() {
  const [packs, setPacks] = useState<EmergencyPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] =
    useState<EmergencyPackAccessMode>("share_link");
  const [expiresAt, setExpiresAt] = useState("");
  const [codeRequired, setCodeRequired] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getEmergencyPacks()
      .then((page) => active && setPacks(page.results))
      .catch((err) => {
        if (!active) return;
        setPacks([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load emergency packs.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setFormError("Give the pack a name.");
      return;
    }
    if (codeRequired && !accessCode.trim()) {
      setFormError("Set an access code or turn off the code requirement.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload: CreateEmergencyPackRequest = {
      title: title.trim(),
      description: description.trim(),
      access_mode: accessMode,
      expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : null,
      access_code_required: codeRequired,
      ...(codeRequired ? { access_code: accessCode.trim() } : {}),
    };
    try {
      const created = await createEmergencyPack(payload);
      setPacks((prev) => [created, ...(prev ?? [])]);
      setShowForm(false);
      setTitle("");
      setDescription("");
      setAccessMode("owner_only_preview");
      setExpiresAt("");
      setCodeRequired(false);
      setAccessCode("");
    } catch (err) {
      if (isPlanLimitError(err)) {
        setFormError(`${err.data.detail} Visit Plan & usage to learn more.`);
      } else {
        setFormError(
          err instanceof ApiError ? err.message : "Could not create the pack.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Emergency access
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Emergency Protocol
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prepare selected documents and trusted access so people you choose can
            help if needed. They can only see what you choose — your full vault
            stays private.
          </p>
        </div>
        <Button
          variant={showForm ? "outline" : "default"}
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="size-4" />
          {showForm ? "Close" : "New pack"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-border bg-muted/25 p-5"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="pack-title">Pack name</Label>
            <Input
              id="pack-title"
              className="h-10"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Travel emergency pack"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pack-description">Description</Label>
            <Textarea
              id="pack-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this pack is for and who it’s meant for…"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pack-mode">Access mode</Label>
              <select
                id="pack-mode"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={accessMode}
                onChange={(e) =>
                  setAccessMode(e.target.value as EmergencyPackAccessMode)
                }
              >
                <option value="owner_only_preview">Owner only (preview)</option>
                <option value="share_link">Shareable link</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pack-expiry">Access expiry (optional)</Label>
              <Input
                id="pack-expiry"
                type="date"
                className="h-10"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={codeRequired}
              onChange={(e) => setCodeRequired(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Require an access code
          </label>
          {codeRequired && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="pack-code">Access code</Label>
              <Input
                id="pack-code"
                className="h-10"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Share this separately from the link"
              />
            </div>
          )}

          {formError && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </p>
          )}

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
              Create pack
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {packs === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading emergency packs…</span>
        </div>
      ) : packs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={LifeBuoy}
            title="No emergency packs yet"
            description="Create a pack to keep critical documents ready for a trusted person, without exposing everything in your vault."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Link
                href={`/dashboard/emergency/${pack.id}`}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <LifeBuoy className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{pack.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {pack.item_count} item{pack.item_count === 1 ? "" : "s"}
                    {pack.expires_at &&
                      ` · Expires ${formatDate(pack.expires_at)}`}
                  </p>
                </div>
                {pack.access_code_required && (
                  <Lock className="size-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_STYLES[pack.status],
                  )}
                >
                  {EMERGENCY_STATUS_LABELS[pack.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
