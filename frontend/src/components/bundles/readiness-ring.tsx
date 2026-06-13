"use client";

import { cn } from "@/lib/utils";

function toneFor(score: number): { ring: string; text: string } {
  if (score >= 100) return { ring: "text-brand-success", text: "text-brand-success" };
  if (score >= 60) return { ring: "text-primary", text: "text-primary" };
  if (score >= 30) return { ring: "text-amber-500", text: "text-amber-600" };
  return { ring: "text-destructive", text: "text-destructive" };
}

/** A compact circular readiness indicator (0–100). */
export function ReadinessRing({
  score,
  size = 56,
}: {
  score: number;
  size?: number;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const tone = toneFor(clamped);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="stroke-muted"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all", tone.ring)}
          stroke="currentColor"
          fill="none"
        />
      </svg>
      <span
        className={cn(
          "absolute text-xs font-semibold tabular-nums",
          tone.text,
        )}
      >
        {clamped}%
      </span>
    </div>
  );
}
