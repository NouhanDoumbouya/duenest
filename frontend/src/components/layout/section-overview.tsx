"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useFeatures } from "@/components/features/feature-flags-provider";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { NAV_SECTIONS, type NavSection } from "@/lib/navigation";

/**
 * Landing page for a grouped section (Vault, Planning, Sharing). It explains the
 * product model and links to each area the section owns. Disabled features are
 * filtered out so users never land on a paused page.
 */
export function SectionOverview({ sectionKey }: { sectionKey: NavSection["key"] }) {
  const features = useFeatures();
  const section = NAV_SECTIONS.find((s) => s.key === sectionKey);

  if (!section) return null;

  const cards = section.tabs.filter((tab) => {
    if (tab.href === section.basePath) return false; // skip the overview tab itself
    if (!tab.featureKey) return true;
    const state = features[tab.featureKey];
    return state ? state.enabled : true;
  });

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title={section.label}
        description={section.description}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-teal/40 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="font-medium">{tab.label}</p>
              {tab.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tab.description}
                </p>
              )}
            </div>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
