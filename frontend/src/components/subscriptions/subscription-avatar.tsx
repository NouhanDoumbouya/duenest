"use client";

import { useState } from "react";

import {
  getSubscriptionFallbackAvatar,
  getSubscriptionTemplateByKey,
  matchTemplateByName,
  type SubscriptionTemplate,
} from "@/lib/subscription-templates";
import { cn } from "@/lib/utils";

// Convert a #RRGGBB hex to an rgba() string at the given alpha.
function tint(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(100,116,139,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A subscription's visual identity: the brand logo when a curated asset exists,
 * otherwise a calm brand-colored monogram, otherwise a neutral monogram. Never
 * shows a broken image — a missing/failed logo falls back to the monogram.
 */
export function SubscriptionAvatar({
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
  const dimension = { width: size, height: size };
  const rounded = size <= 36 ? "rounded-lg" : "rounded-xl";

  // 1) A curated local logo asset, if present and not yet failed to load.
  if (template?.logoPath && !imgFailed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card",
          rounded,
          className,
        )}
        style={dimension}
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

  // 2) Brand-colored monogram for a known template (calm, low-saturation tint).
  if (template?.brandColor) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center font-semibold", rounded, className)}
        style={{
          ...dimension,
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

  // 3) Neutral fallback for fully custom subscriptions.
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent font-semibold text-accent-foreground",
        rounded,
        className,
      )}
      style={{ ...dimension, fontSize: Math.round(size * 0.32) }}
      aria-hidden
    >
      {label}
    </span>
  );
}
