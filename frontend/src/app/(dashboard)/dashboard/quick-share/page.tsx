"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  KeyRound,
  Link2,
  Plus,
  QrCode as QrCodeIcon,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ProductMetric, TrustNotice } from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  deleteQuickShare,
  listQuickShares,
  revokeQuickShare,
} from "@/lib/quick-share";
import { modeLabel } from "@/components/quick-share/shared";
import { copyToClipboardWithFallback, looksSensitive } from "@/lib/safesend";
import { cn } from "@/lib/utils";
import type { QuickShareListItem, QuickShareStatus } from "@/types/quick-share";

const statusClass: Record<QuickShareStatus, string> = {
  active: "bg-brand-success/10 text-brand-success",
  accepted: "bg-brand-success/10 text-brand-success",
  claimed: "bg-accent text-accent-foreground",
  declined: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  consumed: "bg-muted text-muted-foreground",
};

const statusLabel: Record<QuickShareStatus, string> = {
  active: "Active",
  accepted: "Accepted",
  claimed: "Scanned",
  declined: "Declined",
  expired: "Expired",
  revoked: "Revoked",
  consumed: "Used",
};

const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

type Filter = "all" | "active" | "expiring" | "sensitive" | "expired" | "revoked";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Expiring soon" },
  { id: "sensitive", label: "Sensitive" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
];

function isExpiringSoon(s: QuickShareListItem): boolean {
  if (!s.is_active) return false;
  const ms = new Date(s.expires_at).getTime() - Date.now();
  return ms > 0 && ms < EXPIRING_SOON_MS;
}

export default function QuickShareListPage() {
  const [sessions, setSessions] = useState<QuickShareListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<QuickShareListItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  async function copyLink(item: QuickShareListItem) {
    const url = `${window.location.origin}${item.claim_path}`;
    const ok = await copyToClipboardWithFallback(url);
    if (ok) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1600);
      flash("Secure link copied.");
    } else {
      flash("Copy is unavailable in this browser.");
    }
  }

  async function confirmClearFinished() {
    const finished = (sessions ?? []).filter((s) => !s.is_active);
    if (finished.length === 0) {
      setConfirmClear(false);
      return;
    }
    setClearing(true);
    // Delete each finished share; ignore individual failures so one bad row
    // never blocks the rest.
    const results = await Promise.allSettled(
      finished.map((s) => deleteQuickShare(s.id)),
    );
    const removedIds = new Set(
      finished
        .filter((_, i) => results[i].status === "fulfilled")
        .map((s) => s.id),
    );
    setSessions((prev) => (prev ?? []).filter((s) => !removedIds.has(s.id)));
    setClearing(false);
    setConfirmClear(false);
    flash(
      removedIds.size === finished.length
        ? "Finished shares cleared."
        : `Cleared ${removedIds.size} of ${finished.length}.`,
    );
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const updated = await revokeQuickShare(revokeTarget.id);
      setSessions((prev) =>
        (prev ?? []).map((s) =>
          s.id === updated.id
            ? { ...s, status: updated.status, is_active: false, is_revoked: true }
            : s,
        ),
      );
      flash("Access is now closed.");
      setRevokeTarget(null);
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Could not revoke.");
    } finally {
      setRevoking(false);
    }
  }

  useEffect(() => {
    let active = true;
    listQuickShares()
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof ApiError ? err.message : "Could not load Quick Shares.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const list = sessions ?? [];
    return {
      active: list.filter((s) => s.is_active).length,
      sensitive: list.filter((s) => s.is_active && looksSensitive(s.title)).length,
      expiring: list.filter(isExpiringSoon).length,
      opens: list.reduce((sum, s) => sum + s.claim_count, 0),
    };
  }, [sessions]);

  const finishedCount = (sessions ?? []).filter((s) => !s.is_active).length;

  const filtered = useMemo(() => {
    const list = sessions ?? [];
    switch (filter) {
      case "active":
        return list.filter((s) => s.is_active);
      case "expiring":
        return list.filter(isExpiringSoon);
      case "sensitive":
        return list.filter((s) => looksSensitive(s.title));
      case "expired":
        return list.filter((s) => s.is_expired);
      case "revoked":
        return list.filter((s) => s.is_revoked);
      default:
        return list;
    }
  }, [sessions, filter]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sharing"
        title="Quick Share"
        description="Share safely with SafeSend. Stay in control of access, expiry, and downloads — and revoke anytime."
        actions={
          // One obvious primary action here; "Receive a code" lives once, with
          // the other secondary cross-links below, instead of twice.
          <Link
            href="/dashboard/quick-share/new"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Plus className="size-4" />
            Create secure share
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ProductMetric
          label="Active shares"
          value={String(stats.active)}
          icon={ShieldCheck}
        />
        <ProductMetric
          label="Sensitive active"
          value={String(stats.sensitive)}
          icon={AlertTriangle}
        />
        <ProductMetric
          label="Expiring soon"
          value={String(stats.expiring)}
          icon={Timer}
        />
        <ProductMetric label="Total opens" value={String(stats.opens)} icon={Users} />
      </div>

      <TrustNotice icon={ShieldCheck} title="Your vault stays private">
        Quick Share sends secure access, never your raw file path. Access is
        checked on DueNest&apos;s servers every time, and you can revoke any share
        instantly.
      </TrustNotice>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/shared-with-me"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
        >
          <Inbox className="size-4 text-muted-foreground" />
          Shared with me
        </Link>
        <Link
          href="/dashboard/quick-share/receive"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
        >
          <KeyRound className="size-4 text-muted-foreground" />
          Receive a code
        </Link>
      </div>

      {finishedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Tidy up finished shares</p>
              <p className="text-xs text-muted-foreground">
                {finishedCount} share{finishedCount === 1 ? "" : "s"} expired or
                closed. Clearing them keeps this list focused — access is already
                off, so nothing is exposed.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmClear(true)}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
            Clear finished
          </Button>
        </div>
      )}

      <SectionCard
        title="Your shares"
        description="Open one to view its QR, send via apps, see live status, and revoke access."
      >
        {sessions !== null && sessions.length > 0 && (
          <div
            className="mb-4 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter shares"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : sessions === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={QrCodeIcon}
            title="No active shares. Your vault is private."
            description="Create a secure share when you need to send documents without losing control — at a counter, an appointment, or across the table."
            action={
              <Link href="/dashboard/quick-share/new" className={cn(buttonVariants())}>
                <Plus className="size-4" />
                Create your first secure share
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No shares match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((s) => (
              <ShareRow
                key={s.id}
                share={s}
                copied={copiedId === s.id}
                onCopy={() => copyLink(s)}
                onRevoke={() => setRevokeTarget(s)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-floating">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke this share?"
        description="Anyone with the QR, link, or code will lose access immediately. This cannot be undone."
        confirmLabel="Revoke access"
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear finished shares?"
        description={`This permanently removes ${finishedCount} expired or closed share${
          finishedCount === 1 ? "" : "s"
        } and their activity history. Active shares are not affected.`}
        confirmLabel="Clear finished"
        loading={clearing}
        onConfirm={confirmClearFinished}
        onCancel={() => setConfirmClear(false)}
      />
    </PageContainer>
  );
}

function ShareRow({
  share: s,
  copied,
  onCopy,
  onRevoke,
}: {
  share: QuickShareListItem;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const sensitive = looksSensitive(s.title);
  const expiringSoon = isExpiringSoon(s);
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-1">
      <Link
        href={`/dashboard/quick-share/${s.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:bg-muted/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <QrCodeIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium">
            {s.title || "Untitled secure share"}
            {sensitive && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-amber/10 px-2 py-0.5 text-[10px] font-medium text-brand-amber"
                title="Looks sensitive"
              >
                <AlertTriangle className="size-2.5" />
                Sensitive
              </span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {s.file_count} file{s.file_count === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>{modeLabel[s.mode]}</span>
            {s.recipient_label && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">For {s.recipient_label}</span>
              </>
            )}
            {s.access_code_required && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3" />
                  Code
                </span>
              </>
            )}
          </p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-2 pl-13 sm:pl-0">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            expiringSoon ? "text-brand-amber" : "text-muted-foreground",
          )}
        >
          <Clock className="size-3" />
          {s.is_active ? `Expires ${formatDate(s.expires_at)}` : statusLabel[s.status]}
        </span>
        {s.claim_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-brand-success">
            <CheckCircle2 className="size-3" />
            {s.claim_count}
          </span>
        )}
        <Badge className={cn("border-transparent", statusClass[s.status])}>
          {statusLabel[s.status]}
        </Badge>
        {s.is_active && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCopy}
              aria-label="Copy secure link"
              title="Copy secure link"
            >
              {copied ? (
                <Check className="size-4 text-brand-success" />
              ) : (
                <Link2 className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRevoke}
              aria-label="Revoke access"
              title="Revoke access"
              className="text-muted-foreground hover:text-destructive"
            >
              <Ban className="size-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
