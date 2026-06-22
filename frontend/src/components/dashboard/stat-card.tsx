import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "blue" | "teal" | "amber" | "slate";

const toneClasses: Record<StatTone, string> = {
  blue: "bg-primary/10 text-primary",
  teal: "bg-brand-teal/10 text-brand-teal",
  amber: "bg-brand-amber/15 text-brand-amber",
  slate: "bg-muted text-muted-foreground",
};

export interface Stat {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  tone: StatTone;
}

export function StatCard({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {stat.label}
          </span>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              toneClasses[stat.tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-4 font-heading text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
          {stat.value}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{stat.hint}</p>
      </CardContent>
    </Card>
  );
}
