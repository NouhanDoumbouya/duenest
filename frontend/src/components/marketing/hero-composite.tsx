import {
  ArrowRight,
  BatteryMedium,
  Bell,
  Check,
  Folder,
  Home,
  Package,
  RefreshCw,
  ShieldCheck,
  Signal,
  Sparkles,
  Wifi,
} from "lucide-react";
import type { CSSProperties } from "react";

import { PhoneFrame } from "@/components/marketing/mockups";
import { cn } from "@/lib/utils";

/**
 * The hero "product story" visual: the DueNest app shown on a realistic phone —
 * a calm readiness home (what needs attention, what's ready) — with two small
 * floating accents (an active SafeSend share and a confirm-before-save AI
 * suggestion) hinting at the wider system without cluttering it.
 *
 * Built entirely from design tokens (no screenshots, no image files) so it stays
 * crisp at any size and ships zero extra bundle. Server component — no client JS.
 * The floating accents are hidden below `sm` so mobile stays calm and focused.
 */
export function HeroReadinessComposite() {
  const ready = [
    { label: "Visa application pack", meta: "5 of 7", icon: Package },
    { label: "Insurance certificate", meta: "Safe", icon: ShieldCheck },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <PhoneFrame>
        <div className="flex min-h-[520px] flex-col bg-muted/40">
          {/* Status bar — clears the Dynamic Island (edges only). */}
          <div className="flex items-center justify-between px-6 pt-3.5 pb-1 text-[11px] font-semibold text-foreground/70">
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryMedium className="size-3.5" />
            </span>
          </div>

          {/* App header */}
          <div className="flex items-center justify-between px-4 pt-2 pb-3">
            <span className="font-heading text-sm font-semibold">DueNest</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Bell className="size-4" />
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-navy text-[10px] font-semibold text-white ring-2 ring-brand-teal/20">
                A
              </span>
            </span>
          </div>

          {/* Readiness card */}
          <div className="px-3">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card">
              {/* "Always watching" highlight sweep — pure CSS, paused under reduced motion. */}
              <span aria-hidden className="live-scan" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    Your readiness
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    What needs attention today
                  </p>
                </div>
                <ReadinessRing percent={86} />
              </div>

              {/* Fix first — the one thing that needs you, amber but calm. */}
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-brand-amber/30 bg-brand-amber/[0.06] p-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/15 text-brand-amber">
                  <RefreshCw className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    Passport expires in 24 days
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Start the renewal — Fix first
                  </p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
              </div>

              {/* Ready rows */}
              <ul className="mt-2.5 space-y-2">
                {ready.map((row) => {
                  const Icon = row.icon;
                  return (
                    <li
                      key={row.label}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {row.label}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-[10px] font-medium text-brand-success">
                        <Check className="size-3" />
                        {row.meta}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Bottom tab bar — sells "this is the app". */}
          <div className="mt-auto flex items-center justify-around border-t border-border bg-card px-2 pt-2.5 pb-3">
            <TabIcon icon={Home} label="Home" active />
            <TabIcon icon={Folder} label="Vault" />
            <TabIcon icon={ShieldCheck} label="Share" />
          </div>
        </div>
      </PhoneFrame>

      {/* Floating accent: an active, controlled SafeSend share. */}
      <div className="absolute -top-3 -right-2 z-10 hidden w-max items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated sm:flex">
        <span className="pulse-soft flex size-1.5 rounded-full bg-brand-success" />
        <span className="text-xs font-medium">SafeSend active</span>
        <span className="text-xs text-muted-foreground">· revoke anytime</span>
      </div>

      {/* Floating accent: AI suggestion you confirm. */}
      <div className="absolute -bottom-4 -left-3 z-10 hidden items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated md:flex">
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

/** One bottom-nav tab in the phone mockup. */
function TabIcon({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 text-[10px] font-medium",
        active ? "text-brand-teal" : "text-muted-foreground/70",
      )}
    >
      <Icon className="size-4" />
      {label}
    </span>
  );
}

/**
 * A compact circular readiness gauge drawn with an SVG stroke — pure tokens,
 * no chart library. `percent` is clamped 0–100 and draws in on load via CSS.
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
