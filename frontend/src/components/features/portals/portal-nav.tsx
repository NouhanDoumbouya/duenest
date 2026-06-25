// Shared navigation for the B2B portal command center. Every portal surface
// renders this strip so the portal reads as one connected workspace rather than
// a set of separate pages. Review and Reminders are intentionally NOT tabs —
// they are surfaced as actions/queues from the Overview, where the work lives.

import type { ComponentType } from "react";
import Link from "next/link";
import {
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  LayoutTemplate,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type PortalSection =
  | "overview"
  | "cases"
  | "people"
  | "documents"
  | "templates"
  | "settings";

const ITEMS: Array<{
  key: PortalSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
  path: (orgId: number) => string;
}> = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal`,
  },
  {
    key: "cases",
    label: "Cases",
    icon: ClipboardList,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal/cases`,
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal/people`,
  },
  {
    key: "documents",
    label: "Documents",
    icon: FolderTree,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal/documents`,
  },
  {
    key: "templates",
    label: "Templates",
    icon: LayoutTemplate,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal/templates`,
  },
  {
    key: "settings",
    label: "Settings",
    icon: SlidersHorizontal,
    path: (orgId) => `/dashboard/organizations/${orgId}/portal/settings/customization`,
  },
];

/**
 * Horizontal tab strip linking the portal's surfaces. `active` is passed
 * explicitly by each page (the page knows its own section) so the component
 * stays simple, testable, and free of pathname guessing. Scrolls horizontally
 * on small screens so it never wraps or crowds.
 */
export function PortalNav({
  orgId,
  active,
}: {
  orgId: number;
  active: PortalSection;
}) {
  return (
    <nav
      aria-label="Portal sections"
      className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex min-w-max items-center gap-1 border-b border-border px-1">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.path(orgId)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
