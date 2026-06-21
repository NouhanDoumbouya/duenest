import { describe, expect, it } from "vitest";

import { FEATURE_BY_NAV_HREF } from "@/lib/features";
import {
  isSidebarParent,
  NAV_SECTIONS,
  SIDEBAR_GROUPS,
  type SidebarLeaf,
} from "@/lib/navigation";

/** Every leaf href in the sidebar (top-level leaves + collapsible children). */
function allLeafHrefs(): string[] {
  const hrefs: string[] = [];
  for (const group of SIDEBAR_GROUPS) {
    for (const item of group.items) {
      hrefs.push(item.href);
      if (isSidebarParent(item)) {
        for (const child of item.children as SidebarLeaf[]) hrefs.push(child.href);
      }
    }
  }
  return hrefs;
}

describe("dashboard navigation — brand/identity invariants", () => {
  const hrefs = allLeafHrefs();

  it("has no Subscription Radar entry (deprecated finance feature)", () => {
    expect(hrefs.some((h) => h.startsWith("/dashboard/subscriptions"))).toBe(false);
    expect(FEATURE_BY_NAV_HREF["/dashboard/subscriptions"]).toBeUndefined();
    expect(Object.values(FEATURE_BY_NAV_HREF)).not.toContain("subscriptions");
  });

  it("keeps the focused document-platform surfaces", () => {
    expect(hrefs).toContain("/dashboard/vault");
    expect(hrefs).toContain("/dashboard/quick-share"); // SafeSend
    expect(hrefs).toContain("/dashboard/emergency");
    expect(hrefs).toContain("/dashboard/scanner");
  });

  it("labels the renewals surface 'Deadlines & Renewals' (not 'Subscriptions')", () => {
    const planning = NAV_SECTIONS.find((s) => s.key === "planning");
    const labels = planning?.tabs.map((t) => t.label) ?? [];
    expect(labels).toContain("Deadlines & Renewals");
    expect(labels).not.toContain("Subscriptions");
  });

  it("never points a nav item at the deprecated subscriptions route", () => {
    for (const section of NAV_SECTIONS) {
      for (const tab of section.tabs) {
        expect(tab.href.startsWith("/dashboard/subscriptions")).toBe(false);
      }
    }
  });
});
