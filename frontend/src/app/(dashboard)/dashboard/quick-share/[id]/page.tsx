"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Link2,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import {
  approveQuickShareClaim,
  denyQuickShareClaim,
  getQuickShare,
  revokeQuickShare,
} from "@/lib/quick-share";
import {
  CountdownPill,
  PermissionChips,
  QrCode,
} from "@/components/quick-share/shared";
import { cn } from "@/lib/utils";
import type {
  QuickShareClaimSummary,
  QuickShareSession,
} from "@/types/quick-share";

export default function QuickShareDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);

  const [session, setSession] = useState<QuickShareSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [revealCode, setRevealCode] = useState(false);
  const [plainCode, setPlainCode] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [claimBusy, setClaimBusy] = useState<number | null>(null);

  const claimUrl =
    session && typeof window !== "undefined"
      ? `${window.location.origin}${session.claim_path}`
      : "";

  const load = useCallback(async () => {
    try {
      const data = await getQuickShare(sessionId);
      setSession(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load this Quick Share.",
      );
    }
  }, [sessionId]);

  useEffect(() => {
    // Read the one-time plain access code stashed by the wizard, then clear it.
    let active = true;
    try {
      const code = sessionStorage.getItem(`qs-code-${sessionId}`);
      if (code) {
        sessionStorage.removeItem(`qs-code-${sessionId}`);
        // Defer to a microtask so we never setState synchronously in the effect.
        Promise.resolve().then(() => {
          if (active) setPlainCode(code);
        });
      }
    } catch {
      /* ignore */
    }
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    getQuickShare(sessionId)
      .then((data) => {
        if (active) {
          setSession(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load this Quick Share.",
          );
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Light polling for live status while the share is active (no realtime infra).
  useEffect(() => {
    if (!session?.is_active) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [session?.is_active, load]);

  async function copy(value: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      const updated = await revokeQuickShare(sessionId);
      setSession(updated);
      setConfirmRevoke(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke.");
    } finally {
      setRevoking(false);
    }
  }

  async function handleClaim(
    claim: QuickShareClaimSummary,
    action: "approve" | "deny",
  ) {
    setClaimBusy(claim.id);
    try {
      if (action === "approve") await approveQuickShareClaim(sessionId, claim.id);
      else await denyQuickShareClaim(sessionId, claim.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update claim.");
    } finally {
      setClaimBusy(null);
    }
  }

  if (error && !session) {
    return (
      <PageContainer width="narrow">
        <BackLink />
        <InlineAlert tone="danger">{error}</InlineAlert>
      </PageContainer>
    );
  }

  if (!session) {
    return (
      <PageContainer width="narrow">
        <BackLink />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </PageContainer>
    );
  }

  const inactive = !session.is_active;
  const pendingClaims = session.claims.filter(
    (c) => c.approval === "pending",
  );

  return (
    <PageContainer width="narrow">
      <BackLink />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {/* QR hero card */}
      <section
        className={cn(
          "relative overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-floating sm:p-8",
          session.is_active && "quick-share-active-ring",
        )}
      >
        <div className="mx-auto flex max-w-sm flex-col items-center">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <StatusBadge session={session} />
          </div>

          <h1 className="mt-4 font-heading text-xl font-semibold">
            {session.title || "Quick Share"}
          </h1>

          <div className="mt-5">
            {inactive ? (
              <div className="relative flex size-60 items-center justify-center rounded-2xl bg-muted">
                <QrCode value={claimUrl} size={240} className="opacity-20 blur-[2px]" />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Ban className="size-7" />
                  <span className="text-sm font-medium">
                    {session.is_revoked
                      ? "Access revoked"
                      : session.is_expired
                        ? "This Quick Share expired"
                        : "No longer active"}
                  </span>
                </span>
              </div>
            ) : (
              <QrCode value={claimUrl} size={240} />
            )}
          </div>

          {!inactive && (
            <div className="mt-4">
              <CountdownPill expiresAt={session.expires_at} />
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-success" />
            This QR does not expose your full vault.
          </p>

          <PermissionChips
            className="mt-4 justify-center"
            permission={session.permission}
            accessCodeRequired={session.access_code_required}
            oneTime={session.one_time}
            requireApproval={session.require_sender_approval}
            watermark={session.watermark_enabled}
          />

          {!inactive && (
            <div className="mt-6 grid w-full grid-cols-1 gap-2">
              <Button
                variant="outline"
                onClick={() => copy(claimUrl, "link")}
                className="w-full"
              >
                {copied === "link" ? (
                  <Check className="size-4 text-brand-success" />
                ) : (
                  <Link2 className="size-4" />
                )}
                {copied === "link" ? "Copied" : "Copy secure link"}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>Fallback code:</span>
                <button
                  type="button"
                  onClick={() => copy(session.fallback_code, "code")}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  {session.fallback_code}
                  {copied === "code" ? (
                    <Check className="size-3 text-brand-success" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Access code reveal (only right after creation) */}
      {plainCode && (
        <div className="rounded-2xl border border-brand-amber/30 bg-brand-amber/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-amber/10 text-brand-amber">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Access code</p>
                <p className="text-xs text-muted-foreground">
                  Share this separately from the QR. It won&apos;t be shown again.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-card px-3 py-1.5 font-mono text-sm font-semibold tracking-wider">
                {revealCode ? plainCode : "••••••"}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRevealCode((v) => !v)}
                aria-label={revealCode ? "Hide code" : "Reveal code"}
              >
                {revealCode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {pendingClaims.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <UserCheck className="size-4 text-primary" />
            Waiting for your approval
          </p>
          <ul className="mt-3 space-y-2">
            {pendingClaims.map((claim) => (
              <li
                key={claim.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {claim.receiver_initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {claim.receiver_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      requested access
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClaim(claim, "deny")}
                    disabled={claimBusy === claim.id}
                  >
                    <X className="size-4" />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleClaim(claim, "approve")}
                    disabled={claimBusy === claim.id}
                  >
                    {claimBusy === claim.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Shared files */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" />
          {session.file_count} file{session.file_count === 1 ? "" : "s"} shared
        </p>
        <ul className="mt-3 space-y-2">
          {session.files.map((file) => (
            <li key={file.file_id} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{file.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {file.source} · {formatFileSize(file.file_size)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Recipients / receipt */}
      {session.claims.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-sm font-semibold">Recipients</p>
          <ul className="mt-3 space-y-2">
            {session.claims.map((claim) => (
              <li
                key={claim.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {claim.receiver_initials}
                  </span>
                  <span className="truncate">{claim.receiver_name}</span>
                </span>
                <ClaimStatusBadge claim={claim} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Revoke */}
      {!inactive && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            variant="destructive"
            onClick={() => setConfirmRevoke(true)}
            className="w-full sm:w-auto"
          >
            <Ban className="size-4" />
            Revoke access
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Revoking stops all access immediately. You can revoke anytime.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this Quick Share?"
        description="Anyone with this QR or link will lose access immediately. This cannot be undone."
        confirmLabel="Revoke access"
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </PageContainer>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/quick-share"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Quick Share
    </Link>
  );
}

function StatusBadge({ session }: { session: QuickShareSession }) {
  if (session.is_revoked)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-destructive">
        <Ban className="size-3.5" /> Revoked
      </span>
    );
  if (session.is_expired)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground">
        Expired
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-success/10 px-3 py-1 text-brand-success">
      <span className="size-2 animate-pulse rounded-full bg-brand-success" />
      {session.claim_count > 0 ? "Accepted" : "Ready to scan"}
    </span>
  );
}

function ClaimStatusBadge({ claim }: { claim: QuickShareClaimSummary }) {
  const map: Record<string, { label: string; cls: string }> = {
    accepted: { label: "Accepted", cls: "bg-brand-success/10 text-brand-success" },
    pending: { label: "Pending", cls: "bg-accent text-accent-foreground" },
    declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
    blocked: { label: "Blocked", cls: "bg-destructive/10 text-destructive" },
    expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
  };
  const entry =
    claim.approval === "pending"
      ? { label: "Awaiting approval", cls: "bg-brand-amber/10 text-brand-amber" }
      : map[claim.status] ?? map.pending;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
        entry.cls,
      )}
    >
      {entry.label}
    </span>
  );
}
