"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useFeatures } from "@/components/features/feature-flags-provider";
import { activeTabHref, getSectionForPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Contextual sub-navigation rendered above page content for grouped areas
 * (Vault, Planning, Sharing). It links to the existing routes that make up the
 * section, so old URLs keep working while users get a single, clear home.
 *
 * Returns null on routes that don't belong to a grouped section, so standalone
 * pages (Overview, Subscriptions, Bundles, etc.) are unaffected.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const features = useFeatures();

  const section = getSectionForPath(pathname);
  if (!section) return null;

  const view = searchParams.get("view");
  const active = activeTabHref(section, pathname, view);

  const tabs = section.tabs.filter((tab) => {
    if (!tab.featureKey) return true;
    const state = features[tab.featureKey];
    return state ? state.enabled : true;
  });

  // Nothing meaningful to show (e.g. every feature in the section is paused).
  if (tabs.length <= 1) return null;

  return (
    <nav
      aria-label={`${section.label} sections`}
      className="-mx-1 mb-6 flex items-center gap-1 overflow-x-auto border-b border-border pb-px"
    >
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-teal" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
