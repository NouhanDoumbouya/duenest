import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { USE_CASES } from "@/lib/use-cases";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("includes the homepage and every use-case page", () => {
    expect(urls.some((u) => u.endsWith("/use-cases"))).toBe(true);
    for (const u of USE_CASES) {
      expect(urls.some((url) => url.endsWith(`/use-cases/${u.slug}`))).toBe(true);
    }
    // Homepage present with top priority.
    const home = entries.find((e) => /https?:\/\/[^/]+$/.test(e.url));
    expect(home?.priority).toBe(1);
  });

  it("never lists private app areas", () => {
    for (const u of urls) {
      expect(u).not.toMatch(/\/dashboard|\/founder|\/quick-share\/|\/emergency\//);
    }
  });
});

describe("robots", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;

  it("disallows private surfaces and points at the sitemap", () => {
    const disallow = (rule?.disallow ?? []) as string[];
    expect(disallow).toContain("/dashboard");
    expect(disallow).toContain("/founder");
    expect(disallow).toContain("/api");
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
