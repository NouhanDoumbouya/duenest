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

// Sensitivity detection lives in lib/safesend (single source of truth, shared
// with the recommendation engine). Re-exported here for existing call sites.
export { looksSensitive } from "@/lib/safesend";

// ---- QR data URL (shared by the renderer, downloads, and the share card) ---

/** Optional QR appearance. `dark` is the module color; `logo` centers a badge. */
export interface QrStyle {
  dark?: string;
  logo?: boolean;
}

export const QR_COLOR_PRESETS: { id: string; label: string; dark: string }[] = [
  { id: "navy", label: "Navy", dark: "#0b1220" },
  { id: "blue", label: "Brand", dark: "#1f6feb" },
  { id: "forest", label: "Forest", dark: "#166534" },
  { id: "plum", label: "Plum", dark: "#6d28d9" },
];

const DEFAULT_QR_DARK = "#0b1220";

/**
 * Generate a PNG data URL for a QR encoding `value`. The heavy `qrcode` lib is
 * dynamically imported so only the screens that need a QR pay for it. When
 * `style.logo` is set, the error-correction level is raised to H and a small
 * DueNest badge is drawn over the (redundant) center modules.
 */
export async function generateQrDataUrl(
  value: string,
  size = 480,
  style?: QrStyle,
): Promise<string> {
  const mod = await import("qrcode");
  const dark = style?.dark || DEFAULT_QR_DARK;
  const base = await mod.toDataURL(value, {
    errorCorrectionLevel: style?.logo ? "H" : "M",
    margin: 1,
    width: size,
    color: { dark, light: "#ffffff" },
  });
  if (!style?.logo) return base;
  try {
    return await overlayDueNestBadge(base, size, dark);
  } catch {
    // Never let a badge failure break the QR — fall back to the plain code.
    return base;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function overlayDueNestBadge(
  dataUrl: string,
  size: number,
  dark: string,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, size, size);

  const badge = size * 0.2;
  const c = size / 2;
  // White cushion so the badge reads cleanly against the modules.
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, c - badge * 0.62, c - badge * 0.62, badge * 1.24, badge * 1.24, badge * 0.3);
  ctx.fill();
  // Brand-colored badge with the DueNest monogram.
  ctx.fillStyle = dark;
  roundRect(ctx, c - badge / 2, c - badge / 2, badge, badge, badge * 0.26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${badge * 0.44}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DN", c, c + badge * 0.02);
  return canvas.toDataURL("image/png");
}

// ---- QR renderer -----------------------------------------------------------

export function QrCode({
  value,
  size = 240,
  className,
  style,
}: {
  value: string;
  size?: number;
  className?: string;
  style?: QrStyle;
}) {
  // A single piece of state keyed to the value+style it was generated for, so we
  // never need a synchronous reset setState inside the effect.
  const styleKey = `${style?.dark ?? ""}|${style?.logo ? "logo" : ""}`;
  const [gen, setGen] = useState<{
    forKey: string;
    url: string | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    // Dynamically import the QR library so it never weighs down the initial
    // bundle — only the QR screen pays for it.
    generateQrDataUrl(value, size * 2, style)
      .then((url) => {
        if (active) setGen({ forKey: `${value}|${styleKey}`, url, error: false });
      })
      .catch(() => {
        if (active)
          setGen({ forKey: `${value}|${styleKey}`, url: null, error: true });
      });
    return () => {
      active = false;
    };
    // styleKey captures the style object's meaningful fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, size, styleKey]);

  const ready = gen !== null && gen.forKey === `${value}|${styleKey}`;
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
