"use client";

import { useState } from "react";
import {
  AppWindow,
  Cloud,
  Dumbbell,
  GraduationCap,
  Globe,
  Landmark,
  type LucideIcon,
  MonitorPlay,
  Plug,
  Receipt,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  siApplemusic,
  siCloudflare,
  siDigitalocean,
  siDropbox,
  siFigma,
  siGithub,
  siGodaddy,
  siGoogle,
  siHostinger,
  siIcloud,
  siNamecheap,
  siNetflix,
  siNotion,
  siRailway,
  siSpotify,
  siVercel,
  siYoutube,
} from "simple-icons";

import {
  getSubscriptionFallbackAvatar,
  getSubscriptionTemplateByKey,
  matchTemplateByName,
  type SubscriptionTemplate,
} from "@/lib/subscription-templates";
import { cn } from "@/lib/utils";

type SimpleIcon = { title: string; hex: string; path: string };

// Curated brand logos sourced from Simple Icons (CC0). Keyed by the template's
// stable `key`. Brands Simple Icons does not carry (e.g. ChatGPT, Canva, AWS,
// Microsoft — removed at the brands' request) fall back to a brand-colored
// monogram, and can be overridden by dropping an SVG into /public/brand-logos.
const BRAND_ICONS: Record<string, SimpleIcon> = {
  netflix: siNetflix,
  spotify: siSpotify,
  "youtube-premium": siYoutube,
  "apple-music": siApplemusic,
  notion: siNotion,
  figma: siFigma,
  "google-workspace": siGoogle,
  "google-one": siGoogle,
  icloud: siIcloud,
  dropbox: siDropbox,
  github: siGithub,
  vercel: siVercel,
  railway: siRailway,
  cloudflare: siCloudflare,
  digitalocean: siDigitalocean,
  namecheap: siNamecheap,
  godaddy: siGodaddy,
  hostinger: siHostinger,
};

// Clean category icons for generic life-admin templates (no brand logo).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  streaming: MonitorPlay,
  software: AppWindow,
  "cloud-hosting": Cloud,
  domain: Globe,
  insurance: ShieldCheck,
  telecom: Smartphone,
  utilities: Plug,
  education: GraduationCap,
  finance: Landmark,
  "gym-health": Dumbbell,
  other: Receipt,
};

function tint(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(100,116,139,${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

// Brand colors that are near-black render as currentColor so they stay visible
// in dark mode (e.g. GitHub, Notion, Vercel, Apple).
function isNearBlack(hex: string): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.22;
}

/**
 * A subscription's visual identity, resolved in priority order:
 *   1. a curated local logo asset (template.logoPath), if present
 *   2. a real brand logo (Simple Icons) for known brands
 *   3. a clean category icon for generic life-admin templates
 *   4. a brand-colored monogram for brands without an available logo
 *   5. a neutral monogram for fully custom subscriptions
 * Never renders a broken image — a missing/failed logo falls back gracefully.
 */
export function SubscriptionProviderLogo({
  name,
  providerKey,
  provider,
  size = 44,
  className,
}: {
  name: string;
  providerKey?: string | null;
  provider?: string;
  size?: number;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const template: SubscriptionTemplate | null =
    getSubscriptionTemplateByKey(providerKey) ??
    matchTemplateByName(name, provider);

  const label = getSubscriptionFallbackAvatar(name);
  const box = { width: size, height: size };
  const rounded = size <= 36 ? "rounded-lg" : "rounded-xl";
  const tileBase = cn("flex shrink-0 items-center justify-center", rounded, className);

  // 1) Curated local asset (lets you override or add brands Simple Icons lacks).
  if (template?.logoPath && !imgFailed) {
    return (
      <span
        className={cn(tileBase, "overflow-hidden border border-border bg-card")}
        style={box}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={template.logoPath}
          alt={`${template.name} logo`}
          width={size}
          height={size}
          className="size-full object-contain p-1.5"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  // 2) Real brand logo from Simple Icons.
  const icon = template ? BRAND_ICONS[template.key] : undefined;
  if (icon) {
    const nearBlack = isNearBlack(icon.hex);
    return (
      <span
        className={cn(tileBase, "border border-border bg-card", nearBlack && "text-foreground")}
        style={box}
      >
        <svg
          role="img"
          aria-label={`${template?.name ?? name} logo`}
          viewBox="0 0 24 24"
          width={Math.round(size * 0.56)}
          height={Math.round(size * 0.56)}
          fill={nearBlack ? "currentColor" : `#${icon.hex}`}
        >
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  // 3) Generic life-admin template → clean category icon.
  if (template && !template.provider) {
    const CategoryIcon = CATEGORY_ICONS[template.categorySlug] ?? Receipt;
    return (
      <span
        className={cn(tileBase, "bg-accent text-accent-foreground")}
        style={box}
        aria-hidden
      >
        <CategoryIcon style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }

  // 4) Known brand without an available logo → brand-colored monogram.
  if (template?.brandColor) {
    return (
      <span
        className={cn(tileBase, "font-semibold")}
        style={{
          ...box,
          backgroundColor: tint(template.brandColor, 0.12),
          color: template.brandColor,
          fontSize: Math.round(size * 0.34),
        }}
        aria-hidden
      >
        {label}
      </span>
    );
  }

  // 5) Fully custom subscription → neutral monogram.
  return (
    <span
      className={cn(tileBase, "bg-accent font-semibold text-accent-foreground")}
      style={{ ...box, fontSize: Math.round(size * 0.32) }}
      aria-hidden
    >
      {label}
    </span>
  );
}

// Back-compat alias — existing call sites import SubscriptionAvatar.
export const SubscriptionAvatar = SubscriptionProviderLogo;
