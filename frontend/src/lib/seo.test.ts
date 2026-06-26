import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { buildUseCaseJsonLd } from "@/lib/seo";
import { USE_CASES, buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

const NEW_SLUGS = [
  "client-document-collection",
  "secure-document-sharing",
  "passport-renewal-reminders",
];

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
    expect(disallow).toContain("/request");
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("use-case metadata", () => {
  it("the new SEO pages exist with unique title + canonical", () => {
    for (const slug of NEW_SLUGS) {
      expect(getUseCase(slug)).toBeTruthy();
      const meta = buildUseCaseMetadata(slug);
      expect(meta.alternates?.canonical).toBe(`/use-cases/${slug}`);
      expect(meta.title).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("every page has a unique slug, title, and description", () => {
    const slugs = USE_CASES.map((u) => u.slug);
    const titles = USE_CASES.map((u) => u.metaTitle);
    const descs = USE_CASES.map((u) => u.metaDescription);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });
});

describe("structured data", () => {
  it("is valid JSON with Organization + WebSite + Breadcrumb (+ FAQ when present)", () => {
    const data = buildUseCaseJsonLd(getUseCase("secure-document-sharing")!) as {
      "@graph": { "@type": string }[];
    };
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
    const types = data["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "BreadcrumbList", "FAQPage"]),
    );
  });

  it("omits FAQPage when the page has no visible FAQ", () => {
    const data = buildUseCaseJsonLd(getUseCase("students")!) as {
      "@graph": { "@type": string }[];
    };
    expect(data["@graph"].map((n) => n["@type"])).not.toContain("FAQPage");
  });

  it("FAQ markup matches the visible FAQ exactly", () => {
    const uc = getUseCase("client-document-collection")!;
    const data = buildUseCaseJsonLd(uc) as {
      "@graph": { "@type": string; mainEntity?: { name: string }[] }[];
    };
    const faq = data["@graph"].find((n) => n["@type"] === "FAQPage");
    expect(faq?.mainEntity?.map((q) => q.name)).toEqual(uc.faqs!.map((f) => f.q));
  });
});

describe("honesty", () => {
  it("makes no false security/compliance/verification claims in use-case copy", () => {
    const text = USE_CASES.flatMap((u) => [
      u.metaTitle,
      u.metaDescription,
      u.pain,
      u.solution,
      u.trustNote,
      ...u.workflow,
      ...(u.faqs ?? []).flatMap((f) => [f.q, f.a]),
    ])
      .join(" ")
      .toLowerCase();
    for (const bad of [
      "soc 2",
      "soc2",
      "hipaa",
      "gdpr",
      "bank-level",
      "bank level",
      "military-grade",
      "military grade",
      "google verified",
      "guarantee approval",
      "guaranteed approval",
      "unrestricted",
    ]) {
      expect(text).not.toContain(bad);
    }
  });
});
