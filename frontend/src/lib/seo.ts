// Conservative JSON-LD structured data for marketing/SEO pages.
//
// Only facts we can stand behind: Organization, WebSite, BreadcrumbList, and a
// FAQPage that mirrors the VISIBLE FAQ on the page. No ratings, reviews, awards,
// pricing claims, certifications, or invented social profiles (`sameAs`).

import type { UseCase } from "./use-cases";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://certanest.com";

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "CertaNest",
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
} as const;

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "CertaNest",
  url: SITE_URL,
  description:
    "A life admin app for important documents — organize files, track expiry dates and deadlines, prepare application packs, request documents, and share proof securely.",
  publisher: { "@id": `${SITE_URL}/#organization` },
} as const;

/** The @graph for a use-case page: Organization + WebSite + Breadcrumb (+ FAQ). */
export function buildUseCaseJsonLd(useCase: UseCase): object {
  const path = `/use-cases/${useCase.slug}`;
  const graph: object[] = [
    ORGANIZATION,
    WEBSITE,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Use cases", item: `${SITE_URL}/use-cases` },
        { "@type": "ListItem", position: 3, name: useCase.title, item: `${SITE_URL}${path}` },
      ],
    },
  ];
  if (useCase.faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: useCase.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
