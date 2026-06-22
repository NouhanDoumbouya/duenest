import {
  ArrowRight,
  Check,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { CSSProperties } from "react";

/**
 * The hero "product story" visual: a single composed moment that says
 * "scattered files → ready documents". A primary readiness card carries the
 * narrative (what needs attention, what's ready), with two small floating
 * accents — an active SafeSend share and a confirm-before-save AI suggestion —
 * that hint at the wider system without cluttering it.
 *
 * Built entirely from design tokens (no screenshots, no image files) so it stays
 * crisp at any size and ships zero extra bundle. Server component — no client JS.
 * The floating accents are hidden below `sm` so mobile stays calm and focused.
 */
export function HeroReadinessComposite() {
  const ready = [
    { label: "Visa application pack", meta: "5 of 7 ready", icon: Package },
    { label: "Insurance certificate", meta: "Safe", icon: ShieldCheck },
  ];

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Primary readiness card -------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-floating sm:p-6">
        {/* "Always watching" — a soft highlight sweeps the card as if DueNest is
            continuously checking each item. Pure CSS, paused under reduced motion. */}
        <span aria-hidden className="live-scan" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-card-title font-heading font-semibold">
              Your readiness
            </p>
            <p className="text-metadata mt-0.5 text-muted-foreground">
              What needs attention today
            </p>
          </div>
          <ReadinessRing percent={86} />
        </div>

        {/* Fix first — the one thing that needs you, amber but calm. */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-amber/30 bg-brand-amber/[0.06] p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-amber/15 text-brand-amber">
            <RefreshCw className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Passport expires in 24 days
            </p>
            <p className="text-metadata text-muted-foreground">
              Start the renewal — Fix first
            </p>
          </div>
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
        </div>

        {/* Ready rows ------------------------------------------------------- */}
        <ul className="mt-3 space-y-2">
          {ready.map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.label}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-success/10 text-brand-success">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-[11px] font-medium text-brand-success">
                  <Check className="size-3" />
                  {row.meta}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Floating accent: an active, controlled SafeSend share -------------- */}
      <div className="absolute -top-4 -right-3 z-10 hidden w-max items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated sm:flex">
        <span className="pulse-soft flex size-1.5 rounded-full bg-brand-success" />
        <span className="text-xs font-medium">SafeSend active</span>
        <span className="text-xs text-muted-foreground">· revoke anytime</span>
      </div>

      {/* Floating accent: AI suggestion you confirm ------------------------- */}
      <div className="absolute -bottom-5 -left-4 z-10 hidden items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated md:flex">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-3.5" />
        </span>
        <div>
          <p className="text-xs font-medium">Expiry 14 Mar 2027</p>
          <p className="text-[11px] text-muted-foreground">
            AI suggestion · you confirm
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A compact circular readiness gauge drawn with an SVG stroke — pure tokens,
 * no chart library. `percent` is clamped 0–100.
 */
function ReadinessRing({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  // Final dash offset for the target percent — the arc draws from empty
  // (offset = full circumference) to this value via the CSS keyframe.
  const offset = circumference * (1 - value / 100);

  return (
    <div className="relative flex size-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-border"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="readiness-ring-arc stroke-brand-success"
          style={
            {
              "--ring-circ": circumference,
              "--ring-offset": offset,
            } as CSSProperties
          }
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}
