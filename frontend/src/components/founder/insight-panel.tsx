import type { ComponentType, ReactNode } from "react";
import { Lightbulb } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type InsightTone = "neutral" | "good" | "warn";

const toneDot: Record<InsightTone, string> = {
  neutral: "bg-muted-foreground/50",
  good: "bg-brand-success",
  warn: "bg-brand-amber",
};

export interface FounderInsight {
  tone?: InsightTone;
  text: ReactNode;
}

/**
 * A small, reusable "what this means" panel for founder pages. It turns raw
 * metrics into plain-language, privacy-safe guidance.
 */
export function FounderInsightPanel({
  title = "What this means",
  icon: Icon = Lightbulb,
  insights,
  className,
}: {
  title?: string;
  icon?: ComponentType<{ className?: string }>;
  insights: FounderInsight[];
  className?: string;
}) {
  if (insights.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-brand-amber" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {insights.map((insight, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  toneDot[insight.tone ?? "neutral"],
                )}
              />
              <span className="text-muted-foreground">{insight.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
