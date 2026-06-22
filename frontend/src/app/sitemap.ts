import type { MetadataRoute } from "next";

import { USE_CASES } from "@/lib/use-cases";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://certanest.com";

// Public, indexable marketing/SEO pages only. Private app areas (dashboard,
// founder, auth, token-gated share/request/emergency routes) are intentionally
// excluded here and disallowed in robots.ts.
const STATIC_PATHS = [
  "",
  "/pricing",
  "/security",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/contact",
  "/use-cases",
  "/waitlist",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const paths = [
    ...STATIC_PATHS,
    ...USE_CASES.map((u) => `/use-cases/${u.slug}`),
  ];
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path.startsWith("/use-cases") ? 0.8 : 0.6,
  }));
}
