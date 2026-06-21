"use client";

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
  /** Optional trailing count (e.g. number of items in a smart view). */
  count?: number;
  disabled?: boolean;
}

/**
 * Shared underlined tab navigation. Controlled: the parent owns the active key
 * (and typically mirrors it in the URL) so refresh and deep links work.
 *
 * Accessibility: implements the WAI-ARIA tabs pattern — a roving tabindex with
 * Arrow / Home / End keyboard navigation. When the tabs control sibling panels,
 * pass `idBase` and give each panel `id={`${idBase}-panel-${key}`}` plus
 * `aria-labelledby={`${idBase}-tab-${key}`}` so screen readers link them.
 */
export function Tabs({
  tabs,
  active,
  onSelect,
  ariaLabel,
  idBase,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  idBase?: string;
  className?: string;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const firstEnabled = tabs.findIndex((t) => !t.disabled);
  const lastEnabled = tabs.map((t) => !t.disabled).lastIndexOf(true);

  function move(from: number, dir: 1 | -1): number {
    const n = tabs.length;
    for (let step = 0; step < n; step++) {
      const i = (from + dir * (step + 1) + n * (step + 1)) % n;
      if (!tabs[i]?.disabled) return i;
    }
    return from;
  }

  function focusAndSelect(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    tabRefs.current[index]?.focus();
    onSelect(tab.key);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let target: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = move(index, -1);
        break;
      case "Home":
        target = firstEnabled;
        break;
      case "End":
        target = lastEnabled;
        break;
      default:
        return;
    }
    if (target !== null && target >= 0) {
      e.preventDefault();
      focusAndSelect(target);
    }
  }

  return (
    <div className={cn("border-b border-border", className)}>
      <nav
        role="tablist"
        aria-label={ariaLabel}
        className="-mb-px flex gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={idBase ? `${idBase}-tab-${tab.key}` : undefined}
              aria-selected={selected}
              aria-controls={
                idBase ? `${idBase}-panel-${tab.key}` : undefined
              }
              aria-disabled={tab.disabled || undefined}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onSelect(tab.key)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:bg-muted/60",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {Icon && <Icon className="size-4" />}
              {tab.label}
              {typeof tab.count === "number" && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.7rem] leading-none font-medium",
                    selected
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
