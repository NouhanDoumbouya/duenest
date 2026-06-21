"use client";

import Link from "next/link";
import {
  LifeBuoy,
  Package,
  Plus,
  Share2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { trackEvent } from "@/lib/analytics";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: "Add document", href: "/dashboard/documents/new", icon: Plus },
  { label: "Review attention", href: "/dashboard/attention", icon: ShieldAlert },
  { label: "Create bundle", href: "/dashboard/bundles/new", icon: Package },
  { label: "SafeSend", href: "/dashboard/quick-share/new", icon: Share2 },
  { label: "Emergency access", href: "/dashboard/emergency", icon: LifeBuoy },
];

export function QuickActionsPanel() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            onClick={() =>
              trackEvent("quick_action_used", {
                metadata: { action: action.label },
              })
            }
            className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-3 py-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="text-xs font-medium">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
