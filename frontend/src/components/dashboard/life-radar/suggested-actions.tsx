"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileUp,
  LifeBuoy,
  Package,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { trackEvent } from "@/lib/analytics";
import { getLifeRadar, suggestedActionHref } from "@/lib/life-radar-api";
import { cn } from "@/lib/utils";
import type { LifeRadarSuggestedAction } from "@/types/life-radar";

const ICONS: Record<string, LucideIcon> = {
  upload_document: FileUp,
  create_reminder: Sparkles,
  create_pack: Package,
  setup_emergency: LifeBuoy,
  view_document: ArrowRight,
  continue_pack: Package,
  upgrade_plan: Sparkles,
};

/**
 * Server-driven "Suggested next steps" from Life Radar V1 — deterministic and
 * plan-aware (e.g. a storage-upgrade nudge for Free users near their limit).
 * Fully additive: renders nothing until it has actions, so it never disrupts
 * the existing dashboard layout if the request is slow or fails.
 */
export function LifeRadarSuggestedActions() {
  const [actions, setActions] = useState<LifeRadarSuggestedAction[]>([]);

  useEffect(() => {
    let active = true;
    getLifeRadar()
      .then((radar) => {
        if (active) setActions(radar.sections.suggested_actions ?? []);
      })
      .catch(() => {
        // Non-fatal: the rest of the dashboard is unaffected.
      });
    return () => {
      active = false;
    };
  }, []);

  if (actions.length === 0) return null;

  return (
    <SectionCard title="Suggested next steps">
      <ul className="flex flex-col gap-2">
        {actions.map((action) => {
          const Icon = ICONS[action.action] ?? ArrowRight;
          const isUpgrade = action.action === "upgrade_plan";
          return (
            <li key={action.key}>
              <Link
                href={suggestedActionHref(action)}
                onClick={() =>
                  trackEvent("quick_action_used", {
                    metadata: { source: "life_radar", action: action.action },
                  })
                }
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isUpgrade && "border-primary/30 bg-primary/5",
                )}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{action.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
