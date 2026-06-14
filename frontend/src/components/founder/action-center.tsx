import Link from "next/link";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ActionTone = "danger" | "warn" | "good" | "neutral";

export interface FounderActionItem {
  id: string;
  tone: ActionTone;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
}

const PRIORITY: Record<ActionTone, number> = {
  danger: 0,
  warn: 1,
  neutral: 2,
  good: 3,
};

const chipClass: Record<ActionTone, string> = {
  danger: "bg-destructive/10 text-destructive",
  warn: "bg-brand-amber/10 text-brand-amber",
  good: "bg-brand-success/10 text-brand-success",
  neutral: "bg-accent text-accent-foreground",
};

/**
 * A prioritized "what needs attention" panel for the Founder Console overview.
 * It turns raw signals into next-action cards, sorted by severity. Presentational
 * only — callers compute the items from dashboard data.
 */
export function FounderActionCenter({ items }: { items: FounderActionItem[] }) {
  const sorted = [...items].sort((a, b) => PRIORITY[a.tone] - PRIORITY[b.tone]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">Needs attention</CardTitle>
        <span className="text-xs text-muted-foreground">
          {sorted.length === 0
            ? "All clear"
            : `${sorted.length} ${sorted.length === 1 ? "item" : "items"}`}
        </span>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-brand-success/30 bg-brand-success/5 px-4 py-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Nothing needs your attention right now.</p>
              <p className="text-xs text-muted-foreground">
                Feedback, errors, security, waitlist, and launch signals are all clear in this range.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {sorted.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg",
                      chipClass[item.tone],
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
