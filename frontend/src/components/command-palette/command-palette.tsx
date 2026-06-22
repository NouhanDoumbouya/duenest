"use client";

// Global command palette (Cmd/Ctrl+K): jump to any area, run a quick action, or
// search your documents and organizations — without leaving the
// keyboard. Navigation/action commands are derived from the canonical sidebar
// model so they never drift from the real routes; search results come from the
// owner-scoped /search/ endpoint.
//
// The dialog only mounts while open, so its initial state is always a clean
// slate (no reset effects). A thin always-mounted wrapper owns the global
// shortcut.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Loader2,
  ScanLine,
  Search,
  Share2,
} from "lucide-react";

import { useFeatures } from "@/components/features/feature-flags-provider";
import { ACCOUNT_NAV, isSidebarParent, SIDEBAR_GROUPS } from "@/lib/navigation";
import { searchWorkspace, type SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: LucideIcon;
  group: "Actions" | "Go to" | "Results";
}

const RESULT_ICON: Record<SearchResult["type"], LucideIcon> = {
  document: FileText,
  organization: Building2,
};

const QUICK_ACTIONS: {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  featureKey?: string;
}[] = [
  { id: "action-add-document", label: "Add document", href: "/dashboard/documents/new", icon: FilePlus2 },
  {
    id: "action-new-share",
    label: "New quick share",
    href: "/dashboard/quick-share/new",
    icon: Share2,
    featureKey: "quick_share",
  },
  { id: "action-scan", label: "Scan a document", href: "/dashboard/scanner", icon: ScanLine },
];

const GROUP_ORDER: Command["group"][] = ["Actions", "Go to", "Results"];

/** Build the navigation + action commands, hiding anything behind a disabled flag. */
function useStaticCommands(): Command[] {
  const features = useFeatures();
  return useMemo(() => {
    const visible = (featureKey?: string) => {
      if (!featureKey) return true;
      const state = features[featureKey];
      return state ? state.enabled : true;
    };

    const actions: Command[] = QUICK_ACTIONS.filter((a) =>
      visible(a.featureKey),
    ).map((a) => ({
      id: a.id,
      label: a.label,
      href: a.href,
      icon: a.icon,
      group: "Actions",
    }));

    const nav: Command[] = [];
    for (const group of SIDEBAR_GROUPS) {
      for (const item of group.items) {
        if (isSidebarParent(item)) {
          nav.push({
            id: `nav-${item.href}`,
            label: item.label,
            href: item.href,
            icon: item.icon,
            group: "Go to",
          });
          for (const child of item.children) {
            if (!visible(child.featureKey)) continue;
            nav.push({
              id: `nav-${child.href}`,
              label: child.label,
              sublabel: item.label,
              href: child.href,
              icon: child.icon ?? item.icon,
              group: "Go to",
            });
          }
        } else if (visible(item.featureKey) && item.icon) {
          nav.push({
            id: `nav-${item.href}`,
            label: item.label,
            href: item.href,
            icon: item.icon,
            group: "Go to",
          });
        }
      }
    }

    // Account/settings destinations live in the avatar menu, not the sidebar —
    // keep them reachable from ⌘K so search coverage is unchanged.
    for (const item of ACCOUNT_NAV) {
      if (!visible(item.featureKey) || !item.icon) continue;
      nav.push({
        id: `nav-${item.href}`,
        label: item.label,
        href: item.href,
        icon: item.icon,
        group: "Go to",
      });
    }

    return [...actions, ...nav];
  }, [features]);
}

/** Thin always-mounted wrapper: owns the Cmd/Ctrl+K shortcut, mounts the dialog. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  if (!open) return null;
  return <PaletteDialog onClose={() => onOpenChange(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const staticCommands = useStaticCommands();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  // Focus the input on open and lock body scroll while the dialog is mounted.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Debounced owner-scoped search. All state updates happen inside async
  // callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchWorkspace(trimmed, controller.signal)
        .then((response) => {
          setResults(response.results);
          setSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
            setSearching(false);
          }
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  // The flat, ordered list of everything currently shown — drives keyboard nav.
  const commands = useMemo(() => {
    const needle = trimmed.toLowerCase();
    const matchedStatic = needle
      ? staticCommands.filter((command) =>
          `${command.label} ${command.sublabel ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : staticCommands;
    const resultCommands: Command[] = trimmed
      ? results.map((result) => ({
          id: `result-${result.type}-${result.id}`,
          label: result.title,
          sublabel: result.subtitle,
          href: result.url,
          icon: RESULT_ICON[result.type],
          group: "Results",
        }))
      : [];
    return [...matchedStatic, ...resultCommands];
  }, [trimmed, staticCommands, results]);

  // Clamp the highlight rather than resetting it via an effect (which the list
  // shrinking could otherwise leave out of bounds).
  const safeIndex = commands.length
    ? Math.min(activeIndex, commands.length - 1)
    : 0;

  const activate = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      onClose();
      router.push(command.href);
    },
    [onClose, router],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          commands.length ? (Math.min(index, commands.length - 1) + 1) % commands.length : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => {
          if (!commands.length) return 0;
          const current = Math.min(index, commands.length - 1);
          return (current - 1 + commands.length) % commands.length;
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        activate(commands[safeIndex]);
      }
    },
    [commands, safeIndex, activate, onClose],
  );

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: commands
      .map((command, index) => ({ command, index }))
      .filter((entry) => entry.command.group === group),
  })).filter((section) => section.items.length > 0);

  const showEmpty = trimmed !== "" && commands.length === 0 && !searching;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 top-[12vh] mx-auto w-[min(40rem,calc(100vw-2rem))]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search and commands"
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documents, organizations, or jump to…"
              aria-label="Search and commands"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searching && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-2">
            {showEmpty ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matches for “{trimmed}”.
              </p>
            ) : (
              grouped.map((section) => (
                <div key={section.group} className="mb-1.5 last:mb-0">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {section.group}
                  </p>
                  <ul>
                    {section.items.map(({ command, index }) => {
                      const Icon = command.icon;
                      const active = index === safeIndex;
                      return (
                        <li key={command.id}>
                          <button
                            type="button"
                            onClick={() => activate(command)}
                            onMouseMove={() => setActiveIndex(index)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-primary/10 text-foreground"
                                : "text-muted-foreground hover:bg-muted/60",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-md border",
                                active
                                  ? "border-primary/20 bg-card text-primary"
                                  : "border-border bg-muted/40 text-muted-foreground",
                              )}
                            >
                              <Icon className="size-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {command.label}
                              </span>
                              {command.sublabel && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {command.sublabel}
                                </span>
                              )}
                            </span>
                            {active && (
                              <CornerDownLeft
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-sans">↑</kbd>
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-sans">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-sans">esc</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
