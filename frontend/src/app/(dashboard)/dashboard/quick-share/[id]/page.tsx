"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  CalendarPlus,
  FileText,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import {
  approveQuickShareClaim,
  denyQuickShareClaim,
  extendQuickShare,
  getQuickShare,
  getQuickShareActivity,
  revokeQuickShare,
} from "@/lib/quick-share";
import { takeQuickShareHandoff } from "@/lib/quick-share-handoff";
import {
  CountdownPill,
  loadDefaultQrStyle,
  PermissionChips,
  QrCode,
  QR_COLOR_PRESETS,
  QR_PRESETS,
  saveDefaultQrStyle,
} from "@/components/quick-share/shared";
import {
  ShareDistributionActions,
  ShareMessageEditor,
} from "@/components/quick-share/share-actions";
import { ShareActivityTimeline } from "@/components/quick-share/activity-timeline";
import { useFeature } from "@/components/features/feature-flags-provider";
import { packageMethods, type SharePackage } from "@/lib/safesend";
import { assessQrContrast } from "@/lib/qr";
import { cn } from "@/lib/utils";
import type {
  QuickShareActivity,
  QuickShareClaimSummary,
  QuickShareMethod,
  QuickSharePermission,
  QuickShareSession,
} from "@/types/quick-share";

const PERMISSION_LABEL: Record<QuickSharePermission, string> = {
  view_only: "View only",
  download_allowed: "Allow download",
  save_copy_allowed: "Allow save copy",
};

/** Map a legacy single share_method to the package that surfaces it + the link. */
function methodToPackage(method: QuickShareMethod): SharePackage {
  if (method === "code") return "all";
  if (method === "link") return "qr_link";
  return "qr_link";
}

/** ISO timestamp `ms` milliseconds from now (kept out of the render path). */
function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** Humanize the time remaining until expiry for share messages. */
function humanizeExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function QuickShareDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);

  const [session, setSession] = useState<QuickShareSession | null>(null);
  const [activity, setActivity] = useState<QuickShareActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [revealCode, setRevealCode] = useState(false);
  const [plainCode, setPlainCode] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [extending, setExtending] = useState<number | null>(null);
  const [claimBusy, setClaimBusy] = useState<number | null>(null);
  const [pkg, setPkg] = useState<SharePackage | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Seed from a saved default QR style (appearance only) when present.
  const [qrColor, setQrColor] = useState<string>(
    () => loadDefaultQrStyle()?.dark ?? QR_COLOR_PRESETS[0].dark,
  );
  const [qrLight, setQrLight] = useState(
    () => loadDefaultQrStyle()?.light ?? "#ffffff",
  );
  const [qrLogo, setQrLogo] = useState(
    () => loadDefaultQrStyle()?.logo ?? true,
  );
  const [qrMargin, setQrMargin] = useState(
    () => loadDefaultQrStyle()?.margin ?? 1,
  );
  // Custom center logo: client-side only, raster formats only, never stored.
  const [qrLogoSrc, setQrLogoSrc] = useState<string | null>(null);
  const [qrLogoError, setQrLogoError] = useState<string | null>(null);
  const [styleSaved, setStyleSaved] = useState(false);
  const qrCustomEnabled = useFeature("qr_customization");

  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

  function onLogoFile(file: File | undefined) {
    setQrLogoError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setQrLogoError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setQrLogoError("Logo too large (max 2MB). It may also make the QR hard to scan.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setQrLogoSrc(reader.result);
        setStyleSaved(false);
      }
    };
    reader.onerror = () =>
      setQrLogoError("Could not read that image. QR is unchanged.");
    reader.readAsDataURL(file);
  }

  const claimUrl =
    session && typeof window !== "undefined"
      ? `${window.location.origin}${session.claim_path}`
      : "";

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getQuickShare(sessionId);
      setSession(data);
      setError(null);
      // The activity trail is non-critical; never let it block the page.
      getQuickShareActivity(sessionId)
        .then(setActivity)
        .catch(() => setActivity([]));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load this SafeSend.",
      );
    }
  }, [sessionId]);

  useEffect(() => {
    // SEC-011: read the one-time plain access code from the in-memory handoff
    // (never sessionStorage/localStorage). After a reload it is gone, so the
    // code is shown only once.
    let active = true;
    const handoff = takeQuickShareHandoff(sessionId);
    if (handoff) {
      // Defer to a microtask so we never setState synchronously in the effect.
      Promise.resolve().then(() => {
        if (!active) return;
        if (handoff.code) setPlainCode(handoff.code);
        if (handoff.pkg) setPkg(handoff.pkg as SharePackage);
      });
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
              : "Could not load this SafeSend.",
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

  async function handleExtend(ms: number) {
    setExtending(ms);
    try {
      const updated = await extendQuickShare(sessionId, futureIso(ms));
      setSession(updated);
      flash("Access extended.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not extend access.",
      );
    } finally {
      setExtending(null);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      const updated = await revokeQuickShare(sessionId);
      setSession(updated);
      setConfirmRevoke(false);
      flash("Access is now closed.");
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
  // Legacy shares created before the package selector default to surfacing all
  // delivery methods. Derive lead-method from share_method when no package set.
  const methods = packageMethods(
    pkg ?? methodToPackage(session.share_method),
  );
  const permLabel = PERMISSION_LABEL[session.permission];
  const expiryLabel = humanizeExpiry(session.expires_at);
  const qrStyle = {
    dark: qrColor,
    light: qrLight,
    logo: qrLogo,
    margin: qrMargin,
    logoSrc: qrLogoSrc ?? undefined,
  };
  // Honest, non-blocking scan-reliability assessment for the chosen colors.
  const qrReliability = assessQrContrast(qrColor, qrLight);

  function applyQrPreset(style: {
    dark?: string;
    light?: string;
    logo?: boolean;
    margin?: number;
  }) {
    if (style.dark) setQrColor(style.dark);
    if (style.light) setQrLight(style.light);
    if (typeof style.logo === "boolean") setQrLogo(style.logo);
    if (typeof style.margin === "number") setQrMargin(style.margin);
    setStyleSaved(false);
  }
  // A recipient has asked for more time when the latest extension request is
  // newer than the latest extension we granted.
  const pendingExtension = (() => {
    if (!activity) return false;
    const latest = (action: string) =>
      activity
        .filter((a) => a.action === action)
        .reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0);
    const requested = latest("extension_requested");
    return requested > 0 && requested > latest("session_extended");
  })();

  return (
    <PageContainer width="narrow">
      <BackLink />

      {toast && (
        <div role="status" aria-live="polite" className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-floating">
          {toast}
        </div>
      )}

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
            {session.title || "SafeSend"}
          </h1>

          {session.recipient_label && (
            <p className="mt-1 text-xs text-muted-foreground">
              For: {session.recipient_label}
            </p>
          )}

          {!inactive && (
            <p className="mt-1 text-xs text-muted-foreground">
              {session.share_method === "link"
                ? "Share by secure link — copy it below."
                : session.share_method === "code"
                  ? "Share by DueNest code — they enter it under Receive a code."
                  : "Share by QR — let them scan the code below."}
            </p>
          )}

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
                        ? "This SafeSend expired"
                        : "No longer active"}
                  </span>
                </span>
              </div>
            ) : (
              <QrCode value={claimUrl} size={240} style={qrStyle} />
            )}
          </div>

          {!inactive && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2" role="group" aria-label="QR color">
                {QR_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setQrColor(c.dark)}
                    aria-label={`${c.label} QR`}
                    aria-pressed={qrColor === c.dark}
                    className={cn(
                      "size-6 rounded-full border-2 transition-transform hover:scale-110",
                      qrColor === c.dark ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c.dark }}
                  />
                ))}
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => setQrLogo((v) => !v)}
                  role="switch"
                  aria-checked={qrLogo}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    qrLogo
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  DueNest badge
                </button>
              </div>

              {qrCustomEnabled && (
                <div className="mt-3 flex w-full max-w-xs flex-col gap-2 rounded-xl border border-border bg-muted/25 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {QR_PRESETS.map((p) => {
                      const active =
                        qrColor === p.style.dark &&
                        qrLight === p.style.light &&
                        qrLogo === Boolean(p.style.logo) &&
                        qrMargin === (p.style.margin ?? 1);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyQrPreset(p.style)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="qr-fg"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Code color
                    </label>
                    <input
                      id="qr-fg"
                      type="color"
                      value={qrColor}
                      onChange={(e) => setQrColor(e.target.value)}
                      aria-label="QR code (foreground) color"
                      className="h-7 w-10 cursor-pointer rounded border border-input bg-card"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="qr-bg"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Background
                    </label>
                    <div className="flex items-center gap-2">
                      {qrLight !== "#ffffff" && (
                        <button
                          type="button"
                          onClick={() => setQrLight("#ffffff")}
                          className="text-[0.7rem] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Reset
                        </button>
                      )}
                      <input
                        id="qr-bg"
                        type="color"
                        value={qrLight}
                        onChange={(e) => setQrLight(e.target.value)}
                        aria-label="QR background color"
                        className="h-7 w-10 cursor-pointer rounded border border-input bg-card"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Quiet zone
                    </span>
                    <div
                      className="inline-flex rounded-lg border border-border p-0.5"
                      role="group"
                      aria-label="QR quiet zone"
                    >
                      {[
                        { label: "Normal", value: 1 },
                        { label: "Wide", value: 4 },
                      ].map((q) => (
                        <button
                          key={q.value}
                          type="button"
                          onClick={() => {
                            setQrMargin(q.value);
                            setStyleSaved(false);
                          }}
                          aria-pressed={qrMargin === q.value}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs transition-colors",
                            qrMargin === q.value
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Custom logo
                    </span>
                    <div className="flex items-center gap-2">
                      {qrLogoSrc && (
                        <button
                          type="button"
                          onClick={() => {
                            setQrLogoSrc(null);
                            setQrLogoError(null);
                          }}
                          className="text-[0.7rem] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                      <label
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "cursor-pointer text-xs",
                        )}
                      >
                        {qrLogoSrc ? "Replace" : "Upload"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            onLogoFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {qrLogoError ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {qrLogoError}
                    </p>
                  ) : qrLogoSrc ? (
                    <p className="text-[0.7rem] text-muted-foreground">
                      Keep logos small and simple for reliable scanning. PNG, JPEG,
                      or WebP — processed on your device, never uploaded.
                    </p>
                  ) : null}
                  <p
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      qrReliability.level === "ok"
                        ? "text-brand-success"
                        : "text-brand-amber",
                    )}
                    role="status"
                    aria-live="polite"
                  >
                    {qrReliability.level === "ok" ? (
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {qrReliability.message}
                    {qrReliability.ratio !== null && (
                      <span className="text-muted-foreground">
                        ({qrReliability.ratio}:1)
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      saveDefaultQrStyle(qrStyle);
                      setStyleSaved(true);
                    }}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {styleSaved ? "Saved as your default ✓" : "Use this style next time"}
                  </button>
                </div>
              )}
            </div>
          )}

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

          {!inactive && methods.code && (
            <div className="mt-6 flex flex-col items-center gap-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <span>DueNest code:</span>
                <button
                  type="button"
                  onClick={() => copy(session.dn_code, "code")}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  {session.dn_code}
                  {copied === "code" ? (
                    <Check className="size-3 text-brand-success" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
              <p className="text-center">
                No camera? The recipient can enter this code under{" "}
                <span className="font-medium">Receive a code</span>.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Extend / re-open (never for a revoked share) */}
      {!session.is_revoked && (
        <div
          className={cn(
            "rounded-2xl border p-4 shadow-card",
            session.is_expired
              ? "border-brand-amber/30 bg-brand-amber/5"
              : "border-border bg-card",
          )}
        >
          <div className="flex items-center gap-2">
            <CalendarPlus
              className={cn(
                "size-4",
                session.is_expired ? "text-brand-amber" : "text-muted-foreground",
              )}
            />
            <p className="text-sm font-semibold">
              {session.is_expired ? "Re-open this share" : "Extend access"}
            </p>
          </div>
          {pendingExtension && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <UserCheck className="size-3.5" />
              A recipient asked for more time. Add time below to re-open access.
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {session.is_expired
              ? "Give the recipient more time by moving the expiry into the future."
              : "Add more time before this share expires. You can still revoke anytime."}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["1 hour", 60 * 60 * 1000],
                ["24 hours", 24 * 60 * 60 * 1000],
                ["7 days", 7 * 24 * 60 * 60 * 1000],
              ] as const
            ).map(([label, ms]) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                onClick={() => handleExtend(ms)}
                disabled={extending !== null}
              >
                {extending === ms ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  `+${label}`
                )}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Distribution — app sharing, copy, downloads */}
      {!inactive && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div>
            <p className="text-sm font-semibold">Share it</p>
            <p className="text-xs text-muted-foreground">
              Send secure access, never the raw file. The recipient opens it on
              DueNest, and you can revoke anytime.
            </p>
          </div>

          <ShareDistributionActions
            shareUrl={claimUrl}
            link={methods.link ? claimUrl : undefined}
            code={methods.code ? session.dn_code : undefined}
            title={session.title || undefined}
            purpose={session.purpose || undefined}
            recipient={session.recipient_label || undefined}
            permissionLabel={permLabel}
            expiryLabel={expiryLabel}
            itemSummary={`${session.file_count} file${session.file_count === 1 ? "" : "s"}`}
            qrStyle={qrStyle}
            onFlash={flash}
          />

          <button
            type="button"
            onClick={() => setShowMessage((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
            aria-expanded={showMessage}
          >
            <span className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-muted-foreground" />
              Edit share message
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                showMessage && "rotate-180",
              )}
            />
          </button>
          {showMessage && (
            <ShareMessageEditor
              link={methods.link ? claimUrl : undefined}
              code={methods.code ? session.dn_code : undefined}
              permissionLabel={permLabel}
              expiryLabel={expiryLabel}
              title={session.title || undefined}
              onFlash={flash}
            />
          )}

          <a
            href={session.claim_path}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            Preview recipient view
          </a>
        </div>
      )}

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

      {/* Activity log */}
      <ShareActivityTimeline activity={activity} />

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
        title="Revoke this SafeSend?"
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
      SafeSend
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
