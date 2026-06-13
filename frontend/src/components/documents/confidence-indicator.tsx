"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ConfidenceReason } from "@/types/documents";

function toneFor(score: number): { ring: string; text: string } {
  if (score >= 85) return { ring: "text-brand-success", text: "text-brand-success" };
  if (score >= 65) return { ring: "text-primary", text: "text-primary" };
  if (score >= 40) return { ring: "text-amber-500", text: "text-amber-600" };
  return { ring: "text-destructive", text: "text-destructive" };
}

/** Compact circular confidence score (0–100). */
export function ConfidenceRing({
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
      role="img"
      aria-label={`Confidence score ${clamped} out of 100`}
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
        className={cn("absolute text-xs font-semibold tabular-nums", tone.text)}
      >
        {clamped}
      </span>
    </div>
  );
}

/** A small inline confidence pill for document cards. */
export function ConfidencePill({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  const tone = toneFor(score);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium", tone.text)}
      title={`Confidence ${score}/100`}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          score >= 85
            ? "bg-brand-success"
            : score >= 65
              ? "bg-primary"
              : score >= 40
                ? "bg-amber-500"
                : "bg-destructive",
        )}
      />
      {label} · {score}
    </span>
  );
}

/** Full confidence breakdown: ring, label, and the per-factor reasons. */
export function ConfidenceBreakdown({
  score,
  label,
  reasons,
}: {
  score: number;
  label: string;
  reasons: ConfidenceReason[];
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <ConfidenceRing score={score} size={72} />
        <div>
          <p className="font-heading text-lg font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">
            Readiness across files, dates, reminders, and status.
          </p>
        </div>
      </div>
      <ul className="grid flex-1 gap-1.5 sm:grid-cols-2">
        {reasons.map((reason) => (
          <li
            key={reason.key}
            className="flex items-start gap-2 text-sm"
            title={reason.met ? undefined : reason.hint}
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                reason.met
                  ? "bg-brand-success/15 text-brand-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {reason.met ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <span
              className={cn(
                reason.met ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {reason.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
