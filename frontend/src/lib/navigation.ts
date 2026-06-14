// Centralized navigation model for the dashboard.
//
// The sidebar (dashboard-shell) and the contextual sub-nav (section-tabs) both
// read from here so grouping, labels, and active state never drift apart.
//
// This file is intentionally about *navigation/IA only*. It does not change any
// route, page, or backend model. Grouped "sections" (Vault, Planning, Sharing)
// are conceptual homes whose tabs link to the existing, still-working routes.

/** A single tab inside a grouped section's sub-nav. */
export interface SectionTab {
  label: string;
  href: string;
  /** Short explanation shown on the section overview page. */
  description?: string;
  /**
   * Feature flag key (matches the backend feature map). When set, the tab is
   * hidden if the feature is disabled so users never reach a paused page.
   */
  featureKey?: string;
}

/** A grouped area of the product that owns several existing routes. */
export interface NavSection {
  /** Stable key, also used as the sidebar item identifier. */
  key: "vault" | "planning" | "sharing";
  /** Sidebar label. */
  label: string;
  /** The section overview route the sidebar item points at. */
  basePath: string;
  /** One-line subtitle for the overview page header. */
  description: string;
  /** Sub-nav tabs. The first is always the overview itself. */
  tabs: SectionTab[];
  /**
   * Route prefixes that belong to this section. Used to keep the sidebar item
   * highlighted while the user is on any child route (e.g. /dashboard/documents
   * still lights up "Vault").
   */
  memberPrefixes: string[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "vault",
    label: "Vault",
    basePath: "/dashboard/vault",
    description:
      "Organize important documents, uploaded files, categories, and trash from one private workspace.",
    tabs: [
      { label: "Overview", href: "/dashboard/vault" },
      {
        label: "Documents",
        href: "/dashboard/documents",
        description:
          "Meaningful life records like passports, visas, certificates, insurance cards, and transcripts.",
      },
      {
        label: "File Inbox",
        href: "/dashboard/files",
        featureKey: "file_inbox",
        description:
          "Upload files quickly, then link them to documents, checklists, bundles, or shares.",
      },
      {
        label: "Categories",
        href: "/dashboard/documents?view=categories",
        description:
          "Browse documents by category such as Identity, Immigration, Education, Health, or Finance.",
      },
      {
        label: "Trash",
        href: "/dashboard/trash",
        description: "Recently removed documents and files you can restore.",
      },
    ],
    memberPrefixes: [
      "/dashboard/vault",
      "/dashboard/documents",
      "/dashboard/files",
      "/dashboard/trash",
    ],
  },
  {
    key: "planning",
    label: "Planning",
    basePath: "/dashboard/planning",
    description:
      "Track what needs attention, upcoming reminders, notifications, calendar events, and timeline activity.",
    tabs: [
      { label: "Overview", href: "/dashboard/planning" },
      {
        label: "Attention",
        href: "/dashboard/attention",
        description: "Urgent items and gaps that may already be blocking you.",
      },
      {
        label: "Reminders",
        href: "/dashboard/reminders",
        description: "Renewal and deadline reminders you've scheduled.",
      },
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        featureKey: "notification_center",
        description: "Everything DueNest has flagged for you, in one place.",
      },
      {
        label: "Calendar",
        href: "/dashboard/calendar",
        description: "What happens on which date.",
      },
      {
        label: "Timeline",
        href: "/dashboard/timeline",
        description: "What to handle first, and what happened over time.",
      },
    ],
    memberPrefixes: [
      "/dashboard/planning",
      "/dashboard/attention",
      "/dashboard/reminders",
      "/dashboard/notifications",
      "/dashboard/calendar",
      "/dashboard/timeline",
    ],
  },
  {
    key: "sharing",
    label: "Sharing",
    basePath: "/dashboard/sharing",
    description:
      "Send selected documents, manage shared access, and review items shared with you.",
    tabs: [
      { label: "Overview", href: "/dashboard/sharing" },
      {
        label: "Send",
        href: "/dashboard/quick-share/new",
        featureKey: "quick_share",
        description:
          "Create secure links, QR shares, or DueNest codes for selected documents.",
      },
      {
        label: "Shared by me",
        href: "/dashboard/quick-share",
        featureKey: "quick_share",
        description: "Manage the access you've sent and revoke it anytime.",
      },
      {
        label: "Shared with me",
        href: "/dashboard/shared-with-me",
        featureKey: "shared_with_me",
        description: "View access others have granted to you.",
      },
      {
        label: "Secure rooms",
        href: "/dashboard/share-rooms",
        featureKey: "secure_rooms",
        description:
          "Create structured temporary spaces for sensitive document exchange.",
      },
    ],
    memberPrefixes: [
      "/dashboard/sharing",
      "/dashboard/quick-share",
      "/dashboard/shared-with-me",
      "/dashboard/share-rooms",
    ],
  },
];

/** Strip the query string from a tab href for prefix comparisons. */
function pathOf(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

/** The `view` query value a tab targets, if any (e.g. Categories → "categories"). */
export function tabViewParam(href: string): string | null {
  const q = href.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(href.slice(q + 1)).get("view");
}

/** Find the section that owns the given pathname, if any. */
export function getSectionForPath(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) =>
    section.memberPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ),
  );
}

/** True when the sidebar item for a section should appear active. */
export function isSectionActive(pathname: string, key: NavSection["key"]) {
  return getSectionForPath(pathname)?.key === key;
}

/**
 * Pick the active tab for the current location using longest-prefix matching,
 * with a special case for query-driven tabs like Categories (?view=categories).
 *
 * Returns the href of the active tab, or null if none match.
 */
export function activeTabHref(
  section: NavSection,
  pathname: string,
  view: string | null,
): string | null {
  // Query-driven tabs win when their view matches exactly.
  for (const tab of section.tabs) {
    const tabView = tabViewParam(tab.href);
    if (tabView && tabView === view && pathOf(tab.href) === pathname) {
      return tab.href;
    }
  }

  // Otherwise, longest matching path prefix wins. Skip query tabs (handled
  // above) and skip any plain tab matching the same path when a view is set
  // (so /documents?view=categories doesn't also light the Documents tab).
  let best: string | null = null;
  let bestLen = -1;
  for (const tab of section.tabs) {
    if (tabViewParam(tab.href)) continue;
    const tabPath = pathOf(tab.href);
    const matches = pathname === tabPath || pathname.startsWith(`${tabPath}/`);
    if (!matches) continue;
    if (view && tabPath === pathname) continue;
    if (tabPath.length > bestLen) {
      best = tab.href;
      bestLen = tabPath.length;
    }
  }
  return best;
}
