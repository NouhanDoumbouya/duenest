import type { ReactNode } from "react";
import { CalendarClock, FileCheck2, Lock, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/layout/logo";

const trustPoints = [
  {
    icon: FileCheck2,
    title: "Everything in one place",
    description: "Documents, files, renewals, and deadlines in a single calm workspace.",
  },
  {
    icon: CalendarClock,
    title: "Never miss a date",
    description: "Stay ahead of expiries and renewals before they become urgent.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your records are scoped to your account — never shared by default.",
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
          className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(70%_55%_at_12%_-5%,rgba(20,184,166,0.28),transparent_60%),radial-gradient(60%_55%_at_100%_105%,rgba(37,99,235,0.34),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="relative">
          <Logo size="lg" onDark />
        </div>

        <div className="relative space-y-8">
          <p className="max-w-md font-heading text-[1.7rem] leading-snug font-semibold">
            Bring calm to your documents, deadlines, and renewals.
          </p>
          <ul className="space-y-3">
            {trustPoints.map((point) => {
              const Icon = point.icon;
              return (
                <li
                  key={point.title}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-teal ring-1 ring-white/15">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {point.title}
                    </span>
                    <span className="block text-sm text-white/65">
                      {point.description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative inline-flex items-center gap-2 text-sm text-white/55">
          <Lock className="size-3.5" />
          Built to be trusted with what matters.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 lg:hidden">
          <Logo size="lg" />
        </div>
        {children}
      </main>
    </div>
  );
}
