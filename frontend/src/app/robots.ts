import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://certanest.com";

// Allow crawling of public marketing pages; keep private app areas and
// token-gated routes out of search indexes. Documents are private — none of the
// authenticated or share/request/emergency surfaces should ever be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/founder",
        "/api",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/verify",
        "/share",
        "/quick-share",
        "/rooms",
        "/request",
        "/invite",
        "/org-invite",
        "/org-request",
        "/org-room",
        "/emergency",
        "/offline",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
