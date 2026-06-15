"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { useFeatures } from "@/components/features/feature-flags-provider";
import type { FeatureState } from "@/lib/features";
import {
  FOUNDER_SIDEBAR_ITEM,
  isLeafActive,
  isSectionActive,
  isSidebarParent,
  SIDEBAR_GROUPS,
  type SidebarLeaf,
  type SidebarParent,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "duenest:sidebar:open";

function leafVisible(leaf: SidebarLeaf, features: Record<string, FeatureState>) {
  if (!leaf.featureKey) return true;
  const state = features[leaf.featureKey];
  return state ? state.enabled : true;
}

function LeafLink({
  leaf,
  active,
  variant,
  onNavigate,
}: {
  leaf: SidebarLeaf;
  active: boolean;
  variant: "top" | "child";
  onNavigate?: () => void;
}) {
  const Icon = leaf.icon;
  return (
    <Link
      href={leaf.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        variant === "top"
          ? "px-3 py-2 font-medium"
          : "px-3 py-2 text-[0.83rem]",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-foreground/70" />
      )}
      {Icon && (
        <Icon
          className={cn(
            "shrink-0 transition-colors",
            variant === "child" ? "size-3.5" : "size-4",
            active
              ? "text-accent-foreground"
              : "text-muted-foreground/80 group-hover:text-foreground",
          )}
        />
      )}
      <span className="flex-1 truncate">{leaf.label}</span>
    </Link>
  );
}

function CollapsibleItem({
  parent,
  pathname,
  view,
  features,
  expanded,
  onToggle,
  onNavigate,
}: {
  parent: SidebarParent;
  pathname: string;
  view: string | null;
  features: Record<string, FeatureState>;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = parent.icon;
  const parentActive = isSectionActive(pathname, parent.sectionKey);
  const childrenId = useId();
  const visibleChildren = parent.children.filter((child) =>
    leafVisible(child, features),
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          "group relative flex items-center rounded-lg pr-1 transition-colors",
          parentActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {parentActive && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-foreground/70" />
        )}
        <Link
          href={parent.href}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              parentActive
                ? "text-accent-foreground"
                : "text-muted-foreground/80 group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate">{parent.label}</span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={childrenId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${parent.label}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </button>
      </div>

      {expanded && (
        <div
          id={childrenId}
          className="ml-[1.15rem] flex flex-col gap-0.5 border-l border-border/70 pl-2"
        >
          {visibleChildren.map((child) => (
            <LeafLink
              key={child.href}
              leaf={child}
              active={isLeafActive(pathname, view, child)}
              variant="child"
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Primary dashboard navigation: grouped sidebar with collapsible parents
 * (Vault, Planning). The active section auto-expands; manual expand/collapse is
 * remembered in localStorage. Browser access is guarded so SSR stays
 * deterministic and hydration matches.
 */
export function SidebarNav({
  hasFounderAccess,
  onNavigate,
}: {
  hasFounderAccess: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const features = useFeatures();

  // Persisted manual expand/collapse preferences, loaded after mount so the
  // server render and first client render match (no hydration mismatch).
  const [userOpen, setUserOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUserOpen(JSON.parse(raw) as Record<string, boolean>);
      }
    } catch {
      // Ignore unavailable or malformed storage.
    }
  }, []);

  const toggle = useCallback((key: string, active: boolean) => {
    setUserOpen((prev) => {
      const current = prev[key] ?? active; // default reflects auto-expanded state
      const next = { ...prev, [key]: !current };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore write failures (e.g. storage disabled).
      }
      return next;
    });
  }, []);

  return (
    <nav
      className="flex flex-1 flex-col gap-5 overflow-y-auto p-3"
      aria-label="Primary"
    >
      {SIDEBAR_GROUPS.map((group) => {
        const items = group.items.filter((item) =>
          isSidebarParent(item) ? true : leafVisible(item, features),
        );
        if (items.length === 0) return null;

        return (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1.5 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
              {group.heading}
            </p>
            {items.map((item) => {
              if (isSidebarParent(item)) {
                const active = isSectionActive(pathname, item.sectionKey);
                const expanded = userOpen[item.sectionKey] ?? active;
                return (
                  <CollapsibleItem
                    key={item.sectionKey}
                    parent={item}
                    pathname={pathname}
                    view={view}
                    features={features}
                    expanded={expanded}
                    onToggle={() => toggle(item.sectionKey, active)}
                    onNavigate={onNavigate}
                  />
                );
              }
              return (
                <LeafLink
                  key={item.href}
                  leaf={item}
                  active={isLeafActive(pathname, view, item)}
                  variant="top"
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        );
      })}

      {hasFounderAccess && (
        <div className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            Founder
          </p>
          <LeafLink
            leaf={FOUNDER_SIDEBAR_ITEM}
            active={pathname.startsWith("/founder")}
            variant="top"
            onNavigate={onNavigate}
          />
        </div>
      )}
    </nav>
  );
}
