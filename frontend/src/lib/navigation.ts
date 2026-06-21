// Centralized navigation model for the dashboard.
//
// Two structures live here, both navigation/IA only (no route or backend
// changes):
//
// 1. SIDEBAR_GROUPS — the primary, premium sidebar. Major areas (Vault,
//    Planning) are collapsible parents whose children link directly to existing
//    routes, so users reach Documents/File Inbox/etc. in one click.
// 2. NAV_SECTIONS — metadata for the collapsible parents' *overview* pages
//    (Vault, Planning), which render quick-access cards. The sidebar is curated
//    for fewer clicks; the overview pages stay comprehensive.
//
// All hrefs point at routes that already exist and keep working.

import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  DoorClosed,
  FileText,
  Inbox,
  LayoutDashboard,
  Lock,
  LifeBuoy,
  MessageSquare,
  MessagesSquare,
  Package,
  PenLine,
  QrCode,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Vault,
  Wrench,
  Zap,
} from "lucide-react";

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
  key: "vault" | "planning";
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
        label: "Scan",
        href: "/dashboard/scanner",
        description:
          "Capture a document with your camera, auto-detect edges, and save a clean PDF.",
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
        label: "Deadlines & Renewals",
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
    // Notifications stays reachable via the bell and the Planning overview, but
    // it isn't a sidebar child, so it's omitted here to avoid expanding Planning
    // with no child highlighted.
    memberPrefixes: [
      "/dashboard/planning",
      "/dashboard/attention",
      "/dashboard/reminders",
      "/dashboard/calendar",
      "/dashboard/timeline",
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

// --- Sidebar tree (primary navigation) ---

/** A direct link in the sidebar (top-level item or a collapsible child). */
export interface SidebarLeaf {
  label: string;
  href: string;
  /** Icon for top-level items. Children render without icons (lighter weight). */
  icon?: LucideIcon;
  /** Feature flag key; the item is hidden when the feature is disabled. */
  featureKey?: string;
  /** Active only on an exact path match (used for "… Overview" children). */
  exact?: boolean;
}

/** A collapsible parent: its label/icon navigate to an overview, chevron toggles. */
export interface SidebarParent {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Links it to a NAV_SECTIONS entry for active/expansion across child routes. */
  sectionKey: NavSection["key"];
  children: SidebarLeaf[];
}

export type SidebarItem = SidebarLeaf | SidebarParent;

export interface SidebarGroup {
  heading: string;
  items: SidebarItem[];
}

export function isSidebarParent(item: SidebarItem): item is SidebarParent {
  return "children" in item;
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    heading: "Main",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    heading: "Life admin",
    items: [
      {
        label: "Vault",
        href: "/dashboard/vault",
        icon: Vault,
        sectionKey: "vault",
        children: [
          { label: "Documents", href: "/dashboard/documents", icon: FileText },
          {
            label: "File Inbox",
            href: "/dashboard/files",
            icon: Inbox,
            featureKey: "file_inbox",
          },
          { label: "Scan", href: "/dashboard/scanner", icon: ScanLine },
          { label: "Trash", href: "/dashboard/trash", icon: Trash2 },
        ],
      },
      {
        label: "Planning",
        href: "/dashboard/planning",
        icon: CalendarClock,
        sectionKey: "planning",
        children: [
          { label: "Attention", href: "/dashboard/attention", icon: ShieldAlert },
          { label: "Deadlines & Renewals", href: "/dashboard/reminders", icon: BellRing },
          { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
          { label: "Timeline", href: "/dashboard/timeline", icon: Clock },
        ],
      },
    ],
  },
  {
    heading: "Prepare & share",
    items: [
      { label: "Application Packs", href: "/dashboard/bundles", icon: Package, featureKey: "bundles" },
      {
        label: "SafeSend",
        href: "/dashboard/quick-share",
        icon: QrCode,
        featureKey: "quick_share",
      },
      {
        label: "Shared with me",
        href: "/dashboard/shared-with-me",
        icon: Inbox,
        featureKey: "shared_with_me",
      },
      {
        label: "Document requests",
        href: "/dashboard/requests",
        icon: ClipboardList,
        featureKey: "share_requests",
      },
      {
        label: "Secure rooms",
        href: "/dashboard/share-rooms",
        icon: DoorClosed,
        featureKey: "secure_rooms",
      },
    ],
  },
  {
    heading: "Protect",
    items: [
      {
        label: "Emergency access",
        href: "/dashboard/emergency",
        icon: LifeBuoy,
        featureKey: "emergency_access",
      },
    ],
  },
  {
    heading: "Assistant",
    items: [
      {
        label: "Chat",
        href: "/dashboard/assistant",
        icon: MessagesSquare,
        featureKey: "ai_chat",
      },
      {
        label: "Briefing",
        href: "/dashboard/briefing",
        icon: Zap,
        featureKey: "ai_briefing",
      },
      {
        label: "Ask documents",
        href: "/dashboard/ask",
        icon: Sparkles,
        featureKey: "ai_document_qa",
      },
      {
        label: "Draft",
        href: "/dashboard/draft",
        icon: PenLine,
        featureKey: "ai_document_drafting",
      },
      {
        label: "Pack Copilot",
        href: "/dashboard/pack-copilot",
        icon: Target,
        featureKey: "ai_pack_copilot",
      },
    ],
  },
  {
    heading: "Workspaces",
    items: [
      {
        label: "Organizations",
        href: "/dashboard/organizations",
        icon: Building2,
        featureKey: "organizations",
      },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Trust & security", href: "/dashboard/trust", icon: ShieldCheck },
      { label: "Plan & Billing", href: "/dashboard/settings/billing", icon: CreditCard },
      { label: "Data & privacy", href: "/dashboard/settings/data", icon: Settings },
      { label: "AI & privacy", href: "/dashboard/settings/ai", icon: Lock, featureKey: "ai_features" },
      { label: "Feedback", href: "/dashboard/feedback", icon: MessageSquare, featureKey: "feedback" },
    ],
  },
];

/** Founder-only entry, rendered as its own group when the viewer has access. */
export const FOUNDER_SIDEBAR_ITEM: SidebarLeaf = {
  label: "Founder Console",
  href: "/founder",
  icon: Wrench,
};

/**
 * Whether a sidebar leaf is active for the current location. Handles exact
 * matches, any future query-driven items (via `tabViewParam`), and prefix
 * matches for detail routes (e.g. /dashboard/documents/123 keeps Documents on).
 */
export function isLeafActive(
  pathname: string,
  view: string | null,
  leaf: SidebarLeaf,
): boolean {
  const leafPath = pathOf(leaf.href);
  const leafView = tabViewParam(leaf.href);

  if (leafView) return pathname === leafPath && view === leafView;
  if (leaf.exact) return pathname === leafPath;

  // Plain path/prefix match. No sidebar leaf owns a `view` param anymore (the
  // old Categories item used `?view=categories`), so a stale view query no
  // longer suppresses the Documents item — e.g. /dashboard/documents?view=categories
  // correctly keeps Documents active.
  return pathname === leafPath || pathname.startsWith(`${leafPath}/`);
}
