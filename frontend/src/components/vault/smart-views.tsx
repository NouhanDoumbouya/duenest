"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CalendarClock,
  CircleAlert,
  Eye,
  Pin,
  Send,
  type LucideIcon,
} from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDocuments } from "@/lib/documents";
import type { DocumentListParams } from "@/types/documents";

/**
 * Smart Views: automatic, state-based views of the Vault. Each view maps to a
 * real, existing document filter — counts are fetched live (page_size:1 reads
 * the total), and the card links into the pre-filtered documents list via the
 * `?quick=` param the list already understands. No AI, no fabricated state.
 */
interface SmartView {
  /** The `?quick=` value the documents list understands. */
  quick: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Filter params used only to read an accurate count. */
  params: DocumentListParams;
  /** Urgent views get a warm accent; the rest stay calm/neutral. */
  urgent?: boolean;
}

const SMART_VIEWS: SmartView[] = [
  {
    quick: "expiring_soon",
    label: "Expiring soon",
    description: "Documents with deadlines coming up.",
    icon: CalendarClock,
    params: { computed_status: "expiring_soon" },
    urgent: true,
  },
  {
    quick: "expired",
    label: "Expired",
    description: "Documents past their expiry date.",
    icon: CircleAlert,
    params: { computed_status: "expired" },
    urgent: true,
  },
  {
    quick: "needs_attention",
    label: "Needs review",
    description: "Items with a gap that may need a look.",
    icon: Eye,
    params: { needs_attention: true },
  },
  {
    quick: "shared",
    label: "Shared",
    description: "Documents you've shared before.",
    icon: Send,
    params: { shared: true },
  },
  {
    quick: "pinned",
    label: "Pinned",
    description: "Documents you've pinned for quick access.",
    icon: Pin,
    params: { pinned: true },
  },
  {
    quick: "archived",
    label: "Archived",
    description: "Out of active views, still in your Vault.",
    icon: Archive,
    params: { computed_status: "archived" },
  },
];

export function SmartViews() {
  // null = loading; a missing key = its count failed to load (count hidden).
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled(
      SMART_VIEWS.map((view) => getDocuments({ ...view.params, page_size: 1 })),
    ).then((results) => {
      if (!active) return;
      const next: Record<string, number> = {};
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          next[SMART_VIEWS[i].quick] = result.value.count;
        }
      });
      setCounts(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SectionCard
      title="Smart Views"
      description="Automatic views based on status and deadlines."
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SMART_VIEWS.map((view) => {
          const Icon = view.icon;
          const count = counts?.[view.quick];
          return (
            <Link
              key={view.quick}
              href={`/dashboard/documents?quick=${view.quick}`}
              className="group flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={
                  view.urgent
                    ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/15 text-brand-amber"
                    : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                }
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{view.label}</span>
                  {counts === null ? (
                    <Skeleton className="h-4 w-6" />
                  ) : count !== undefined ? (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {view.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
