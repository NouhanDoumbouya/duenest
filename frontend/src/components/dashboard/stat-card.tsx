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
    <Card className="transition-shadow hover:shadow-md hover:shadow-foreground/5">
      <CardContent className="py-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground">{stat.label}</span>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              toneClasses[stat.tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 font-heading text-3xl font-semibold tracking-tight">
          {stat.value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{stat.hint}</p>
      </CardContent>
    </Card>
  );
}
