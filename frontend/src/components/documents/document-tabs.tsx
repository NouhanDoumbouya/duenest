"use client";

import type { LucideIcon } from "lucide-react";

import { Tabs } from "@/components/ui/tabs";

export interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Underlined tab navigation for the document workspace. Thin wrapper over the
 * shared {@link Tabs} primitive (which adds Arrow/Home/End keyboard support).
 * Controlled: the parent owns the active key (and keeps it in the URL) so
 * refresh and deep links work.
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
    <Tabs
      tabs={tabs}
      active={active}
      onSelect={onSelect}
      ariaLabel="Document sections"
    />
  );
}
