import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}

/** A single feature highlight used in the landing page features grid. */
export function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/5">
      <CardContent className="flex h-full flex-col gap-3 py-2">
        <div className="flex items-center justify-between">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground ring-1 ring-brand-teal/15">
            <Icon className="size-5" />
          </span>
          {feature.badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {feature.badge}
            </span>
          )}
        </div>
        <h3 className="font-heading text-base font-semibold">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {feature.description}
        </p>
      </CardContent>
    </Card>
  );
}
