"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Underlined tab navigation for the document workspace. Controlled: the parent
 * owns the active key (and keeps it in the URL) so refresh and deep links work.
 */
export function DocumentTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="border-b border-border">
      <nav
        role="tablist"
        aria-label="Document sections"
        className="-mb-px flex gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:bg-muted/60",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
