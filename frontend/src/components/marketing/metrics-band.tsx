import { Ban, BellRing, Download, Lock } from "lucide-react";

/**
 * A confident "by the numbers" band, high in the page. Inspired by premium SaaS
 * stat strips — but every figure here is an honest product fact (a capability),
 * not a fabricated usage metric. Safe to show during the private beta because
 * nothing claims adoption we can't back up. Server component — no client JS.
 */
const METRICS: {
  icon: typeof Lock;
  value: string;
  label: string;
  sub: string;
}[] = [
  {
    icon: Lock,
    value: "0",
    label: "files exposed until you share",
    sub: "Private by default, encrypted at rest",
  },
  {
    icon: BellRing,
    value: "4",
    label: "reminder windows",
    sub: "7 · 30 · 60 · 90 days before it's due",
  },
  {
    icon: Ban,
    value: "1 tap",
    label: "to revoke any share",
    sub: "Enforced server-side, instantly",
  },
  {
    icon: Download,
    value: "100%",
    label: "yours to export or delete",
    sub: "Anytime — no lock-in",
  },
];

export function MetricsBand() {
  return (
    <section
      aria-label="DueNest by the numbers"
      className="border-b border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-14">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex flex-col items-start gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                  <Icon className="size-4" />
                </span>
                <dd className="font-heading text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                  {m.value}
                </dd>
                <dt className="text-sm font-semibold leading-snug">
                  {m.label}
                </dt>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {m.sub}
                </p>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
