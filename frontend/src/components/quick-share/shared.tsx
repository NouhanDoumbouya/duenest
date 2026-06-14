"use client";

// Shared building blocks for the Quick Share QR experience: the QR renderer
// (heavy lib is dynamically imported), a live expiry countdown, permission
// chips, and small label/formatting helpers used across sender + receiver UIs.

import { useEffect, useState } from "react";
import {
  Clock,
  Download,
  Eye,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Timer,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  QuickSharePermission,
  QuickShareMode,
} from "@/types/quick-share";

// ---- Labels ----------------------------------------------------------------

export const permissionLabel: Record<QuickSharePermission, string> = {
  view_only: "View only",
  download_allowed: "Allow download",
  save_copy_allowed: "Allow save copy",
};

export const modeLabel: Record<QuickShareMode, string> = {
  account_to_account: "Account to account",
  public_secure_qr: "Public secure QR",
  emergency_qr: "Emergency QR",
  organization_collection: "Organization collection",
};

/** Filenames that hint at sensitive documents — used for a gentle warning. */
const SENSITIVE_HINTS = [
  "passport",
  "license",
  "licence",
  "ssn",
  "social-security",
  "tax",
  "bank",
  "statement",
  "id-card",
  "national-id",
  "birth",
  "visa",
  "insurance",
  "medical",
];

export function looksSensitive(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_HINTS.some((hint) => lower.includes(hint));
}

// ---- QR renderer -----------------------------------------------------------

export function QrCode({
  value,
  size = 240,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  // A single piece of state keyed to the value it was generated for, so we never
  // need a synchronous reset setState inside the effect.
  const [gen, setGen] = useState<{
    forValue: string;
    url: string | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    // Dynamically import the QR library so it never weighs down the initial
    // bundle — only the QR screen pays for it.
    import("qrcode")
      .then((mod) =>
        mod.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: size * 2,
          color: { dark: "#0b1220", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (active) setGen({ forValue: value, url, error: false });
      })
      .catch(() => {
        if (active) setGen({ forValue: value, url: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  const ready = gen !== null && gen.forValue === value;
  const dataUrl = ready ? gen.url : null;
  const error = ready && gen.error;

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-muted text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        Could not render QR. Use the link below.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl bg-white p-3 shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="Quick Share QR code"
          width={size - 24}
          height={size - 24}
          className="quick-share-qr-in h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

// ---- Countdown -------------------------------------------------------------

export function useCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState<number>(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0,
  );

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () =>
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  if (days >= 1) return `${days}d ${Math.floor((totalSeconds % 86400) / 3600)}h`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CountdownPill({
  expiresAt,
  className,
}: {
  expiresAt: string;
  className?: string;
}) {
  const remaining = useCountdown(expiresAt);
  const expired = remaining <= 0;
  const urgent = !expired && remaining < 60_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tabular-nums transition-colors",
        expired
          ? "bg-muted text-muted-foreground"
          : urgent
            ? "bg-brand-amber/10 text-brand-amber"
            : "bg-accent text-accent-foreground",
        className,
      )}
      aria-live="polite"
    >
      <Timer className="size-3.5" />
      {expired ? "Expired" : `Expires in ${formatCountdown(remaining)}`}
    </span>
  );
}

// ---- Permission chips ------------------------------------------------------

interface ChipFlags {
  permission: QuickSharePermission;
  accessCodeRequired?: boolean;
  oneTime?: boolean;
  requireApproval?: boolean;
  watermark?: boolean;
}

export function PermissionChips({
  permission,
  accessCodeRequired,
  oneTime,
  requireApproval,
  watermark,
  className,
}: ChipFlags & { className?: string }) {
  const chips: { icon: React.ReactNode; label: string }[] = [];
  if (permission === "view_only")
    chips.push({ icon: <Eye className="size-3.5" />, label: "View only" });
  if (permission === "download_allowed")
    chips.push({ icon: <Download className="size-3.5" />, label: "Download allowed" });
  if (permission === "save_copy_allowed")
    chips.push({ icon: <Save className="size-3.5" />, label: "Save copy allowed" });
  if (accessCodeRequired)
    chips.push({ icon: <KeyRound className="size-3.5" />, label: "Access code" });
  if (oneTime)
    chips.push({ icon: <Clock className="size-3.5" />, label: "One-time" });
  if (requireApproval)
    chips.push({ icon: <UserCheck className="size-3.5" />, label: "Sender approval" });
  if (watermark)
    chips.push({ icon: <ShieldCheck className="size-3.5" />, label: "Watermarked" });

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          {chip.icon}
          {chip.label}
        </span>
      ))}
    </div>
  );
}
