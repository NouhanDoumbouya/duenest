import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, FileCheck2, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/layout/logo";

const trustPoints = [
  {
    icon: FileCheck2,
    title: "Everything in one place",
    description: "Documents, renewals, and deadlines in a single calm workspace.",
  },
  {
    icon: CalendarClock,
    title: "Never miss a date",
    description: "Stay ahead of expiries and renewals before they become urgent.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your life-admin data is yours — scoped to your account only.",
  },
];

/**
 * Two-panel auth layout: a brand/value panel on the left (desktop) and the
 * form on the right. On mobile the panel collapses to a centered form with a
 * logo, so the experience stays focused.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-navy p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(70%_55%_at_15%_0%,rgba(20,184,166,0.25),transparent_60%),radial-gradient(60%_50%_at_100%_100%,rgba(37,99,235,0.30),transparent_60%)]"
        />
        <div className="relative">
          <Logo size="lg" onDark />
        </div>

        <div className="relative space-y-8">
          <p className="max-w-md font-heading text-2xl leading-snug font-semibold">
            Bring calm to your documents, deadlines, and renewals.
          </p>
          <ul className="space-y-5">
            {trustPoints.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-teal ring-1 ring-white/15">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {point.title}
                    </span>
                    <span className="block text-sm text-white/70">
                      {point.description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          Documents, deadlines, and renewals in one secure workspace.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center bg-muted/30 px-4 py-12">
        <div className="mb-8 lg:hidden">
          <Logo size="lg" />
        </div>
        {children}
        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          By continuing you agree to keep your DueNest workspace secure. Need
          help?{" "}
          <Link href="/" className="font-medium text-foreground hover:underline">
            Back to home
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
